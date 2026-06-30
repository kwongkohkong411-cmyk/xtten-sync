import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventLogService } from '../events/event-log.service';
import { EMPLOYEE_EVENT_ACTIONS } from '../events/event-actions';
import { EventControlPlaneService } from '../events/event-control-plane.service';
import { RbacCoreService } from '../auth/rbac-core.service';
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

type ScheduleDecision = {
  lateThreshold: Date;
  scheduledStart: Date;
  scheduledEnd: Date | null;
  source: 'ROSTER_DETAIL' | 'MONTH_ROSTER' | 'DEFAULT';
  startTime: string;
  endTime: string | null;
  lateAfterMinutes: number;
  earlyLeaveToleranceMinutes: number;
  crossDay: boolean;
};

@Injectable()
export class AttendanceService {
  private readonly logger = new Logger(AttendanceService.name);

  constructor(
    private prisma: PrismaService,
    private readonly eventLogService: EventLogService,
    private readonly controlPlane: EventControlPlaneService,
    private readonly rbacCore: RbacCoreService,
  ) {}

  private async resolveAttendanceReadScope(user: AttendanceRequestUser) {
    const context = await this.rbacCore.resolveActorContext({
      id: user.id,
      role: user.role,
      companyId: user.companyId,
    });

    if (context.roleName === 'SUPER_ADMIN') {
      return {
        context,
        companyId: undefined as string | undefined,
        visibleEmployeeIds: null as string[] | null,
      };
    }

    const companyId = context.companyId || (await this.getEmployee(user.id)).companyId;
    const selfEmployee = await this.prisma.employee.findFirst({
      where: {
        userId: context.userId,
        companyId,
      },
      select: { id: true },
    });
    const selfEmployeeId = selfEmployee?.id;

    if (context.roleName === 'EMPLOYEE') {
      return {
        context,
        companyId,
        visibleEmployeeIds: selfEmployeeId ? [selfEmployeeId] : [],
      };
    }

    if (context.roleName === 'TEAM_LEAD') {
      const where: Prisma.EmployeeWhereInput = {
        companyId,
        OR: [
          { userId: context.userId },
          ...(context.managedDepartmentIds.length
            ? [
                {
                  departmentId: {
                    in: context.managedDepartmentIds,
                  },
                },
              ]
            : []),
        ],
      };

      const teamEmployees = await this.prisma.employee.findMany({
        where,
        select: { id: true },
      });

      return {
        context,
        companyId,
        visibleEmployeeIds: teamEmployees.map((row) => row.id),
      };
    }

    return {
      context,
      companyId,
      visibleEmployeeIds: null as string[] | null,
    };
  }

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

  private toMonthKey(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }

  private buildDateFromClock(baseDate: Date, clock: string) {
    const [hourText, minuteText] = clock.split(':');
    const hour = Number(hourText || 0);
    const minute = Number(minuteText || 0);
    const result = new Date(baseDate);
    result.setHours(hour, minute, 0, 0);
    return result;
  }

  private buildThresholdByStartTime(
    baseDate: Date,
    startTime: string,
    lateAfterMinutes: number,
  ) {
    const threshold = this.buildDateFromClock(baseDate, startTime);
    threshold.setMinutes(threshold.getMinutes() + Math.max(0, lateAfterMinutes));
    return threshold;
  }

  private buildScheduledEndDate(
    baseDate: Date,
    startTime: string,
    endTime: string,
    crossDay: boolean,
  ) {
    const startAt = this.buildDateFromClock(baseDate, startTime);
    const endAt = this.buildDateFromClock(baseDate, endTime);
    if (crossDay || endAt.getTime() <= startAt.getTime()) {
      endAt.setDate(endAt.getDate() + 1);
    }
    return endAt;
  }

  private buildDefaultLateThreshold(baseDate: Date) {
    const [hourText, minuteText] = ATTENDANCE_RULE.LATE_THRESHOLD.split(':');
    const hour = Number(hourText || 9);
    const minute = Number(minuteText || 15);

    const threshold = new Date(baseDate);
    threshold.setHours(hour, minute, 0, 0);
    return threshold;
  }

  private minutesToHours(minutes: number | null) {
    if (minutes === null) return null;
    return Number((minutes / 60).toFixed(2));
  }

