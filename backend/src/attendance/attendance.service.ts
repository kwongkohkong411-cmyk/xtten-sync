import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventLogService } from '../events/event-log.service';
import { EMPLOYEE_EVENT_ACTIONS } from '../events/event-actions';
import { EventControlPlaneService } from '../events/event-control-plane.service';
import { ATTENDANCE_RULE } from './attendance-rule';
import { Prisma } from '@prisma/client';

type AttendanceRequestUser = {
  id: string;
  role?: string;
  companyId?: string | null;
};

type AttendanceRequest = {
  user?: AttendanceRequestUser;
};

type AttendanceEventQuery = {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
};

type AttendanceLeaveRow = {
  id: string;
  employeeId: string;
  companyId: string;
  startDate: Date;
  endDate: Date;
  employee: {
    id: string;
    name: string;
    employeeNo: string | null;
    email: string | null;
    department: { id: string; name: string } | null;
  };
};

type AttendanceTimelineEvent = {
  type: 'CHECK_IN' | 'BREAK_OUT' | 'BREAK_IN' | 'CHECK_OUT' | 'AUTO_CHECK_OUT';
  at: Date;
  source?: string;
  autoRepaired?: boolean;
};

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private prisma: PrismaService,
    private readonly eventLogService: EventLogService,
    private readonly controlPlane: EventControlPlaneService,
  ) {}

  private getToday() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private parseDate(value?: string, fallback?: Date) {
    if (!value) return fallback;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed;
  }

  private normalizeDayStart(d: Date) {
    const copy = new Date(d);
    copy.setHours(0, 0, 0, 0);
    return copy;
  }

  private normalizeDayEnd(d: Date) {
    const copy = new Date(d);
    copy.setHours(23, 59, 59, 999);
    return copy;
  }

  private dateKey(d: Date) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private eachDay(start: Date, end: Date) {
    const days: Date[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const max = new Date(end);
    max.setHours(23, 59, 59, 999);
    while (cursor.getTime() <= max.getTime()) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }

  private computeAnomaly(record: {
    checkIn: Date | null;
    checkOut: Date | null;
  }) {
    if (!record.checkIn) {
      return 'MISSING_CHECK_IN';
    }

    if (!record.checkOut) {
      return 'MISSING_CHECK_OUT';
    }

    const [hourText, minuteText] = ATTENDANCE_RULE.LATE_THRESHOLD.split(':');
    const lateHour = Number(hourText || 9);
    const lateMinute = Number(minuteText || 15);
    const lateThreshold = new Date(record.checkIn);
    lateThreshold.setHours(lateHour, lateMinute, 0, 0);
    if (record.checkIn.getTime() > lateThreshold.getTime()) {
      return 'LATE';
    }

    return 'NORMAL';
  }

  private resolveWorkDate(record: { date: Date; checkIn: Date | null }) {
    if (
      ATTENDANCE_RULE.WORK_DATE_STRATEGY === 'CHECK_IN_DATE' &&
      record.checkIn
    ) {
      return this.normalizeDayStart(record.checkIn);
    }

    return this.normalizeDayStart(record.date);
  }

  private toTimelineType(
    action: string,
  ): AttendanceTimelineEvent['type'] | null {
    if (action === EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_CHECKED_IN)
      return 'CHECK_IN';
    if (action === EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_BREAK_OUT)
      return 'BREAK_OUT';
    if (action === EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_BREAK_IN)
      return 'BREAK_IN';
    if (action === EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_CHECKED_OUT)
      return 'CHECK_OUT';
    if (action === EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_AUTO_CHECKED_OUT)
      return 'AUTO_CHECK_OUT';
    return null;
  }

  private getEndOfSameDay(date: Date) {
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);
    return end;
  }

  private getTimelineActions() {
    return [
      EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_CHECKED_IN,
      EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_BREAK_OUT,
      EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_BREAK_IN,
      EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_CHECKED_OUT,
      EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_AUTO_CHECKED_OUT,
    ] as const;
  }

  private mapAuditLogsToTimeline(
    logs: Array<{
      action: string;
      createdAt: Date;
      meta: Prisma.JsonValue | null;
    }>,
  ) {
    return logs
      .map((log) => {
        const type = this.toTimelineType(log.action);
        if (!type) return null;

        const meta = (log.meta || {}) as {
          source?: string;
          autoRepair?: boolean;
        };

        return {
          type,
          at: log.createdAt,
          source: meta.source,
          autoRepaired: Boolean(meta.autoRepair),
        };
      })
      .filter(Boolean) as AttendanceTimelineEvent[];
  }

  private buildFallbackTimeline(record: {
    checkIn: Date | null;
    checkOut: Date | null;
  }) {
    const fallback: AttendanceTimelineEvent[] = [];
    if (record.checkIn) {
      fallback.push({
        type: 'CHECK_IN',
        at: record.checkIn,
        source: 'attendance.fallback',
      });
    }
    if (record.checkOut) {
      fallback.push({
        type: 'CHECK_OUT',
        at: record.checkOut,
        source: 'attendance.fallback',
      });
    }
    return fallback;
  }

  private async getTimelinesForAttendances(
    records: Array<{
      id: string;
      employeeId: string;
      companyId: string;
      date: Date;
      checkIn: Date | null;
      checkOut: Date | null;
    }>,
  ) {
    const timelineByAttendanceId = new Map<string, AttendanceTimelineEvent[]>();

    if (!records.length) {
      return timelineByAttendanceId;
    }

    const attendanceIds = new Set(records.map((record) => record.id));
    const employeeIds = Array.from(
      new Set(records.map((record) => record.employeeId)),
    );
    const companyIds = Array.from(
      new Set(records.map((record) => record.companyId)),
    );

    let minDate = records[0].date;
    let maxDate = records[0].date;

    for (const record of records) {
      if (record.date.getTime() < minDate.getTime()) {
        minDate = record.date;
      }
      if (record.date.getTime() > maxDate.getTime()) {
        maxDate = record.date;
      }
    }

    const logs = await this.prisma.tenantAuditLog.findMany({
      where: {
        companyId: { in: companyIds },
        entityId: { in: employeeIds },
        action: {
          in: [...this.getTimelineActions()],
        },
        createdAt: {
          gte: this.normalizeDayStart(minDate),
          lte: this.getEndOfSameDay(maxDate),
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        action: true,
        createdAt: true,
        afterData: true,
        meta: true,
      },
    });

    const logsByAttendanceId = new Map<
      string,
      Array<{
        action: string;
        createdAt: Date;
        meta: Prisma.JsonValue | null;
      }>
    >();

    for (const log of logs) {
      const afterData = (log.afterData || {}) as { attendanceId?: string };
      const attendanceId = afterData.attendanceId;
      if (!attendanceId || !attendanceIds.has(attendanceId)) {
        continue;
      }

      const bucket = logsByAttendanceId.get(attendanceId) || [];
      bucket.push({
        action: log.action,
        createdAt: log.createdAt,
        meta: log.meta,
      });
      logsByAttendanceId.set(attendanceId, bucket);
    }

    for (const record of records) {
      const mapped = this.mapAuditLogsToTimeline(
        logsByAttendanceId.get(record.id) || [],
      );
      timelineByAttendanceId.set(
        record.id,
        mapped.length ? mapped : this.buildFallbackTimeline(record),
      );
    }

    return timelineByAttendanceId;
  }

  private async getTimelineForAttendance(record: {
    id: string;
    employeeId: string;
    companyId: string;
    date: Date;
    checkIn: Date | null;
    checkOut: Date | null;
  }): Promise<AttendanceTimelineEvent[]> {
    const timelineByAttendanceId = await this.getTimelinesForAttendances([
      record,
    ]);
    return timelineByAttendanceId.get(record.id) || [];
  }

  private computeWorkedHoursFromTimeline(
    checkIn: Date,
    checkOut: Date,
    timeline: AttendanceTimelineEvent[],
  ) {
    let breakOpenAt: Date | null = null;
    let breakMs = 0;
    let unclosedBreak = false;

    for (const item of timeline) {
      if (item.type === 'BREAK_OUT') {
        if (!breakOpenAt) {
          breakOpenAt = item.at;
        }
        continue;
      }

      if (item.type === 'BREAK_IN') {
        if (breakOpenAt) {
          breakMs += Math.max(0, item.at.getTime() - breakOpenAt.getTime());
          breakOpenAt = null;
        }
      }
    }

    if (breakOpenAt) {
      unclosedBreak = true;
      breakMs += Math.max(0, checkOut.getTime() - breakOpenAt.getTime());
    }

    const durationMs = Math.max(
      0,
      checkOut.getTime() - checkIn.getTime() - breakMs,
    );
    const totalHours = Number((durationMs / 3_600_000).toFixed(2));

    return {
      totalHours,
      breakMinutes: Math.round(breakMs / 60_000),
      unclosedBreak,
    };
  }

  private hasOpenBreak(record: {
    breakStart: Date | null;
    breakEnd: Date | null;
  }) {
    return Boolean(record.breakStart && !record.breakEnd);
  }

  private async getTodayAttendanceRecord(employeeId: string) {
    return this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: this.getToday(),
      },
    });
  }

  private async autoRepairOpenAttendances(
    req: AttendanceRequest,
    dateRange: { startDate: Date; endDate: Date },
  ) {
    if (dateRange.endDate.getTime() >= this.getToday().getTime()) {
      return;
    }

    if (await this.controlPlane.shouldPauseAutoRepair()) {
      return;
    }

    const where: Prisma.AttendanceWhereInput = {
      date: {
        gte: dateRange.startDate,
        lte: dateRange.endDate,
      },
      checkIn: { not: null },
      checkOut: null,
    };

    const user = this.requireUser(req);

    if (user.role !== 'SUPER_ADMIN') {
      if (user.companyId) {
        where.companyId = user.companyId;
      } else {
        const employee = await this.getEmployee(user.id);
        where.companyId = employee.companyId;
      }
    }

    const stale = await this.prisma.attendance.findMany({
      where,
      orderBy: { date: 'asc' },
      take: 50,
    });

    for (const row of stale) {
      if (!row.checkIn) continue;

      const dayEnd = this.getEndOfSameDay(row.date);
      const estimatedCheckout = new Date(
        Math.min(dayEnd.getTime(), row.checkIn.getTime() + 9 * 3_600_000),
      );
      const timeline = await this.getTimelineForAttendance(row);
      const worked = this.computeWorkedHoursFromTimeline(
        row.checkIn,
        estimatedCheckout,
        timeline,
      );

      const updated = await this.prisma.attendance.update({
        where: { id: row.id },
        data: {
          checkOut: estimatedCheckout,
          totalHours: worked.totalHours,
          status: 'AUTO_REPAIRED',
        },
      });

      await this.eventLogService.emitEmployeeEvent({
        companyId: row.companyId,
        employeeId: row.employeeId,
        action: EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_AUTO_CHECKED_OUT,
        afterData: {
          attendanceId: updated.id,
          date: updated.date,
          workDate: this.resolveWorkDate({
            date: updated.date,
            checkIn: updated.checkIn,
          }),
          checkIn: updated.checkIn,
          checkOut: updated.checkOut,
          totalHours: updated.totalHours,
          status: updated.status,
          breakMinutes: worked.breakMinutes,
        },
        meta: {
          source: 'attendance.service.autoRepairOpenAttendances',
          autoRepair: true,
          workDateStrategy: ATTENDANCE_RULE.WORK_DATE_STRATEGY,
        },
      });
    }
  }

  private triggerAutoRepairOpenAttendances(
    req: AttendanceRequest,
    dateRange: { startDate: Date; endDate: Date },
  ) {
    void this.autoRepairOpenAttendances(req, dateRange).catch(
      (error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Background auto-repair skipped: ${message}`);
      },
    );
  }

  private async getEmployee(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
    });

    if (!employee) {
      throw new UnauthorizedException('Employee not found');
    }

    return employee;
  }

  private requireUser(req: AttendanceRequest) {
    const user = req.user;
    if (!user?.id) {
      throw new UnauthorizedException();
    }
    return user;
  }

  // =========================
  // CHECK IN
  // =========================
  async checkIn(req: AttendanceRequest) {
    const user = this.requireUser(req);

    const employee = await this.getEmployee(user.id);

    const checkInAt = new Date();
    const workDate = this.resolveWorkDate({
      date: checkInAt,
      checkIn: checkInAt,
    });

    const exist = await this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        date: workDate,
      },
    });

    if (exist?.checkIn) {
      throw new BadRequestException('Already checked in');
    }

    const created = await this.prisma.attendance.create({
      data: {
        employeeId: employee.id,
        companyId: employee.companyId,
        date: workDate,
        checkIn: checkInAt,
        status: 'PRESENT',
      },
    });

    await this.eventLogService.emitEmployeeEvent({
      companyId: employee.companyId,
      actorId: user.id,
      employeeId: employee.id,
      action: EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_CHECKED_IN,
      afterData: {
        attendanceId: created.id,
        date: created.date,
        workDate,
        checkIn: created.checkIn,
        status: created.status,
      },
      meta: {
        source: 'attendance.service.checkIn',
        workDateStrategy: ATTENDANCE_RULE.WORK_DATE_STRATEGY,
      },
    });

    return created;
  }

  // =========================
  // CHECK OUT
  // =========================
  async checkOut(req: AttendanceRequest, id: string) {
    const user = this.requireUser(req);
    const employee = await this.getEmployee(user.id);

    const record = await this.prisma.attendance.findUnique({
      where: { id },
    });

    if (!record || record.employeeId !== employee.id) {
      throw new NotFoundException('Attendance record not found');
    }

    if (!record.checkIn) {
      throw new BadRequestException('Cannot check out without checking in');
    }

    if (record.checkOut) {
      throw new BadRequestException('Already checked out');
    }

    if (this.hasOpenBreak(record)) {
      // Allow check-out, but mark anomaly in timeline computation.
    }

    const now = new Date();
    const timeline = await this.getTimelineForAttendance(record);
    const worked = this.computeWorkedHoursFromTimeline(
      record.checkIn,
      now,
      timeline,
    );

    const updated = await this.prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkOut: now,
        totalHours: worked.totalHours,
      },
    });

    await this.eventLogService.emitEmployeeEvent({
      companyId: employee.companyId,
      actorId: user.id,
      employeeId: employee.id,
      action: EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_CHECKED_OUT,
      afterData: {
        attendanceId: updated.id,
        date: updated.date,
        workDate: this.resolveWorkDate({
          date: updated.date,
          checkIn: updated.checkIn,
        }),
        checkIn: updated.checkIn,
        checkOut: updated.checkOut,
        totalHours: updated.totalHours,
        status: updated.status,
        breakMinutes: worked.breakMinutes,
      },
      meta: {
        source: 'attendance.service.checkOut',
        anomaly: worked.unclosedBreak ? 'MISSING_BREAK_IN' : 'NORMAL',
        workDateStrategy: ATTENDANCE_RULE.WORK_DATE_STRATEGY,
      },
    });

    return updated;
  }

  async breakOut(req: AttendanceRequest) {
    const user = this.requireUser(req);
    const employee = await this.getEmployee(user.id);
    const record = await this.getTodayAttendanceRecord(employee.id);

    if (!record || !record.checkIn) {
      throw new BadRequestException('Cannot break out before check in');
    }

    if (record.checkOut) {
      throw new BadRequestException('Cannot break out after check out');
    }

    if (this.hasOpenBreak(record)) {
      throw new BadRequestException('Break already started');
    }

    const now = new Date();
    await this.prisma.attendance.update({
      where: { id: record.id },
      data: {
        breakStart: now,
        breakEnd: null,
      },
    });

    await this.eventLogService.emitEmployeeEvent({
      companyId: employee.companyId,
      actorId: user.id,
      employeeId: employee.id,
      action: EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_BREAK_OUT,
      afterData: {
        attendanceId: record.id,
        date: record.date,
        workDate: this.resolveWorkDate({
          date: record.date,
          checkIn: record.checkIn,
        }),
        breakStart: now,
      },
      meta: {
        source: 'attendance.service.breakOut',
        workDateStrategy: ATTENDANCE_RULE.WORK_DATE_STRATEGY,
      },
    });

    return { ok: true, attendanceId: record.id, breakStart: now };
  }

  async breakIn(req: AttendanceRequest) {
    const user = this.requireUser(req);
    const employee = await this.getEmployee(user.id);
    const record = await this.getTodayAttendanceRecord(employee.id);

    if (!record || !record.checkIn) {
      throw new BadRequestException('Cannot break in before check in');
    }

    if (record.checkOut) {
      throw new BadRequestException('Cannot break in after check out');
    }

    if (!this.hasOpenBreak(record)) {
      throw new BadRequestException('No open break to resume');
    }

    const now = new Date();
    await this.prisma.attendance.update({
      where: { id: record.id },
      data: {
        breakEnd: now,
      },
    });

    await this.eventLogService.emitEmployeeEvent({
      companyId: employee.companyId,
      actorId: user.id,
      employeeId: employee.id,
      action: EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_BREAK_IN,
      afterData: {
        attendanceId: record.id,
        date: record.date,
        workDate: this.resolveWorkDate({
          date: record.date,
          checkIn: record.checkIn,
        }),
        breakEnd: now,
      },
      meta: {
        source: 'attendance.service.breakIn',
        workDateStrategy: ATTENDANCE_RULE.WORK_DATE_STRATEGY,
      },
    });

    return { ok: true, attendanceId: record.id, breakEnd: now };
  }

  // =========================
  // TODAY
  // =========================
  async today(req: AttendanceRequest) {
    const user = this.requireUser(req);
    const employee = await this.getEmployee(user.id);

    return this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        date: this.getToday(),
      },
    });
  }

  // =========================
  // HISTORY
  // =========================
  async history(req: AttendanceRequest) {
    const user = this.requireUser(req);

    if (user.role === 'SUPER_ADMIN') {
      return this.prisma.attendance.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    const employee = await this.getEmployee(user.id);

    return this.prisma.attendance.findMany({
      where: { employeeId: employee.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  async events(req: AttendanceRequest, query: AttendanceEventQuery) {
    const now = new Date();
    const defaultStart = new Date(now);
    defaultStart.setDate(defaultStart.getDate() - 30);

    const startDate = this.normalizeDayStart(
      this.parseDate(query.startDate, defaultStart) || defaultStart,
    );
    const endDate = this.normalizeDayEnd(
      this.parseDate(query.endDate, now) || now,
    );

    const user = this.requireUser(req);

    this.triggerAutoRepairOpenAttendances(
      { user },
      {
        startDate,
        endDate,
      },
    );

    const visibleCompanyId =
      user.role === 'SUPER_ADMIN'
        ? undefined
        : user.companyId || (await this.getEmployee(user.id)).companyId;

    const baseWhere: Prisma.AttendanceWhereInput = {
      date: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (visibleCompanyId) {
      baseWhere.companyId = visibleCompanyId;
    }

    if (query.employeeId) {
      baseWhere.employeeId = query.employeeId;
    }

    const rows = await this.prisma.attendance.findMany({
      where: baseWhere,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeNo: true,
            email: true,
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
    });

    const events = rows.map((row) => {
      const anomaly = this.computeAnomaly({
        checkIn: row.checkIn,
        checkOut: row.checkOut,
      });

      return {
        id: row.id,
        employeeId: row.employeeId,
        companyId: row.companyId,
        date: row.date,
        workDate: this.resolveWorkDate({
          date: row.date,
          checkIn: row.checkIn,
        }),
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        totalHours: row.totalHours ? Number(row.totalHours) : null,
        status: row.status,
        anomaly,
        isLate: anomaly === 'LATE',
        isMissing:
          anomaly === 'MISSING_CHECK_IN' || anomaly === 'MISSING_CHECK_OUT',
        employee: row.employee,
      };
    });

    const existingByEmployeeDay = new Set(
      events.map(
        (row) =>
          `${row.employeeId}:${this.dateKey(new Date(row.workDate || row.date))}`,
      ),
    );

    const leaveWhere: Prisma.LeaveWhereInput = {
      ...(visibleCompanyId ? { companyId: visibleCompanyId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      status: 'APPROVED',
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    };

    const approvedLeaves = (await this.prisma.leave.findMany({
      where: leaveWhere,
      include: {
        employee: {
          select: {
            id: true,
            name: true,
            employeeNo: true,
            email: true,
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    })) as AttendanceLeaveRow[];

    for (const leave of approvedLeaves) {
      const from = this.normalizeDayStart(leave.startDate);
      const to = this.normalizeDayEnd(leave.endDate);
      const start = from.getTime() < startDate.getTime() ? startDate : from;
      const end = to.getTime() > endDate.getTime() ? endDate : to;

      for (const day of this.eachDay(start, end)) {
        const key = `${leave.employeeId}:${this.dateKey(day)}`;
        if (existingByEmployeeDay.has(key)) continue;

        existingByEmployeeDay.add(key);
        events.push({
          id: `leave-${leave.id}-${this.dateKey(day)}`,
          employeeId: leave.employeeId,
          companyId: leave.companyId,
          date: day,
          workDate: day,
          checkIn: null,
          checkOut: null,
          totalHours: null,
          status: 'LEAVE',
          anomaly: 'NORMAL',
          isLate: false,
          isMissing: false,
          employee: leave.employee,
        });
      }
    }

    const companyIdForHoliday: string | undefined = visibleCompanyId;
    if (companyIdForHoliday) {
      const company = await this.prisma.company.findUnique({
        where: { id: companyIdForHoliday },
        select: { country: true },
      });

      const holidays = await this.prisma.holiday.findMany({
        where: {
          status: 'ACTIVE',
          date: {
            gte: startDate,
            lte: endDate,
          },
          OR: [
            { companyId: companyIdForHoliday },
            ...(company?.country
              ? [{ companyId: null, country: company.country }]
              : []),
          ],
        },
        select: {
          id: true,
          date: true,
        },
      });

      if (holidays.length) {
        const employees = await this.prisma.employee.findMany({
          where: {
            companyId: companyIdForHoliday,
            ...(query.employeeId ? { id: query.employeeId } : {}),
          },
          select: {
            id: true,
            name: true,
            employeeNo: true,
            email: true,
            department: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        });

        for (const holiday of holidays) {
          const day = this.normalizeDayStart(holiday.date);
          const dayKey = this.dateKey(day);

          for (const employee of employees) {
            const key = `${employee.id}:${dayKey}`;
            if (existingByEmployeeDay.has(key)) continue;

            existingByEmployeeDay.add(key);
            events.push({
              id: `holiday-${holiday.id}-${employee.id}-${dayKey}`,
              employeeId: employee.id,
              companyId: companyIdForHoliday,
              date: day,
              workDate: day,
              checkIn: null,
              checkOut: null,
              totalHours: null,
              status: 'HOLIDAY',
              anomaly: 'NORMAL',
              isLate: false,
              isMissing: false,
              employee,
            });
          }
        }
      }
    }

    const timelineByAttendanceId = await this.getTimelinesForAttendances(
      events
        .filter((row) => row.status !== 'LEAVE' && row.status !== 'HOLIDAY')
        .map((row) => ({
          id: row.id,
          employeeId: row.employeeId,
          companyId: row.companyId,
          date: row.date,
          checkIn: row.checkIn,
          checkOut: row.checkOut,
        })),
    );

    const withTimeline = events.map((row) => {
      if (row.status === 'LEAVE') {
        return {
          ...row,
          anomalyList: ['LEAVE'],
          timeline: [],
        };
      }

      if (row.status === 'HOLIDAY') {
        return {
          ...row,
          anomalyList: ['HOLIDAY'],
          timeline: [],
        };
      }

      const timeline = timelineByAttendanceId.get(row.id) || [];

      const anomalyList: string[] = [];
      if (!row.checkIn) anomalyList.push('MISSING_CHECK_IN');
      if (!row.checkOut) anomalyList.push('MISSING_CHECK_OUT');

      if (row.checkIn && row.checkOut) {
        const worked = this.computeWorkedHoursFromTimeline(
          new Date(row.checkIn),
          new Date(row.checkOut),
          timeline,
        );

        row.totalHours = worked.totalHours;
        if (worked.unclosedBreak) {
          anomalyList.push('MISSING_BREAK_IN');
        }
      }

      if (row.isLate) {
        anomalyList.push('LATE');
      }

      return {
        ...row,
        anomalyList,
        timeline: timeline.map((t) => ({
          type: t.type,
          at: t.at,
          source: t.source,
          autoRepaired: t.autoRepaired || false,
        })),
      };
    });

    return {
      meta: {
        startDate,
        endDate,
        lateThreshold: ATTENDANCE_RULE.LATE_THRESHOLD,
        workDateStrategy: ATTENDANCE_RULE.WORK_DATE_STRATEGY,
      },
      events: withTimeline,
    };
  }
}
