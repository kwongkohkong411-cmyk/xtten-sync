import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EMPLOYEE_EVENT_ACTIONS } from '../events/event-actions';
import { ATTENDANCE_RULE } from '../attendance/attendance-rule';
import ExcelJS from 'exceljs';
import { BaseRbacService } from '../auth/base-rbac.service';
import { RbacCoreService } from '../auth/rbac-core.service';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

export enum AttendanceStatus {
  ON_TIME = 'ON_TIME',
  LATE = 'LATE',
  LEAVE = 'LEAVE',
  HOLIDAY = 'HOLIDAY',
  ABSENT = 'ABSENT',
  MISSING = 'MISSING',
}

type AttendanceSnapshot = {
  employeeId: string;
  workDate: string;
  checkIn?: Date;
  checkOut?: Date;
  breakOut?: Date;
  breakIn?: Date;
  totalHours?: number;
  status: AttendanceStatus;
  anomalyCount: number;
};

type EmployeeStatusRow = {
  employeeId: string;
  companyId: string;
  username: string;
  name: string;
  workDate: string;
  status: AttendanceStatus;
  isHoliday: boolean;
  checkIn?: Date;
  breakOut?: Date;
  breakIn?: Date;
  checkOut?: Date;
  totalHours?: number;
  totalHoursDecimal?: number;
  totalHoursDuration?: string;
  otHoursDecimal?: number;
};

type DailyDetailItem = {
  employeeId: string;
  name: string;
  workDate: string;
};

type DailyDetailResponse = {
  date: string;
  summary: {
    ON_TIME: number;
    LATE: number;
    LEAVE: number;
    HOLIDAY: number;
    ABSENT: number;
    MISSING: number;
  };
  details: {
    ON_TIME: DailyDetailItem[];
    LATE: DailyDetailItem[];
    LEAVE: DailyDetailItem[];
    HOLIDAY: DailyDetailItem[];
    ABSENT: DailyDetailItem[];
    MISSING: DailyDetailItem[];
  };
  meta?: {
    status?: AttendanceStatus;
    page: number;
    pageSize: number;
    total: number;
    search?: string;
    summaryOnly?: boolean;
  };
};

@Injectable()
export class ReportsService extends BaseRbacService {
  constructor(prisma: PrismaService, rbacCore: RbacCoreService) {
    super(prisma, rbacCore);
  }

  private readonly dailyReportCache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();
  private readonly monthlyReportCache = new Map<
    string,
    { expiresAt: number; value: unknown }
  >();
  private readonly dailyDetailCache = new Map<
    string,
    { expiresAt: number; value: DailyDetailResponse }
  >();
  private readonly reportCacheTtlMs = 60 * 1000;
  private readonly dailyDetailCacheTtlMs = 60 * 1000;