  private computeLateMinutes(
    checkIn: Date | null,
    schedule: ScheduleDecision,
  ) {
    if (!checkIn) return null;
    if (checkIn.getTime() <= schedule.lateThreshold.getTime()) return 0;
    return Math.max(
      0,
      Math.floor(
        (checkIn.getTime() - schedule.scheduledStart.getTime()) / 60_000,
      ),
    );
  }

  private computeEarlyLeaveMinutes(
    checkOut: Date | null,
    schedule: ScheduleDecision,
  ) {
    if (!checkOut || !schedule.scheduledEnd) return null;

    const earlyLeaveThreshold = new Date(schedule.scheduledEnd);
    earlyLeaveThreshold.setMinutes(
      earlyLeaveThreshold.getMinutes() -
        Math.max(0, schedule.earlyLeaveToleranceMinutes),
    );

    if (checkOut.getTime() >= earlyLeaveThreshold.getTime()) {
      return 0;
    }

    return Math.max(
      0,
      Math.floor((schedule.scheduledEnd.getTime() - checkOut.getTime()) / 60_000),
    );
  }

  private buildDefaultSchedule(baseDate: Date): ScheduleDecision {
    const [hourText, minuteText] = ATTENDANCE_RULE.LATE_THRESHOLD.split(':');
    const startHour = Number(hourText || 9);
    const startMinute = Number(minuteText || 15);
    const startTime = `${String(startHour).padStart(2, '0')}:${String(startMinute).padStart(2, '0')}`;
    const scheduledStart = this.buildDateFromClock(baseDate, startTime);

    return {
      lateThreshold: new Date(scheduledStart),
      scheduledStart,
      scheduledEnd: null,
      source: 'DEFAULT',
      startTime,
      endTime: null,
      lateAfterMinutes: 0,
      earlyLeaveToleranceMinutes: 0,
      crossDay: false,
    };
  }