  private getFreshCacheValue<T>(
    cache: Map<string, { expiresAt: number; value: T }>,
    key: string,
    now: number,
  ): T | undefined {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > now) return hit.value;
    return undefined;
  }

  private setCacheValue<T>(
    cache: Map<string, { expiresAt: number; value: T }>,
    key: string,
    value: T,
    ttlMs: number,
    now: number,
  ) {
    cache.set(key, {
      expiresAt: now + ttlMs,
      value,
    });
  }

  private parsePositiveInt(value: string | undefined, fallback: number) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(1, Math.floor(n));
  }

  private parseStatus(value?: string): AttendanceStatus | undefined {
    if (!value) return undefined;
    if (this.isAttendanceStatus(value)) return value;
    throw new BadRequestException(
      'Invalid status. Expected ON_TIME/LATE/LEAVE/HOLIDAY/ABSENT/MISSING',
    );
  }

  private isAttendanceStatus(value: string): value is AttendanceStatus {
    return Object.values(AttendanceStatus).includes(value as AttendanceStatus);
  }

  private statusColor(value: AttendanceStatus) {
    return value;
  }

  private applyDailyDetailView(
    base: DailyDetailResponse,
    options: {
      status?: AttendanceStatus;
      search?: string;
      page: number;
      pageSize: number;
      summaryOnly: boolean;
    },
  ): DailyDetailResponse {
    const details: DailyDetailResponse['details'] = {
      ON_TIME: [],
      LATE: [],
      LEAVE: [],
      HOLIDAY: [],
      ABSENT: [],
      MISSING: [],
    };

    if (options.summaryOnly) {
      return {
        date: base.date,
        summary: base.summary,
        details,
        meta: {
          page: options.page,
          pageSize: options.pageSize,
          total: 0,
          summaryOnly: true,
          ...(options.search ? { search: options.search } : {}),
          ...(options.status ? { status: options.status } : {}),
        },
      };
    }

    const statuses: AttendanceStatus[] = options.status
      ? [options.status]
      : [
          AttendanceStatus.ON_TIME,
          AttendanceStatus.LATE,
          AttendanceStatus.LEAVE,
          AttendanceStatus.HOLIDAY,
          AttendanceStatus.ABSENT,
          AttendanceStatus.MISSING,
        ];

    const normalizedSearch = (options.search || '').trim().toLowerCase();
    let total = 0;

    for (const status of statuses) {
      const bucket = base.details[status] || [];
      const filtered = normalizedSearch
        ? bucket.filter((item) => {
            const n = (item.name || '').toLowerCase();
            const e = (item.employeeId || '').toLowerCase();
            return n.includes(normalizedSearch) || e.includes(normalizedSearch);
          })
        : bucket;

      const start = (options.page - 1) * options.pageSize;
      const pageItems = filtered.slice(start, start + options.pageSize);
      details[status] = pageItems;
      total += filtered.length;
    }

    return {
      date: base.date,
      summary: base.summary,
      details,
      meta: {
        page: options.page,
        pageSize: options.pageSize,
        total,
        ...(options.search ? { search: options.search } : {}),
        ...(options.status ? { status: options.status } : {}),
      },
    };
  }

  private dayStart(date: Date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  private dayEnd(date: Date) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
  }

  private parseDateText(date: string) {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Invalid date. Expected YYYY-MM-DD');
    }
    return parsed;
  }

  private parseMonthText(month: string) {
    const match = /^(\d{4})-(\d{2})$/.exec(month || '');
    if (!match) {
      throw new BadRequestException('Invalid month. Expected YYYY-MM');
    }

    const year = Number(match[1]);
    const monthIndex = Number(match[2]) - 1;
    if (monthIndex < 0 || monthIndex > 11) {
      throw new BadRequestException('Invalid month. Expected YYYY-MM');
    }

    const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
    const end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  private dateKey(date: Date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  private safeDate(value: unknown, fallback: Date) {
    if (!value) return fallback;
    const text =
      typeof value === 'string' || typeof value === 'number'
        ? String(value)
        : value instanceof Date
          ? value.toISOString()
          : '';
    const parsed = new Date(text || fallback.toISOString());
    if (Number.isNaN(parsed.getTime())) return fallback;
    return parsed;
  }

  private safeNumber(value: unknown) {
    const n = Number(value);
    return Number.isFinite(n) ? n : undefined;
  }

  private formatDateTime(value?: Date) {
    if (!value) return '';
    return value.toISOString().replace('T', ' ').slice(0, 19);
  }

  private formatHoursDuration(totalHours?: number) {
    if (totalHours == null || !Number.isFinite(totalHours)) return '';
    const totalMinutes = Math.max(0, Math.round(totalHours * 60));
    const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
    const mm = String(totalMinutes % 60).padStart(2, '0');
    return `${hh}:${mm}`;
  }

  private getLateThreshold(date: Date) {
    const [hourText, minuteText] = (
      ATTENDANCE_RULE?.LATE_THRESHOLD || '09:15'
    ).split(':');
    const threshold = new Date(date);
    threshold.setHours(Number(hourText || 9), Number(minuteText || 15), 0, 0);
    return threshold;
  }

  private isScheduledWorkday(workDate: Date) {
    const day = workDate.getDay();
    return day >= 1 && day <= 5;
  }

  private calculateAttendanceStatus(params: {
    checkIn?: Date;
    checkOut?: Date;
    isLeave: boolean;
    isHoliday: boolean;
    workDate: Date;
  }): AttendanceStatus {
    if (params.isLeave) {
      return AttendanceStatus.LEAVE;
    }

    if (params.isHoliday) {
      return AttendanceStatus.HOLIDAY;
    }

    const scheduled = this.isScheduledWorkday(params.workDate);

    if (!params.checkIn && !params.checkOut) {
      return scheduled ? AttendanceStatus.ABSENT : AttendanceStatus.MISSING;
    }

    if (!params.checkIn) {
      return AttendanceStatus.ABSENT;
    }

    if (
      params.checkIn.getTime() >
      this.getLateThreshold(params.workDate).getTime()
    ) {
      return AttendanceStatus.LATE;
    }

    return AttendanceStatus.ON_TIME;
  }

  private buildStatusSummary(rows: Array<{ status: AttendanceStatus }>) {
    return {
      onTime: rows.filter((r) => r.status === AttendanceStatus.ON_TIME).length,
      late: rows.filter((r) => r.status === AttendanceStatus.LATE).length,
      leave: rows.filter((r) => r.status === AttendanceStatus.LEAVE).length,
      holiday: rows.filter((r) => r.status === AttendanceStatus.HOLIDAY).length,
      absent: rows.filter((r) => r.status === AttendanceStatus.ABSENT).length,
      missing: rows.filter((r) => r.status === AttendanceStatus.MISSING).length,
    };
  }

  private csvEscape(value: unknown) {
    const text =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean'
        ? String(value)
        : value instanceof Date
          ? value.toISOString()
          : '';
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  private async getLeaveDaySet(
    companyId: string | undefined,
    start: Date,
    end: Date,
  ) {
    const rows = await this.prisma.leave.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        status: 'APPROVED',
        startDate: { lte: end },
        endDate: { gte: start },
      },
      select: {
        employeeId: true,
        startDate: true,
        endDate: true,
      },
    });

    const set = new Set<string>();
    for (const row of rows) {
      const cursor = this.dayStart(row.startDate);
      const limit = this.dayEnd(row.endDate);
      while (cursor.getTime() <= limit.getTime()) {
        if (
          cursor.getTime() >= start.getTime() &&
          cursor.getTime() <= end.getTime()
        ) {
          set.add(`${row.employeeId}:${this.dateKey(cursor)}`);
        }
        cursor.setDate(cursor.getDate() + 1);
      }
    }

    return set;
  }

  private monthKeysBetween(start: Date, end: Date) {
    const keys: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const limit = new Date(end.getFullYear(), end.getMonth(), 1);
    while (cursor.getTime() <= limit.getTime()) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      keys.push(`${y}-${m}`);
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return keys;
  }

  private parseHHmm(hhmm?: string) {
    if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null;
    const [h, m] = hhmm.split(':').map(Number);
    return { hour: h, minute: m };
  }

  private computeShiftPaidHours(shift?: {
    startTime?: string;
    endTime?: string;
    crossDay?: boolean;
    breakMinutes?: number;
  }) {
    const start = this.parseHHmm(shift?.startTime);
    const end = this.parseHHmm(shift?.endTime);
    if (!start || !end) return 9;

    const startMin = start.hour * 60 + start.minute;
    let endMin = end.hour * 60 + end.minute;
    if (shift?.crossDay || endMin <= startMin) {
      endMin += 24 * 60;
    }

    const total = Math.max(endMin - startMin, 0);
    const paid = Math.max(total - Number(shift?.breakMinutes || 0), 0);
    return Number((paid / 60).toFixed(2));
  }

  private async getHolidayDaySet(
    companyId: string | undefined,
    start: Date,
    end: Date,
    employees: Array<{
      id: string;
      companyId: string;
      company?: { country?: string | null } | null;
    }>,
  ) {
    const companyIds = Array.from(
      new Set(employees.map((e) => e.companyId).filter(Boolean)),
    );
    const countries = Array.from(
      new Set(employees.map((e) => e.company?.country).filter(Boolean)),
    ) as string[];

    const holidayOrFilters = [
      ...(companyId
        ? [{ companyId }]
        : companyIds.length
          ? [{ companyId: { in: companyIds } }]
          : []),
      ...(countries.length
        ? [
            {
              companyId: null,
              country: { in: countries },
            },
          ]
        : []),
    ];

    if (!holidayOrFilters.length) {
      return new Set<string>();
    }

    const rows = await this.prisma.holiday.findMany({
      where: {
        status: 'ACTIVE',
        date: { gte: start, lte: end },
        OR: holidayOrFilters,
      },
      select: {
        companyId: true,
        country: true,
        date: true,
      },
    });

    const set = new Set<string>();
    const byCompany = new Map<string, Set<string>>();
    const byCountry = new Map<string, Set<string>>();

    for (const row of rows) {
      const dayKey = this.dateKey(this.dayStart(row.date));
      if (row.companyId) {
        const companySet = byCompany.get(row.companyId) || new Set<string>();
        companySet.add(dayKey);
        byCompany.set(row.companyId, companySet);
        continue;
      }

      const countrySet = byCountry.get(row.country) || new Set<string>();
      countrySet.add(dayKey);
      byCountry.set(row.country, countrySet);
    }

    for (const employee of employees) {
      const companySet = byCompany.get(employee.companyId);
      const countrySet = byCountry.get(employee.company?.country || '');
      for (const dayKey of companySet || []) {
        set.add(`${employee.id}:${dayKey}`);
      }
      for (const dayKey of countrySet || []) {
        set.add(`${employee.id}:${dayKey}`);
      }
    }

    return set;
  }

  private async getOvertimeRuleMap(
    companyId: string | undefined,
    start: Date,
    end: Date,
    employeeIds: string[],
  ) {
    if (!employeeIds.length)
      return new Map<
        string,
        { baseHours: number; overtimeAfterMinutes: number }
      >();
    const months = this.monthKeysBetween(start, end);

    const rows = await this.prisma.roster.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        employeeId: { in: employeeIds },
        month: { in: months },
      },
      select: {
        employeeId: true,
        month: true,
        shift: {
          select: {
            startTime: true,
            endTime: true,
            crossDay: true,
            breakMinutes: true,
            overtimeAfter: true,
          },
        },
      },
    });

    const map = new Map<
      string,
      { baseHours: number; overtimeAfterMinutes: number }
    >();
    for (const row of rows) {
      const baseHours = this.computeShiftPaidHours(row.shift);
      map.set(`${row.employeeId}:${row.month}`, {
        baseHours,
        overtimeAfterMinutes: Number(row.shift?.overtimeAfter || 0),
      });
    }

    return map;
  }

  private calculateOtHours(params: {
    totalHours?: number;
    isHoliday: boolean;
    overtimeRule?: { baseHours: number; overtimeAfterMinutes: number };
  }) {
    const total = Number(params.totalHours || 0);
    if (!Number.isFinite(total) || total <= 0) return 0;
    if (params.isHoliday) return Number(total.toFixed(2));

    const baseHours = params.overtimeRule?.baseHours ?? 9;
    const overtimeAfterHours =
      Number(params.overtimeRule?.overtimeAfterMinutes || 0) / 60;
    const threshold = baseHours + overtimeAfterHours;
    return Number(Math.max(total - threshold, 0).toFixed(2));
  }

  private async resolveCompanyId(
    req: RequestWithUser,
    companyId?: string,
  ): Promise<string | undefined> {
    return this.rbacCore.resolveCompanyScope(req.user, companyId);
  }

  private async getActiveEmployees(companyId?: string) {
    return this.prisma.employee.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        status: {
          notIn: ['TERMINATED', 'INACTIVE'],
        },
      },
      select: {
        id: true,
        companyId: true,
        name: true,
        company: {
          select: {
            country: true,
          },
        },
        user: {
          select: {
            username: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  private async aggregateAttendanceFromEvents(
    companyId: string | undefined,
    start: Date,
    end: Date,
  ) {
    const logs = await this.prisma.tenantAuditLog.findMany({
      where: {
        ...(companyId ? { companyId } : {}),
        scope: 'EVENT',
        entityType: 'Employee',
        action: {
          in: [
            EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_CHECKED_IN,
            EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_BREAK_OUT,
            EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_BREAK_IN,
            EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_CHECKED_OUT,
            EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_AUTO_CHECKED_OUT,
          ],
        },
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { createdAt: 'asc' },
      select: {
        entityId: true,
        action: true,
        createdAt: true,
        afterData: true,
      },
    });

    const map = new Map<string, AttendanceSnapshot>();

    for (const log of logs) {
      const afterData = (log.afterData || {}) as Record<string, unknown>;
      const workDateRaw = afterData.workDate || afterData.date || log.createdAt;
      const workDate = this.dateKey(
        this.dayStart(this.safeDate(workDateRaw, log.createdAt)),
      );
      const key = `${log.entityId}:${workDate}`;

      const snapshot =
        map.get(key) ||
        ({
          employeeId: log.entityId,
          workDate,
          status: AttendanceStatus.ON_TIME,
          anomalyCount: 0,
        } as AttendanceSnapshot);

      if (log.action === EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_CHECKED_IN) {
        snapshot.checkIn = this.safeDate(afterData.checkIn, log.createdAt);
      }

      if (log.action === EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_BREAK_OUT) {
        snapshot.breakOut = this.safeDate(afterData.breakStart, log.createdAt);
      }

      if (log.action === EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_BREAK_IN) {
        snapshot.breakIn = this.safeDate(afterData.breakEnd, log.createdAt);
      }

      if (
        log.action === EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_CHECKED_OUT ||
        log.action === EMPLOYEE_EVENT_ACTIONS.ATTENDANCE_AUTO_CHECKED_OUT
      ) {
        snapshot.checkOut = this.safeDate(afterData.checkOut, log.createdAt);
        snapshot.totalHours = this.safeNumber(afterData.totalHours);
      }

      map.set(key, snapshot);
    }

    const snapshots = Array.from(map.values()).map((item) => {
      const anomalyCount =
        (item.checkIn && !item.checkOut ? 1 : 0) +
        (item.breakOut && !item.breakIn ? 1 : 0);
      return {
        ...item,
        anomalyCount,
      };
    });

    return snapshots;
  }

  async getDailyReport(
    req: RequestWithUser,
    query: { date: string; companyId?: string },
  ) {
    const date = this.parseDateText(query.date);
    const companyId = await this.resolveCompanyId(req, query.companyId);
    const dateKey = this.dateKey(date);
    const cacheKey = `${companyId || '*'}:${dateKey}`;
    const now = Date.now();
    const cached = this.getFreshCacheValue(
      this.dailyReportCache,
      cacheKey,
      now,
    );
    if (cached) {
      return cached;
    }

    const rows = await this.buildEmployeeStatusRows(
      companyId,
      this.dayStart(date),
      this.dayEnd(date),
    );
    const statusSummary = this.buildStatusSummary(rows);

    const totalEmployees = rows.length;
    const present = statusSummary.onTime + statusSummary.late;
    const absent = statusSummary.absent + statusSummary.missing;
    const abnormal =
      statusSummary.late + statusSummary.absent + statusSummary.missing;

    const value = {
      date: dateKey,
      totalEmployees,
      present,
      absent,
      abnormal,
      statusSummary,
      rows: rows.map((row) => ({
        employeeId: row.employeeId,
        companyId: row.companyId,
        username: row.username,
        name: row.name,
        status: row.status,
        isHoliday: row.isHoliday,
        workDate: row.workDate,
        checkIn: row.checkIn,
        breakOut: row.breakOut,
        breakIn: row.breakIn,
        checkOut: row.checkOut,
        totalHours: row.totalHours,
        totalHoursDecimal: row.totalHoursDecimal,
        totalHoursDuration: row.totalHoursDuration,
        otHoursDecimal: row.otHoursDecimal,
      })),
      attendanceRate: totalEmployees
        ? Number(((present / totalEmployees) * 100).toFixed(2))
        : 0,
    };

    this.setCacheValue(
      this.dailyReportCache,
      cacheKey,
      value,
      this.reportCacheTtlMs,
      now,
    );
    return value;
  }

  async getDailyDetailReport(
    req: RequestWithUser,
    query: {
      date: string;
      companyId?: string;
      status?: string;
      search?: string;
      page?: string;
      pageSize?: string;
      summaryOnly?: string;
    },
  ) {
    const date = this.parseDateText(query.date);
    const dateKey = this.dateKey(date);
    const companyId = await this.resolveCompanyId(req, query.companyId);
    const cacheKey = `${companyId || '*'}:${dateKey}`;
    const status = this.parseStatus(query.status);
    const page = this.parsePositiveInt(query.page, 1);
    const pageSize = Math.min(this.parsePositiveInt(query.pageSize, 50), 200);
    const summaryOnly =
      query.summaryOnly === '1' || query.summaryOnly === 'true';
    const search = query.search?.trim();
    const now = Date.now();
    const cached = this.dailyDetailCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return this.applyDailyDetailView(cached.value, {
        status,
        search,
        page,
        pageSize,
        summaryOnly,
      });
    }

    const rows = await this.buildEmployeeStatusRows(
      companyId,
      this.dayStart(date),
      this.dayEnd(date),
    );
    const details: DailyDetailResponse['details'] = {
      ON_TIME: [],
      LATE: [],
      LEAVE: [],
      HOLIDAY: [],
      ABSENT: [],
      MISSING: [],
    };

    for (const row of rows) {
      const item: DailyDetailItem = {
        employeeId: row.employeeId,
        name: row.name,
        workDate: row.workDate,
      };

      if (row.status === AttendanceStatus.ON_TIME) details.ON_TIME.push(item);
      else if (row.status === AttendanceStatus.LATE) details.LATE.push(item);
      else if (row.status === AttendanceStatus.LEAVE) details.LEAVE.push(item);
      else if (row.status === AttendanceStatus.HOLIDAY)
        details.HOLIDAY.push(item);
      else if (row.status === AttendanceStatus.ABSENT)
        details.ABSENT.push(item);
      else details.MISSING.push(item);
    }

    const value: DailyDetailResponse = {
      date: dateKey,
      summary: {
        ON_TIME: details.ON_TIME.length,
        LATE: details.LATE.length,
        LEAVE: details.LEAVE.length,
        HOLIDAY: details.HOLIDAY.length,
        ABSENT: details.ABSENT.length,
        MISSING: details.MISSING.length,
      },
      details,
    };

    this.dailyDetailCache.set(cacheKey, {
      expiresAt: now + this.dailyDetailCacheTtlMs,
      value,
    });

    return this.applyDailyDetailView(value, {
      status,
      search,
      page,
      pageSize,
      summaryOnly,
    });
  }

  async getMonthlyReport(
    req: RequestWithUser,
    query: { month: string; companyId?: string },
  ) {
    const { start, end } = this.parseMonthText(query.month);
    const companyId = await this.resolveCompanyId(req, query.companyId);
    const cacheKey = `${companyId || '*'}:${query.month}`;
    const now = Date.now();
    const cached = this.getFreshCacheValue(
      this.monthlyReportCache,
      cacheKey,
      now,
    );
    if (cached) {
      return cached;
    }

    const rows = await this.buildEmployeeStatusRows(companyId, start, end);

    const byDay = new Map<string, EmployeeStatusRow[]>();
    for (const row of rows) {
      const list = byDay.get(row.workDate) || [];
      list.push(row);
      byDay.set(row.workDate, list);
    }

    const trend: Array<{
      date: string;
      totalEmployees: number;
      present: number;
      absent: number;
      abnormal: number;
      attendanceRate: number;
      statusSummary: {
        onTime: number;
        late: number;
        leave: number;
        holiday: number;
        absent: number;
        missing: number;
      };
      totalOtHours: number;
    }> = [];

    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const key = this.dateKey(cursor);
      const rows = byDay.get(key) || [];
      const statusSummary = this.buildStatusSummary(rows);
      const present = statusSummary.onTime + statusSummary.late;
      const totalEmployees = rows.length;
      const absent = statusSummary.absent + statusSummary.missing;
      const abnormal =
        statusSummary.late + statusSummary.absent + statusSummary.missing;
      const totalOtHours = Number(
        rows
          .reduce((sum, row) => sum + Number(row.otHoursDecimal || 0), 0)
          .toFixed(2),
      );

      trend.push({
        date: key,
        totalEmployees,
        present,
        absent,
        abnormal,
        attendanceRate: totalEmployees
          ? Number(((present / totalEmployees) * 100).toFixed(2))
          : 0,
        statusSummary,
        totalOtHours,
      });

      cursor.setDate(cursor.getDate() + 1);
    }

    const avgAttendanceRate = trend.length
      ? Number(
          (
            trend.reduce((sum, row) => sum + row.attendanceRate, 0) /
            trend.length
          ).toFixed(2),
        )
      : 0;

    const value = {
      month: query.month,
      totalEmployees: trend[0]?.totalEmployees || 0,
      averageAttendanceRate: avgAttendanceRate,
      totalAbnormal: trend.reduce((sum, row) => sum + row.abnormal, 0),
      statusTotals: trend.reduce(
        (acc, row) => {
          acc.onTime += row.statusSummary.onTime;
          acc.late += row.statusSummary.late;
          acc.leave += row.statusSummary.leave;
          acc.holiday += row.statusSummary.holiday;
          acc.absent += row.statusSummary.absent;
          acc.missing += row.statusSummary.missing;
          return acc;
        },
        { onTime: 0, late: 0, leave: 0, holiday: 0, absent: 0, missing: 0 },
      ),
      totalOtHours: Number(
        rows
          .reduce((sum, row) => sum + Number(row.otHoursDecimal || 0), 0)
          .toFixed(2),
      ),
      trend,
    };

    this.setCacheValue(
      this.monthlyReportCache,
      cacheKey,
      value,
      this.reportCacheTtlMs,
      now,
    );
    return value;
  }

  async getAttendanceSummary(
    req: RequestWithUser,
    query: { startDate?: string; endDate?: string; companyId?: string },
  ) {
    const today = new Date();
    const defaultStart = new Date(today);
    defaultStart.setDate(defaultStart.getDate() - 29);

    const start = this.dayStart(
      query.startDate ? this.parseDateText(query.startDate) : defaultStart,
    );
    const end = this.dayEnd(
      query.endDate ? this.parseDateText(query.endDate) : today,
    );

    if (start.getTime() > end.getTime()) {
      throw new BadRequestException('startDate must be earlier than endDate');
    }

    const companyId = await this.resolveCompanyId(req, query.companyId);
    const rows = await this.buildEmployeeStatusRows(companyId, start, end);
    const statusTotals = this.buildStatusSummary(rows);

    const byEmployee = new Map<
      string,
      {
        employeeId: string;
        username: string;
        name: string;
        totalDays: number;
        onTime: number;
        late: number;
        leave: number;
        holiday: number;
        absent: number;
        missing: number;
        totalHoursDecimal: number;
        otHoursDecimal: number;
      }
    >();

    for (const row of rows) {
      const current = byEmployee.get(row.employeeId) || {
        employeeId: row.employeeId,
        username: row.username,
        name: row.name,
        totalDays: 0,
        onTime: 0,
        late: 0,
        leave: 0,
        holiday: 0,
        absent: 0,
        missing: 0,
        totalHoursDecimal: 0,
        otHoursDecimal: 0,
      };

      current.totalDays += 1;
      if (row.status === AttendanceStatus.ON_TIME) current.onTime += 1;
      if (row.status === AttendanceStatus.LATE) current.late += 1;
      if (row.status === AttendanceStatus.LEAVE) current.leave += 1;
      if (row.status === AttendanceStatus.HOLIDAY) current.holiday += 1;
      if (row.status === AttendanceStatus.ABSENT) current.absent += 1;
      if (row.status === AttendanceStatus.MISSING) current.missing += 1;
      current.totalHoursDecimal += Number(row.totalHoursDecimal || 0);
      current.otHoursDecimal += Number(row.otHoursDecimal || 0);

      byEmployee.set(row.employeeId, current);
    }

    const employeeRows = Array.from(byEmployee.values()).map((row) => {
      const present = row.onTime + row.late;
      return {
        ...row,
        present,
        attendanceRate: row.totalDays
          ? Number(((present / row.totalDays) * 100).toFixed(2))
          : 0,
        totalHoursDecimal: Number(row.totalHoursDecimal.toFixed(2)),
        otHoursDecimal: Number(row.otHoursDecimal.toFixed(2)),
      };
    });

    const totalEmployees = employeeRows.length;
    const present = statusTotals.onTime + statusTotals.late;
    const absent = statusTotals.absent + statusTotals.missing;

    return {
      startDate: this.dateKey(start),
      endDate: this.dateKey(end),
      totalEmployees,
      totalRecords: rows.length,
      statusTotals,
      present,
      absent,
      attendanceRate: rows.length
        ? Number(((present / rows.length) * 100).toFixed(2))
        : 0,
      totalWorkHours: Number(
        rows
          .reduce((sum, row) => sum + Number(row.totalHoursDecimal || 0), 0)
          .toFixed(2),
      ),
      totalOtHours: Number(
        rows
          .reduce((sum, row) => sum + Number(row.otHoursDecimal || 0), 0)
          .toFixed(2),
      ),
      rows: employeeRows,
    };
  }

  private async buildDayExportRows(
    companyId: string | undefined,
    date: string,
  ) {
    const day = this.parseDateText(date);
    const rows = await this.buildEmployeeStatusRows(
      companyId,
      this.dayStart(day),
      this.dayEnd(day),
    );

    return rows.map((row) => ({
      username: row.username,
      name: row.name,
      status: row.status,
      isHoliday: row.isHoliday ? 'YES' : 'NO',
      workDate: row.workDate,
      checkIn: this.formatDateTime(row.checkIn),
      breakOut: this.formatDateTime(row.breakOut),
      breakIn: this.formatDateTime(row.breakIn),
      checkOut: this.formatDateTime(row.checkOut),
      totalHoursDecimal:
        row.totalHoursDecimal != null ? row.totalHoursDecimal.toFixed(2) : '',
      totalHoursDuration: row.totalHoursDuration || '',
      otHoursDecimal:
        row.otHoursDecimal != null ? row.otHoursDecimal.toFixed(2) : '0.00',
    }));
  }

  private async buildEmployeeStatusRows(
    companyId: string | undefined,
    start: Date,
    end: Date,
  ) {
    const employees = await this.getActiveEmployees(companyId);
    const snapshots = await this.aggregateAttendanceFromEvents(
      companyId,
      start,
      end,
    );
    const leaveSet = await this.getLeaveDaySet(companyId, start, end);
    const holidaySet = await this.getHolidayDaySet(
      companyId,
      start,
      end,
      employees,
    );
    const overtimeRuleMap = await this.getOvertimeRuleMap(
      companyId,
      start,
      end,
      employees.map((e) => e.id),
    );

    const snapshotMap = new Map(
      snapshots.map((row) => [`${row.employeeId}:${row.workDate}`, row]),
    );
    const rows: EmployeeStatusRow[] = [];

    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const workDate = this.dateKey(cursor);
      for (const employee of employees) {
        const key = `${employee.id}:${workDate}`;
        const snapshot = snapshotMap.get(key);
        const monthKey = workDate.slice(0, 7);
        const isHoliday = holidaySet.has(key);
        const overtimeRule = overtimeRuleMap.get(`${employee.id}:${monthKey}`);
        const otHoursDecimal = this.calculateOtHours({
          totalHours: snapshot?.totalHours,
          isHoliday,
          overtimeRule,
        });
        const status = this.calculateAttendanceStatus({
          checkIn: snapshot?.checkIn,
          checkOut: snapshot?.checkOut,
          isLeave: leaveSet.has(key),
          isHoliday,
          workDate: new Date(cursor),
        });

        rows.push({
          employeeId: employee.id,
          companyId: employee.companyId,
          username: employee.user?.username || '',
          name: employee.name,
          workDate,
          status,
          isHoliday,
          checkIn: snapshot?.checkIn,
          breakOut: snapshot?.breakOut,
          breakIn: snapshot?.breakIn,
          checkOut: snapshot?.checkOut,
          totalHours: snapshot?.totalHours,
          totalHoursDecimal: snapshot?.totalHours,
          totalHoursDuration: this.formatHoursDuration(snapshot?.totalHours),
          otHoursDecimal,
        });
      }

      cursor.setDate(cursor.getDate() + 1);
    }

    return rows;
  }

  async exportDaily(
    req: RequestWithUser,
    query: { date: string; companyId?: string; format?: 'csv' | 'xlsx' },
  ) {
    const companyId = await this.resolveCompanyId(req, query.companyId);
    const rows = await this.buildDayExportRows(companyId, query.date);
    const format = query.format || 'xlsx';

    if (format === 'csv') {
      const headers = [
        'username',
        'name',
        'status',
        'isHoliday',
        'workDate',
        'checkIn',
        'breakOut',
        'breakIn',
        'checkOut',
        'totalHoursDecimal',
        'totalHoursDuration',
        'otHoursDecimal',
      ];
      const csv = [
        headers.join(','),
        ...rows.map((row) =>
          [
            row.username,
            row.name,
            row.status,
            row.isHoliday,
            row.workDate,
            row.checkIn,
            row.breakOut,
            row.breakIn,
            row.checkOut,
            row.totalHoursDecimal,
            row.totalHoursDuration,
            row.otHoursDecimal,
          ]
            .map((value) => this.csvEscape(value))
            .join(','),
        ),
      ].join('\n');

      return {
        fileName: `daily-report-${query.date}.csv`,
        contentType: 'text/csv; charset=utf-8',
        data: Buffer.from(csv, 'utf8'),
      };
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Daily Report');
    sheet.columns = [
      { header: 'username', key: 'username', width: 20 },
      { header: 'name', key: 'name', width: 20 },
      { header: 'status', key: 'status', width: 14 },
      { header: 'isHoliday', key: 'isHoliday', width: 12 },
      { header: 'workDate', key: 'workDate', width: 14 },
      { header: 'checkIn', key: 'checkIn', width: 22 },
      { header: 'breakOut', key: 'breakOut', width: 22 },
      { header: 'breakIn', key: 'breakIn', width: 22 },
      { header: 'checkOut', key: 'checkOut', width: 22 },
      { header: 'totalHoursDecimal', key: 'totalHoursDecimal', width: 18 },
      { header: 'totalHoursDuration', key: 'totalHoursDuration', width: 18 },
      { header: 'otHoursDecimal', key: 'otHoursDecimal', width: 16 },
    ];
    rows.forEach((row) => sheet.addRow(row));

    const data = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      fileName: `daily-report-${query.date}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data,
    };
  }

  async exportMonthly(
    req: RequestWithUser,
    query: { month: string; companyId?: string; format?: 'csv' | 'xlsx' },
  ) {
    const { start, end } = this.parseMonthText(query.month);
    const companyId = await this.resolveCompanyId(req, query.companyId);
    const statusRows = await this.buildEmployeeStatusRows(
      companyId,
      start,
      end,
    );

    const byDay = new Map<string, EmployeeStatusRow[]>();
    for (const row of statusRows) {
      const list = byDay.get(row.workDate) || [];
      list.push(row);
      byDay.set(row.workDate, list);
    }

    const rows: Array<{
      date: string;
      totalEmployees: number;
      present: number;
      absent: number;
      abnormal: number;
      attendanceRate: number;
      onTime: number;
      late: number;
      leave: number;
      holiday: number;
      missing: number;
      totalOtHours: number;
    }> = [];
    const cursor = new Date(start);
    while (cursor.getTime() <= end.getTime()) {
      const key = this.dateKey(cursor);
      const dayRows = byDay.get(key) || [];
      const summary = this.buildStatusSummary(dayRows);
      const present = summary.onTime + summary.late;
      const totalEmployees = dayRows.length;
      const absent = summary.absent + summary.missing;
      const abnormal = summary.late + summary.absent + summary.missing;
      rows.push({
        date: key,
        totalEmployees,
        present,
        absent,
        abnormal,
        attendanceRate: totalEmployees
          ? Number(((present / totalEmployees) * 100).toFixed(2))
          : 0,
        onTime: summary.onTime,
        late: summary.late,
        leave: summary.leave,
        holiday: summary.holiday,
        missing: summary.missing,
        totalOtHours: Number(
          dayRows
            .reduce((sum, row) => sum + Number(row.otHoursDecimal || 0), 0)
            .toFixed(2),
        ),
      });
      cursor.setDate(cursor.getDate() + 1);
    }

    const format = query.format || 'xlsx';
    if (format === 'csv') {
      const headers = [
        'date',
        'totalEmployees',
        'present',
        'absent',
        'abnormal',
        'onTime',
        'late',
        'leave',
        'holiday',
        'missing',
        'totalOtHours',
        'attendanceRate',
      ];
      const csv = [
        headers.join(','),
        ...rows.map((row) =>
          [
            row.date,
            row.totalEmployees,
            row.present,
            row.absent,
            row.abnormal,
            row.onTime,
            row.late,
            row.leave,
            row.holiday,
            row.missing,
            row.totalOtHours,
            row.attendanceRate,
          ]
            .map((value) => this.csvEscape(value))
            .join(','),
        ),
      ].join('\n');

      return {
        fileName: `monthly-report-${query.month}.csv`,
        contentType: 'text/csv; charset=utf-8',
        data: Buffer.from(csv, 'utf8'),
      };
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Monthly Report');
    sheet.columns = [
      { header: 'date', key: 'date', width: 14 },
      { header: 'totalEmployees', key: 'totalEmployees', width: 18 },
      { header: 'present', key: 'present', width: 12 },
      { header: 'absent', key: 'absent', width: 12 },
      { header: 'abnormal', key: 'abnormal', width: 12 },
      { header: 'onTime', key: 'onTime', width: 12 },
      { header: 'late', key: 'late', width: 10 },
      { header: 'leave', key: 'leave', width: 10 },
      { header: 'holiday', key: 'holiday', width: 10 },
      { header: 'missing', key: 'missing', width: 12 },
      { header: 'totalOtHours', key: 'totalOtHours', width: 14 },
      { header: 'attendanceRate', key: 'attendanceRate', width: 16 },
    ];
    rows.forEach((row) => sheet.addRow(row));

    const data = Buffer.from(await workbook.xlsx.writeBuffer());
    return {
      fileName: `monthly-report-${query.month}.xlsx`,
      contentType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data,
    };
  }
}