  private async resolveScheduleForDate(
    employeeId: string,
    companyId: string,
    date: Date,
  ): Promise<ScheduleDecision> {
    const day = this.normalizeDayStart(date);

    // ========================
    // Step 1: Check Employee-specific Roster Detail (highest priority)
    // ========================
    const rosterDetail = await this.prisma.rosterDetail.findFirst({
      where: {
        companyId,
        date: day,
        roster: {
          employeeId,
        },
      },
      select: {
        shiftTemplate: {
          select: {
            startTime: true,
            endTime: true,
            lateAfter: true,
            earlyLeave: true,
            crossDay: true,
          },
        },
      },
    });

    if (rosterDetail?.shiftTemplate?.startTime) {
      const shift = rosterDetail.shiftTemplate;
      const lateAfter = shift.lateAfter ?? 10;
      const earlyLeave = shift.earlyLeave ?? 10;
      const scheduledStart = this.buildDateFromClock(day, shift.startTime);
      return {
        lateThreshold: this.buildThresholdByStartTime(
          day,
          shift.startTime,
          lateAfter,
        ),
        scheduledStart,
        scheduledEnd: this.buildScheduledEndDate(
          day,
          shift.startTime,
          shift.endTime,
          Boolean(shift.crossDay),
        ),
        source: 'ROSTER_DETAIL',
        startTime: shift.startTime,
        endTime: shift.endTime,
        lateAfterMinutes: lateAfter,
        earlyLeaveToleranceMinutes: earlyLeave,
        crossDay: Boolean(shift.crossDay),
      };
    }

    // ========================
    // Step 2: Check Employee-specific Roster (medium priority)
    // ========================
    const employeeRoster = await this.prisma.roster.findFirst({
      where: {
        employeeId,
        companyId,
        month: this.toMonthKey(day),
      },
      select: {
        shift: {
          select: {
            startTime: true,
            endTime: true,
            lateAfter: true,
            earlyLeave: true,
            crossDay: true,
          },
        },
      },
    });

    if (employeeRoster?.shift?.startTime) {
      const shift = employeeRoster.shift;
      const lateAfter = shift.lateAfter ?? 10;
      const earlyLeave = shift.earlyLeave ?? 10;
      const scheduledStart = this.buildDateFromClock(day, shift.startTime);
      return {
        lateThreshold: this.buildThresholdByStartTime(
          day,
          shift.startTime,
          lateAfter,
        ),
        scheduledStart,
        scheduledEnd: this.buildScheduledEndDate(
          day,
          shift.startTime,
          shift.endTime,
          Boolean(shift.crossDay),
        ),
        source: 'MONTH_ROSTER',
        startTime: shift.startTime,
        endTime: shift.endTime,
        lateAfterMinutes: lateAfter,
        earlyLeaveToleranceMinutes: earlyLeave,
        crossDay: Boolean(shift.crossDay),
      };
    }

    // ========================
    // Step 3: Check Team-level Roster (for multi-team support)
    // Get the employee first to find their team
    // ========================
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { workGroupId: true },
    });

    if (employee?.workGroupId) {
      // Check for Team-level roster (employeeId is null in the roster)
      const teamRoster = await this.prisma.roster.findFirst({
        where: {
          employeeId: null,
          workGroupId: employee.workGroupId,
          companyId,
          month: this.toMonthKey(day),
        },
        select: {
          shift: {
            select: {
              startTime: true,
              endTime: true,
              lateAfter: true,
              earlyLeave: true,
              crossDay: true,
            },
          },
        },
      });

      if (teamRoster?.shift?.startTime) {
        const shift = teamRoster.shift;
        const lateAfter = shift.lateAfter ?? 10;
        const earlyLeave = shift.earlyLeave ?? 10;
        const scheduledStart = this.buildDateFromClock(day, shift.startTime);
        return {
          lateThreshold: this.buildThresholdByStartTime(
            day,
            shift.startTime,
            lateAfter,
          ),
          scheduledStart,
          scheduledEnd: this.buildScheduledEndDate(
            day,
            shift.startTime,
            shift.endTime,
            Boolean(shift.crossDay),
          ),
          source: 'MONTH_ROSTER',
          startTime: shift.startTime,
          endTime: shift.endTime,
          lateAfterMinutes: lateAfter,
          earlyLeaveToleranceMinutes: earlyLeave,
          crossDay: Boolean(shift.crossDay),
        };
      }
    }

    // ========================
    // Step 4: Use default schedule (lowest priority)
    // ========================
    return this.buildDefaultSchedule(day);
  }

  private computeAnomaly(
    record: {
      checkIn: Date | null;
      checkOut: Date | null;
    },
    lateThreshold: Date,
  ) {
    if (!record.checkIn) {
      return 'MISSING_CHECK_IN';
    }

    if (!record.checkOut) {
      return 'MISSING_CHECK_OUT';
    }

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

    const context = await this.rbacCore.resolveActorContext({
      id: user.id,
      role: user.role,
      companyId: user.companyId,
    });

    if (context.roleName !== 'SUPER_ADMIN') {
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
  async checkIn(req: AttendanceRequest, overrideClockInAt?: string) {
    const user = this.requireUser(req);

    const employee = await this.getEmployee(user.id);

    const checkInAt = overrideClockInAt
      ? new Date(overrideClockInAt)
      : new Date();
    const schedule = await this.resolveScheduleForDate(
      employee.id,
      employee.companyId,
      checkInAt,
    );
    const lateMinutes = this.computeLateMinutes(checkInAt, schedule) || 0;
    const isLate = lateMinutes > 0;
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
        status: isLate ? 'LATE' : 'PRESENT',
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
        isLate,
        lateMinutes,
        lateHours: this.minutesToHours(lateMinutes),
        scheduledStartTime: schedule.startTime,
        scheduledEndTime: schedule.endTime,
        ruleSource: schedule.source,
      },
      meta: {
        source: 'attendance.service.checkIn',
        workDateStrategy: ATTENDANCE_RULE.WORK_DATE_STRATEGY,
        lateThreshold: schedule.lateThreshold,
        lateRuleSource: schedule.source,
        shiftStartTime: schedule.startTime,
        shiftEndTime: schedule.endTime,
        lateAfterMinutes: schedule.lateAfterMinutes,
        earlyLeaveToleranceMinutes: schedule.earlyLeaveToleranceMinutes,
        crossDay: schedule.crossDay,
      },
    });

    return {
      ...created,
      scheduledStartTime: schedule.startTime,
      scheduledEndTime: schedule.endTime,
      lateMinutes,
      lateHours: this.minutesToHours(lateMinutes),
      earlyLeaveMinutes: 0,
      earlyLeaveHours: 0,
      ruleSource: schedule.source,
    };
  }

  // =========================
  // CHECK OUT
  // =========================
  async checkOut(req: AttendanceRequest, id: string, overrideCheckOutAt?: string) {
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

    const now = overrideCheckOutAt ? new Date(overrideCheckOutAt) : new Date();
    const workDate = this.resolveWorkDate({
      date: record.date,
      checkIn: record.checkIn,
    });
    const schedule = await this.resolveScheduleForDate(
      employee.id,
      employee.companyId,
      workDate,
    );
    const timeline = await this.getTimelineForAttendance(record);
    const worked = this.computeWorkedHoursFromTimeline(
      record.checkIn,
      now,
      timeline,
    );
    const lateMinutes = this.computeLateMinutes(record.checkIn, schedule) || 0;
    const earlyLeaveMinutes = this.computeEarlyLeaveMinutes(now, schedule) || 0;

    // ========================
    // Determine final status based on attendance patterns
    // ========================
    let finalStatus = record.status || 'PRESENT';
    
    if (earlyLeaveMinutes > 0) {
      finalStatus = 'EARLY_LEAVE';
    } else if (lateMinutes > 0) {
      finalStatus = 'LATE';
    } else {
      finalStatus = 'PRESENT';
    }

    const updated = await this.prisma.attendance.update({
      where: { id: record.id },
      data: {
        checkOut: now,
        totalHours: worked.totalHours,
        status: finalStatus,
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
        workDate,
        checkIn: updated.checkIn,
        checkOut: updated.checkOut,
        totalHours: updated.totalHours,
        status: updated.status,
        breakMinutes: worked.breakMinutes,
        lateMinutes,
        lateHours: this.minutesToHours(lateMinutes),
        earlyLeaveMinutes,
        earlyLeaveHours: this.minutesToHours(earlyLeaveMinutes),
        scheduledStartTime: schedule.startTime,
        scheduledEndTime: schedule.endTime,
        ruleSource: schedule.source,
      },
      meta: {
        source: 'attendance.service.checkOut',
        anomaly: worked.unclosedBreak ? 'MISSING_BREAK_IN' : 'NORMAL',
        workDateStrategy: ATTENDANCE_RULE.WORK_DATE_STRATEGY,
        shiftStartTime: schedule.startTime,
        shiftEndTime: schedule.endTime,
        lateThreshold: schedule.lateThreshold,
        lateAfterMinutes: schedule.lateAfterMinutes,
        earlyLeaveToleranceMinutes: schedule.earlyLeaveToleranceMinutes,
        crossDay: schedule.crossDay,
      },
    });

    return {
      ...updated,
      scheduledStartTime: schedule.startTime,
      scheduledEndTime: schedule.endTime,
      lateMinutes,
      lateHours: this.minutesToHours(lateMinutes),
      earlyLeaveMinutes,
      earlyLeaveHours: this.minutesToHours(earlyLeaveMinutes),
      ruleSource: schedule.source,
    };
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
    const today = this.getToday();

    // Try to find existing attendance record
    const attendance = await this.prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        date: today,
      },
    });

    // Get scheduled shift for today
    const schedule = await this.resolveScheduleForDate(
      employee.id,
      employee.companyId,
      today,
    );

    return {
      attendance: attendance || null,
      today,
      scheduled: {
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        lateAfterMinutes: schedule.lateAfterMinutes,
        earlyLeaveToleranceMinutes: schedule.earlyLeaveToleranceMinutes,
        source: schedule.source,
      },
      status: attendance?.status || (schedule.source === 'DEFAULT' ? 'NO_SCHEDULE' : 'NOT_CHECKED_IN'),
    };
  }

  // =========================
  // HISTORY
  // =========================
  async history(req: AttendanceRequest) {
    const user = this.requireUser(req);
    const scope = await this.resolveAttendanceReadScope(user);

    if (scope.context.roleName === 'SUPER_ADMIN') {
      return this.prisma.attendance.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    if (!scope.visibleEmployeeIds || scope.visibleEmployeeIds.length === 0) {
      return [];
    }

    return this.prisma.attendance.findMany({
      where: {
        companyId: scope.companyId,
        employeeId: { in: scope.visibleEmployeeIds },
      },
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

    const scope = await this.resolveAttendanceReadScope(user);

    const baseWhere: Prisma.AttendanceWhereInput = {
      date: {
        gte: startDate,
        lte: endDate,
      },
    };

    if (scope.companyId) {
      baseWhere.companyId = scope.companyId;
    }

    if (query.employeeId) {
      if (
        scope.visibleEmployeeIds &&
        !scope.visibleEmployeeIds.includes(query.employeeId)
      ) {
        throw new ForbiddenException('You can only access attendance in your own scope');
      }
      baseWhere.employeeId = query.employeeId;
    } else if (scope.visibleEmployeeIds) {
      if (scope.visibleEmployeeIds.length === 0) {
        return {
          meta: {
            startDate,
            endDate,
            lateThreshold: ATTENDANCE_RULE.LATE_THRESHOLD,
            lateRule: 'SHIFT_TEMPLATE_START_TIME_PLUS_LATE_AFTER_OR_DEFAULT',
            earlyLeaveRule: 'SHIFT_TEMPLATE_END_TIME_WITH_EARLY_LEAVE_TOLERANCE',
            workDateStrategy: ATTENDANCE_RULE.WORK_DATE_STRATEGY,
          },
          events: [],
        };
      }
      baseWhere.employeeId = {
        in: scope.visibleEmployeeIds,
      };
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

    const scheduleCache = new Map<string, ScheduleDecision>();

    const events: any[] = [];

    for (const row of rows) {
      const workDate = this.resolveWorkDate({
        date: row.date,
        checkIn: row.checkIn,
      });
      const cacheKey = `${row.employeeId}:${this.dateKey(workDate)}`;

      let schedule = scheduleCache.get(cacheKey);
      if (!schedule) {
        schedule = await this.resolveScheduleForDate(
          row.employeeId,
          row.companyId,
          workDate,
        );
        scheduleCache.set(cacheKey, schedule);
      }

      const anomaly = this.computeAnomaly(
        {
          checkIn: row.checkIn,
          checkOut: row.checkOut,
        },
        schedule.lateThreshold,
      );

      const lateMinutes = this.computeLateMinutes(row.checkIn, schedule) || 0;
      const earlyLeaveMinutes =
        this.computeEarlyLeaveMinutes(row.checkOut, schedule) || 0;

      events.push({
        id: row.id,
        employeeId: row.employeeId,
        companyId: row.companyId,
        date: row.date,
        workDate,
        checkIn: row.checkIn,
        checkOut: row.checkOut,
        totalHours: row.totalHours ? Number(row.totalHours) : null,
        status: row.status,
        anomaly,
        isLate: anomaly === 'LATE',
        isMissing:
          anomaly === 'MISSING_CHECK_IN' || anomaly === 'MISSING_CHECK_OUT',
        employee: row.employee,
        lateThreshold: schedule.lateThreshold,
        lateRuleSource: schedule.source,
        scheduledStartTime: schedule.startTime,
        scheduledEndTime: schedule.endTime,
        lateMinutes,
        lateHours: this.minutesToHours(lateMinutes),
        earlyLeaveMinutes,
        earlyLeaveHours: this.minutesToHours(earlyLeaveMinutes),
        ruleSource: schedule.source,
      });
    }

    const existingByEmployeeDay = new Set(
      events.map(
        (row) =>
          `${row.employeeId}:${this.dateKey(new Date(row.workDate || row.date))}`,
      ),
    );

    const leaveWhere: Prisma.LeaveWhereInput = {
      ...(scope.companyId ? { companyId: scope.companyId } : {}),
      ...(query.employeeId
        ? { employeeId: query.employeeId }
        : scope.visibleEmployeeIds
          ? { employeeId: { in: scope.visibleEmployeeIds } }
          : {}),
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

    const leaveDaySet = new Set<string>();

    for (const leave of approvedLeaves) {
      const from = this.normalizeDayStart(leave.startDate);
      const to = this.normalizeDayEnd(leave.endDate);
      const start = from.getTime() < startDate.getTime() ? startDate : from;
      const end = to.getTime() > endDate.getTime() ? endDate : to;

      for (const day of this.eachDay(start, end)) {
        const key = `${leave.employeeId}:${this.dateKey(day)}`;
        leaveDaySet.add(key);
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
          scheduledStartTime: null,
          scheduledEndTime: null,
          lateMinutes: 0,
          lateHours: 0,
          earlyLeaveMinutes: 0,
          earlyLeaveHours: 0,
          ruleSource: 'DEFAULT',
        });
      }
    }

    const companyIdForHoliday: string | undefined = scope.companyId;
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
              scheduledStartTime: null,
              scheduledEndTime: null,
              lateMinutes: 0,
              lateHours: 0,
              earlyLeaveMinutes: 0,
              earlyLeaveHours: 0,
              ruleSource: 'DEFAULT',
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
      const workDateKey = this.dateKey(new Date(row.workDate || row.date));
      const leaveMatched = leaveDaySet.has(`${row.employeeId}:${workDateKey}`);

      if (leaveMatched || row.status === 'LEAVE') {
        return {
          ...row,
          status: 'LEAVE',
          anomaly: 'NORMAL',
          isLate: false,
          isMissing: false,
          lateMinutes: 0,
          lateHours: 0,
          earlyLeaveMinutes: 0,
          earlyLeaveHours: 0,
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

      if ((row.earlyLeaveMinutes || 0) > 0) {
        anomalyList.push('EARLY_LEAVE');
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
        lateRule: 'SHIFT_TEMPLATE_START_TIME_PLUS_LATE_AFTER_OR_DEFAULT',
        earlyLeaveRule: 'SHIFT_TEMPLATE_END_TIME_WITH_EARLY_LEAVE_TOLERANCE',
        workDateStrategy: ATTENDANCE_RULE.WORK_DATE_STRATEGY,
      },
      events: withTimeline,
    };
  }

  // =========================
  // DETECT ABSENTS (缺勤检测)
  // =========================
  async detectAbsents(
    req: AttendanceRequest,
    query: { startDate?: string; endDate?: string },
  ) {
    const user = this.requireUser(req);
    const scope = await this.resolveAttendanceReadScope(user);

    const today = this.getToday();
    const start = this.parseDate(query.startDate, today) || today;
    const end = this.parseDate(query.endDate, today) || today;

    if (!scope.visibleEmployeeIds && scope.context.roleName !== 'SUPER_ADMIN') {
      return { absents: [], count: 0, message: 'No visible employees' };
    }

    // Get all days in the range
    const allDays = this.eachDay(start, end);

    // Find rosters in the date range
    const rosters = await this.prisma.roster.findMany({
      where: {
        ...(scope.companyId ? { companyId: scope.companyId } : {}),
        month: {
          in: allDays.map((d) => this.toMonthKey(d)),
        },
      },
      select: {
        id: true,
        month: true,
        employeeId: true,
        workGroupId: true,
        companyId: true,
        shift: {
          select: {
            id: true,
            startTime: true,
          },
        },
        workGroup: {
          select: {
            id: true,
            name: true,
            employees: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    const absents: any[] = [];
    const processedDates = new Set<string>();

    for (const roster of rosters) {
      // For Employee-level rosters
      if (roster.employeeId) {
        const affectedEmployeeIds = [roster.employeeId];

        for (const employeeId of affectedEmployeeIds) {
          for (const day of allDays) {
            const dateKey = `${this.dateKey(day)}:${employeeId}`;
            if (processedDates.has(dateKey)) continue;
            processedDates.add(dateKey);

            // Check if attendance record exists
            const attendance = await this.prisma.attendance.findFirst({
              where: {
                employeeId,
                date: day,
              },
              select: { id: true, checkIn: true },
            });

            if (!attendance || !attendance.checkIn) {
              absents.push({
                employeeId,
                date: day,
                rosterType: 'EMPLOYEE_LEVEL',
                shiftStartTime: roster.shift.startTime,
              });
            }
          }
        }
      } else {
        // For Team-level rosters - all team members are affected
        const affectedEmployeeIds = roster.workGroup.employees.map((e) => e.id);

        for (const employeeId of affectedEmployeeIds) {
          // Filter by visible employees if not SUPER_ADMIN
          if (
            scope.visibleEmployeeIds !== null &&
            !scope.visibleEmployeeIds.includes(employeeId)
          ) {
            continue;
          }

          for (const day of allDays) {
            const dateKey = `${this.dateKey(day)}:${employeeId}`;
            if (processedDates.has(dateKey)) continue;
            processedDates.add(dateKey);

            // Check if attendance record exists
            const attendance = await this.prisma.attendance.findFirst({
              where: {
                employeeId,
                date: day,
              },
              select: { id: true, checkIn: true },
            });

            if (!attendance || !attendance.checkIn) {
              absents.push({
                employeeId,
                employeeName: roster.workGroup.employees.find(
                  (e) => e.id === employeeId,
                )?.name,
                date: day,
                rosterType: 'TEAM_LEVEL',
                teamName: roster.workGroup.name,
                shiftStartTime: roster.shift.startTime,
              });
            }
          }
        }
      }
    }

    return {
      count: absents.length,
      absents,
      dateRange: { start, end },
      message: `Found ${absents.length} absence record(s) for the date range`,
    };
  }
}
