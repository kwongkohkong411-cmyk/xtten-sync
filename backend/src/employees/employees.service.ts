import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventLogService } from '../events/event-log.service';
import { Employee360ProjectionService } from '../events/employee-360-projection.service';
import {
  EMPLOYEE_EVENT_ACTION_LIST,
  EMPLOYEE_EVENT_ACTIONS,
} from '../events/event-actions';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';

const EMPLOYEE_LIFECYCLE_STATUSES = [
  'ACTIVE',
  'INACTIVE',
  'SUSPENDED',
  'LEFT',
] as const;

type EmployeeLifecycleStatus = (typeof EMPLOYEE_LIFECYCLE_STATUSES)[number];

type Employee360Query = {
  includeAttendance?: boolean | string | number;
  includeActivity?: boolean | string | number;
  includeDepartmentHistory?: boolean | string | number;
  includeLifecycle?: boolean | string | number;
  includeTimeline?: boolean | string | number;
  attendancePage?: unknown;
  attendancePageSize?: unknown;
  activityPage?: unknown;
  activityPageSize?: unknown;
  departmentHistoryPage?: unknown;
  departmentHistoryPageSize?: unknown;
  timelinePage?: unknown;
  timelinePageSize?: unknown;
};

type Employee360Actor = {
  id: string;
  username: string | null;
  name: string | null;
  email: string | null;
};

type Employee360AuditLog = Prisma.TenantAuditLogGetPayload<{
  include: {
    actor: {
      select: {
        id: true;
        username: true;
        name: true;
        email: true;
      };
    };
  };
}>;

type Employee360Item<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  loaded: boolean;
};

type Employee360DepartmentHistoryItem = {
  id: string;
  changedAt: Date;
  fromDepartmentId: string | null;
  fromDepartmentName: string | null;
  toDepartmentId: string | null;
  toDepartmentName: string | null;
  actor: Employee360Actor | null;
  action: string;
};

type Employee360LifecycleItem = {
  id: string;
  action: string;
  createdAt: Date;
  fromStatus?: string | null;
  toStatus?: string | null;
  fromRoleId?: string | null;
  toRoleId?: string | null;
  fromRoleName?: string | null;
  toRoleName?: string | null;
  actor: Employee360Actor | null;
  meta: unknown;
};

type Employee360TimelineItem = {
  id: string;
  action: string;
  createdAt: Date;
  actor: Employee360Actor | null;
  beforeData: Prisma.JsonValue | null;
  afterData: Prisma.JsonValue | null;
  meta: Prisma.JsonValue | null;
};

type EmployeeReadModel = Prisma.EmployeeGetPayload<{
  include: {
    company: true;
    department: true;
    workGroup: true;
    user: true;
  };
}>;

type Employee360ProjectionSummary = {
  enabled: boolean;
  version?: number;
  updatedAt?: Date;
  lastEventLogId?: string | null;
};

type CreateEmployeeInput = {
  companyId?: string;
  employeeNo?: string;
  name?: string;
  email?: string;
  phone?: string;
  position?: string;
  status?: string;
  hiredAt?: unknown;
  terminatedAt?: unknown;
  terminationReason?: string;
  userId?: string;
  departmentId?: string;
};

type UpdateEmployeeInput = {
  companyId?: string;
  employeeNo?: string;
  name?: string;
  email?: string;
  phone?: string;
  position?: string;
  status?: string;
  hiredAt?: unknown;
  terminatedAt?: unknown;
  terminationReason?: string;
  departmentId?: string;
};

type LifecycleUpdateInput = {
  status?: string;
  hiredAt?: unknown;
  terminatedAt?: unknown;
  terminationReason?: string;
  roleId?: string;
};

type Employee360Response = {
  profile: EmployeeReadModel;
  attendance: Employee360Item<unknown>;
  activity: Employee360Item<unknown>;
  departmentHistory: Employee360Item<Employee360DepartmentHistoryItem>;
  lifecycle: {
    currentStatus: string;
    hiredAt: Date | null;
    terminatedAt: Date | null;
    terminationReason: string | null;
    statusHistory: Employee360LifecycleItem[];
    roleHistory: Employee360LifecycleItem[];
    loaded: boolean;
  };
  timeline: Employee360Item<unknown>;
  projection: Employee360ProjectionSummary;
  generatedAt: string;
  cache: {
    hit: boolean;
    ttlMs: number;
  };
};

@Injectable()
export class EmployeesService extends BaseRbacService {
  private readonly employee360Cache = new Map<
    string,
    { expiresAt: number; value: Employee360Response }
  >();
  private readonly employee360CacheTtlMs = 5000;

  constructor(
    prisma: PrismaService,
    private readonly eventLogService: EventLogService,
    private readonly projectionService: Employee360ProjectionService,
    rbacCore: RbacCoreService,
  ) {
    super(prisma, rbacCore);
  }

  private paginate<T>(items: T[], page: number, pageSize: number) {
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    return {
      items: items.slice(start, end),
      total: items.length,
      page,
      pageSize,
      loaded: true,
    };
  }

  private toTextValue(input: unknown) {
    if (typeof input === 'string') return input;
    if (typeof input === 'number' || typeof input === 'boolean') {
      return String(input);
    }
    if (input instanceof Error) return input.message;
    if (input instanceof Date) return input.toISOString();
    return '';
  }

  private normalizeLifecycleStatus(input: unknown): EmployeeLifecycleStatus {
    const normalized = this.toTextValue(input ?? 'ACTIVE')
      .trim()
      .toUpperCase();
    if (
      !EMPLOYEE_LIFECYCLE_STATUSES.includes(
        normalized as EmployeeLifecycleStatus,
      )
    ) {
      throw new ForbiddenException(
        `Unsupported employee status: ${this.toTextValue(input)}`,
      );
    }
    return normalized as EmployeeLifecycleStatus;
  }

  private toDateOrNull(input: unknown) {
    if (!input) return null;
    if (input instanceof Date) {
      return Number.isNaN(input.getTime()) ? null : input;
    }

    if (
      typeof input !== 'string' &&
      typeof input !== 'number' &&
      typeof input !== 'boolean'
    ) {
      return null;
    }

    const value = new Date(this.toTextValue(input));
    if (Number.isNaN(value.getTime())) {
      throw new ForbiddenException(
        `Invalid date value: ${this.toTextValue(input)}`,
      );
    }
    return value;
  }

  private getScopedCompanyId(actor?: Actor) {
    return this.rbacCore.resolveCompanyScope(actor);
  }

  private async assertRoleAssignmentAllowed(roleId: string, actor?: Actor) {
    await this.rbacCore.assertAssignableRole(actor, roleId);
  }

  private async assertEmployeeInScope(id: string, actor?: Actor) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: { companyId: true },
    });

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    await this.assertTenantAccess(actor, employee.companyId);
  }

  private toBoolean(input: unknown, defaultValue: boolean) {
    if (typeof input === 'boolean') {
      return input;
    }

    if (typeof input === 'string') {
      if (input.toLowerCase() === 'true') return true;
      if (input.toLowerCase() === 'false') return false;
    }

    return defaultValue;
  }

  private toStringOrUndefined(input: unknown) {
    return typeof input === 'string' && input.length > 0 ? input : undefined;
  }

  private toStringOrNull(input: unknown) {
    return typeof input === 'string' && input.length > 0 ? input : null;
  }

  private toCreateEmployeeInput(
    data: Record<string, unknown>,
  ): CreateEmployeeInput {
    return {
      companyId: this.toStringOrUndefined(data.companyId),
      employeeNo: this.toStringOrUndefined(data.employeeNo),
      name: this.toStringOrUndefined(data.name),
      email: this.toStringOrUndefined(data.email),
      phone: this.toStringOrUndefined(data.phone),
      position: this.toStringOrUndefined(data.position),
      status: this.toStringOrUndefined(data.status),
      hiredAt: data.hiredAt,
      terminatedAt: data.terminatedAt,
      terminationReason: this.toStringOrUndefined(data.terminationReason),
      userId: this.toStringOrUndefined(data.userId),
      departmentId: this.toStringOrUndefined(data.departmentId),
    };
  }

  private toUpdateEmployeeInput(
    data: Record<string, unknown>,
  ): UpdateEmployeeInput {
    return {
      companyId: this.toStringOrUndefined(data.companyId),
      employeeNo: this.toStringOrUndefined(data.employeeNo),
      name: this.toStringOrUndefined(data.name),
      email: this.toStringOrUndefined(data.email),
      phone: this.toStringOrUndefined(data.phone),
      position: this.toStringOrUndefined(data.position),
      status: this.toStringOrUndefined(data.status),
      hiredAt: data.hiredAt,
      terminatedAt: data.terminatedAt,
      terminationReason: this.toStringOrUndefined(data.terminationReason),
      departmentId: this.toStringOrUndefined(data.departmentId),
    };
  }

  private toLifecycleUpdateInput(
    data: Record<string, unknown>,
  ): LifecycleUpdateInput {
    return {
      status: this.toStringOrUndefined(data.status),
      hiredAt: data.hiredAt,
      terminatedAt: data.terminatedAt,
      terminationReason: this.toStringOrUndefined(data.terminationReason),
      roleId: this.toStringOrUndefined(data.roleId),
    };
  }

  private toPage(input: unknown, defaultValue = 1) {
    const value = Number(input);
    if (!Number.isFinite(value)) return defaultValue;
    return Math.max(1, Math.floor(value));
  }

  private toPageSize(input: unknown, defaultValue = 10) {
    const value = Number(input);
    if (!Number.isFinite(value)) return defaultValue;
    return Math.min(100, Math.max(1, Math.floor(value)));
  }

  private getEmployee360CacheKey(
    employeeId: string,
    actorId: string | undefined,
    query: Employee360Query,
  ) {
    return `${employeeId}:${actorId || 'anonymous'}:${JSON.stringify(query)}`;
  }

  private readEmployee360Cache(key: string) {
    const cached = this.employee360Cache.get(key);
    if (!cached) return null;
    if (Date.now() > cached.expiresAt) {
      this.employee360Cache.delete(key);
      return null;
    }
    return cached.value;
  }

  private writeEmployee360Cache(key: string, value: Employee360Response) {
    this.employee360Cache.set(key, {
      expiresAt: Date.now() + this.employee360CacheTtlMs,
      value,
    });
  }

  private normalizeProjectionSummary(
    input: unknown,
  ): Employee360ProjectionSummary | null {
    if (!input || typeof input !== 'object') return null;

    const row = input as {
      version?: unknown;
      updatedAt?: unknown;
      lastEventLogId?: unknown;
    };

    return {
      enabled: true,
      version: typeof row.version === 'number' ? row.version : undefined,
      updatedAt: this.toDateOrNull(row.updatedAt) ?? undefined,
      lastEventLogId:
        typeof row.lastEventLogId === 'string' ? row.lastEventLogId : null,
    };
  }

  private readJsonObject(input: Prisma.JsonValue | null | undefined) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return null;
    }

    return input as Record<string, unknown>;
  }

  private invalidateEmployee360Cache(employeeId: string) {
    for (const key of this.employee360Cache.keys()) {
      if (key.startsWith(`${employeeId}:`)) {
        this.employee360Cache.delete(key);
      }
    }
  }

  async findOne(id: string, actor?: Actor): Promise<EmployeeReadModel | null> {
    await this.assertEmployeeInScope(id, actor);

    return this.prisma.employee.findUnique({
      where: { id },
      include: {
        company: true,
        department: true,
        workGroup: true,
        user: true,
      },
    });
  }

  async get360(
    id: string,
    actor?: Actor,
    rawQuery?: Employee360Query,
  ): Promise<Employee360Response> {
    const employee = await this.findOne(id, actor);

    if (!employee) {
      throw new NotFoundException('Employee not found');
    }

    const query = {
      includeAttendance: this.toBoolean(rawQuery?.includeAttendance, true),
      includeActivity: this.toBoolean(rawQuery?.includeActivity, true),
      includeDepartmentHistory: this.toBoolean(
        rawQuery?.includeDepartmentHistory,
        true,
      ),
      includeLifecycle: this.toBoolean(rawQuery?.includeLifecycle, true),
      includeTimeline: this.toBoolean(rawQuery?.includeTimeline, true),
      attendancePage: this.toPage(rawQuery?.attendancePage, 1),
      attendancePageSize: this.toPageSize(rawQuery?.attendancePageSize, 10),
      activityPage: this.toPage(rawQuery?.activityPage, 1),
      activityPageSize: this.toPageSize(rawQuery?.activityPageSize, 10),
      departmentHistoryPage: this.toPage(rawQuery?.departmentHistoryPage, 1),
      departmentHistoryPageSize: this.toPageSize(
        rawQuery?.departmentHistoryPageSize,
        10,
      ),
      timelinePage: this.toPage(rawQuery?.timelinePage, 1),
      timelinePageSize: this.toPageSize(rawQuery?.timelinePageSize, 20),
    };

    const cacheKey = this.getEmployee360CacheKey(id, actor?.id, query);
    const cached = this.readEmployee360Cache(cacheKey);
    if (cached) {
      return {
        ...cached,
        cache: {
          hit: true,
          ttlMs: this.employee360CacheTtlMs,
        },
      };
    }

    const projectionRow = this.normalizeProjectionSummary(
      await this.projectionService.getProjection(employee.companyId, id),
    );
    const projectionSnapshot =
      await this.projectionService.getProjectionSnapshot(
        employee.companyId,
        id,
        {
          repairIfStale: true,
        },
      );

    let attendance: Employee360Item<unknown> = {
      items: [],
      total: 0,
      page: query.attendancePage,
      pageSize: query.attendancePageSize,
      loaded: false,
    };

    if (query.includeAttendance) {
      const [total, items]: [number, unknown[]] =
        await this.prisma.$transaction([
          this.prisma.attendance.count({ where: { employeeId: id } }),
          this.prisma.attendance.findMany({
            where: { employeeId: id },
            orderBy: { date: 'desc' },
            skip: (query.attendancePage - 1) * query.attendancePageSize,
            take: query.attendancePageSize,
          }),
        ]);

      attendance = {
        items,
        total,
        page: query.attendancePage,
        pageSize: query.attendancePageSize,
        loaded: true,
      };
    }

    let activity: Employee360Item<unknown> = {
      items: [],
      total: 0,
      page: query.activityPage,
      pageSize: query.activityPageSize,
      loaded: false,
    };

    if (query.includeActivity) {
      if (projectionSnapshot?.activity?.items) {
        activity = this.paginate(
          projectionSnapshot.activity.items,
          query.activityPage,
          query.activityPageSize,
        );
      } else {
        const [total, items]: [number, Employee360AuditLog[]] =
          await this.prisma.$transaction([
            this.prisma.tenantAuditLog.count({
              where: {
                companyId: employee.companyId,
                entityType: 'Employee',
                entityId: id,
                scope: 'EVENT',
                action: {
                  in: EMPLOYEE_EVENT_ACTION_LIST,
                },
              },
            }),
            this.prisma.tenantAuditLog.findMany({
              where: {
                companyId: employee.companyId,
                entityType: 'Employee',
                entityId: id,
                scope: 'EVENT',
                action: {
                  in: EMPLOYEE_EVENT_ACTION_LIST,
                },
              },
              include: {
                actor: {
                  select: {
                    id: true,
                    username: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
              skip: (query.activityPage - 1) * query.activityPageSize,
              take: query.activityPageSize,
            }),
          ]);

        activity = {
          items,
          total,
          page: query.activityPage,
          pageSize: query.activityPageSize,
          loaded: true,
        };
      }
    }

    let departmentHistory: Employee360Item<Employee360DepartmentHistoryItem> = {
      items: [],
      total: 0,
      page: query.departmentHistoryPage,
      pageSize: query.departmentHistoryPageSize,
      loaded: false,
    };

    if (query.includeDepartmentHistory) {
      if (projectionSnapshot?.departmentHistory?.items) {
        departmentHistory = this.paginate(
          projectionSnapshot.departmentHistory.items,
          query.departmentHistoryPage,
          query.departmentHistoryPageSize,
        );
      } else {
        const [total, items]: [number, Employee360AuditLog[]] =
          await this.prisma.$transaction([
            this.prisma.tenantAuditLog.count({
              where: {
                companyId: employee.companyId,
                entityType: 'Employee',
                entityId: id,
                scope: 'EVENT',
                action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_DEPARTMENT_CHANGED,
              },
            }),
            this.prisma.tenantAuditLog.findMany({
              where: {
                companyId: employee.companyId,
                entityType: 'Employee',
                entityId: id,
                scope: 'EVENT',
                action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_DEPARTMENT_CHANGED,
              },
              include: {
                actor: {
                  select: {
                    id: true,
                    username: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
              skip:
                (query.departmentHistoryPage - 1) *
                query.departmentHistoryPageSize,
              take: query.departmentHistoryPageSize,
            }),
          ]);

        departmentHistory = {
          items: items.map((log) => {
            const beforeData = this.readJsonObject(log.beforeData);
            const afterData = this.readJsonObject(log.afterData);

            return {
              id: log.id,
              changedAt: log.createdAt,
              fromDepartmentId:
                typeof beforeData?.departmentId === 'string'
                  ? beforeData.departmentId
                  : null,
              fromDepartmentName:
                typeof beforeData?.departmentName === 'string'
                  ? beforeData.departmentName
                  : null,
              toDepartmentId:
                typeof afterData?.departmentId === 'string'
                  ? afterData.departmentId
                  : null,
              toDepartmentName:
                typeof afterData?.departmentName === 'string'
                  ? afterData.departmentName
                  : null,
              actor: log.actor,
              action: log.action,
            };
          }),
          total,
          page: query.departmentHistoryPage,
          pageSize: query.departmentHistoryPageSize,
          loaded: true,
        };
      }
    }

    let lifecycle: Employee360Response['lifecycle'] = {
      currentStatus: this.normalizeLifecycleStatus(employee.status),
      hiredAt: employee.hiredAt,
      terminatedAt: employee.terminatedAt,
      terminationReason: employee.terminationReason,
      statusHistory: [],
      roleHistory: [],
      loaded: false,
    };

    if (query.includeLifecycle) {
      if (projectionSnapshot?.lifecycle) {
        lifecycle = {
          ...projectionSnapshot.lifecycle,
          loaded: true,
        };
      } else {
        const logs: Employee360AuditLog[] =
          await this.prisma.tenantAuditLog.findMany({
            where: {
              companyId: employee.companyId,
              entityType: 'Employee',
              entityId: id,
              scope: 'EVENT',
              action: {
                in: [
                  EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_STATUS_CHANGED,
                  EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_HIRED,
                  EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_TERMINATED,
                  EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_REHIRED,
                  EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_ROLE_CHANGED,
                ],
              },
            },
            include: {
              actor: {
                select: {
                  id: true,
                  username: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

        const lifecycleActions = new Set<string>([
          EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_STATUS_CHANGED,
          EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_HIRED,
          EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_TERMINATED,
          EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_REHIRED,
        ]);

        lifecycle = {
          currentStatus: this.normalizeLifecycleStatus(employee.status),
          hiredAt: employee.hiredAt,
          terminatedAt: employee.terminatedAt,
          terminationReason: employee.terminationReason,
          statusHistory: logs
            .filter((log) => lifecycleActions.has(log.action))
            .map((log) => {
              const beforeData = this.readJsonObject(log.beforeData);
              const afterData = this.readJsonObject(log.afterData);

              return {
                id: log.id,
                action: log.action,
                createdAt: log.createdAt,
                fromStatus:
                  typeof beforeData?.status === 'string'
                    ? beforeData.status
                    : null,
                toStatus:
                  typeof afterData?.status === 'string'
                    ? afterData.status
                    : null,
                actor: log.actor,
                meta: log.meta,
              };
            }),
          roleHistory: logs
            .filter(
              (log) =>
                log.action === EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_ROLE_CHANGED,
            )
            .map((log) => {
              const beforeData = this.readJsonObject(log.beforeData);
              const afterData = this.readJsonObject(log.afterData);

              return {
                id: log.id,
                action: log.action,
                createdAt: log.createdAt,
                fromRoleId:
                  typeof beforeData?.roleId === 'string'
                    ? beforeData.roleId
                    : null,
                toRoleId:
                  typeof afterData?.roleId === 'string'
                    ? afterData.roleId
                    : null,
                fromRoleName:
                  typeof beforeData?.roleName === 'string'
                    ? beforeData.roleName
                    : null,
                toRoleName:
                  typeof afterData?.roleName === 'string'
                    ? afterData.roleName
                    : null,
                actor: log.actor,
                meta: log.meta,
              };
            }),
          loaded: true,
        };
      }
    }

    let timeline: Employee360Item<unknown> = {
      items: [],
      total: 0,
      page: query.timelinePage,
      pageSize: query.timelinePageSize,
      loaded: false,
    };

    if (query.includeTimeline) {
      if (projectionSnapshot?.timeline?.items) {
        timeline = this.paginate(
          projectionSnapshot.timeline.items,
          query.timelinePage,
          query.timelinePageSize,
        );
      } else {
        const [total, items]: [number, Employee360TimelineItem[]] =
          await this.prisma.$transaction([
            this.prisma.tenantAuditLog.count({
              where: {
                companyId: employee.companyId,
                entityType: 'Employee',
                entityId: id,
                scope: 'EVENT',
              },
            }),
            this.prisma.tenantAuditLog.findMany({
              where: {
                companyId: employee.companyId,
                entityType: 'Employee',
                entityId: id,
                scope: 'EVENT',
              },
              include: {
                actor: {
                  select: {
                    id: true,
                    username: true,
                    name: true,
                    email: true,
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
              skip: (query.timelinePage - 1) * query.timelinePageSize,
              take: query.timelinePageSize,
            }),
          ]);

        timeline = {
          items: items.map((log) => ({
            id: log.id,
            action: log.action,
            createdAt: log.createdAt,
            actor: log.actor,
            beforeData: log.beforeData,
            afterData: log.afterData,
            meta: log.meta,
          })),
          total,
          page: query.timelinePage,
          pageSize: query.timelinePageSize,
          loaded: true,
        };
      }
    }

    const response: Employee360Response = {
      profile: employee,
      attendance,
      activity,
      departmentHistory,
      lifecycle,
      timeline,
      projection: projectionRow
        ? {
            enabled: true,
            version: projectionRow.version,
            updatedAt: projectionRow.updatedAt,
            lastEventLogId: projectionRow.lastEventLogId,
          }
        : {
            enabled: false,
          },
      generatedAt: new Date().toISOString(),
      cache: {
        hit: false,
        ttlMs: this.employee360CacheTtlMs,
      },
    };

    this.writeEmployee360Cache(cacheKey, response);

    return response;
  }

  async getOverview(id: string, actor?: Actor) {
    const data360 = await this.get360(id, actor, {
      includeAttendance: true,
      includeActivity: true,
      includeDepartmentHistory: true,
      includeLifecycle: true,
      includeTimeline: true,
      attendancePage: 1,
      attendancePageSize: 60,
      activityPage: 1,
      activityPageSize: 100,
      departmentHistoryPage: 1,
      departmentHistoryPageSize: 100,
      timelinePage: 1,
      timelinePageSize: 100,
    });

    return {
      employee: data360.profile,
      attendance: data360.attendance.items,
      activity: data360.activity.items,
      departmentHistory: data360.departmentHistory.items,
      lifecycle: data360.lifecycle,
      timeline: data360.timeline.items,
    };
  }

  // =================================================
  // GET ALL
  // =================================================
  async findAll(actor?: Actor) {
    const scopedCompanyId = await this.getScopedCompanyId(actor);

    return this.prisma.employee.findMany({
      where: scopedCompanyId ? { companyId: scopedCompanyId } : undefined,
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        company: true,
        department: true,
        user: true,
      },
    });
  }

  // =================================================
  // CREATE (🔥 最终稳定版)
  // =================================================
  async create(data: Record<string, unknown>, actor?: Actor) {
    const input = this.toCreateEmployeeInput(data);
    const companyId = input.companyId;
    const scopedCompanyId = await this.assertCompanyScope(actor, companyId);
    if (!scopedCompanyId.companyId) {
      throw new BadRequestException('companyId is required');
    }
    const resolvedCompanyId = scopedCompanyId.companyId;
    const normalizedStatus = this.normalizeLifecycleStatus(
      input.status || 'ACTIVE',
    );
    const hiredAt = this.toDateOrNull(input.hiredAt) || new Date();
    const terminatedAt = this.toDateOrNull(input.terminatedAt);
    const userId = input.userId;

    if (!userId) {
      throw new ForbiddenException('userId is required');
    }

    const payload: Prisma.EmployeeUncheckedCreateInput = {
      employeeNo: input.employeeNo,
      name: input.name ?? '',
      email: input.email,
      phone: input.phone,
      position: input.position,
      status: normalizedStatus,
      hiredAt,
      terminatedAt:
        normalizedStatus === 'LEFT' ? terminatedAt || new Date() : undefined,
      terminationReason:
        normalizedStatus === 'LEFT'
          ? (input.terminationReason ?? null)
          : undefined,
      companyId: resolvedCompanyId,
      userId,
    };

    // ⭐ department（可选）
    const departmentId = input.departmentId;
    if (departmentId) {
      payload.departmentId = departmentId;
    }

    const created = await this.prisma.employee.create({
      data: payload,
      include: {
        company: true,
        department: true,
        workGroup: true,
        user: true,
      },
    });

    await this.eventLogService.emitEmployeeEvent({
      companyId: created.companyId,
      actorId: actor?.id,
      employeeId: created.id,
      action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_CREATED,
      afterData: {
        id: created.id,
        name: created.name,
        email: created.email,
        status: created.status,
        hiredAt: created.hiredAt,
        terminatedAt: created.terminatedAt,
        terminationReason: created.terminationReason,
        companyId: created.companyId,
        departmentId: created.departmentId,
        departmentName: created.department?.name ?? null,
        workGroupId: created.workGroupId,
      },
      meta: {
        source: 'employees.service.create',
      },
    });

    await this.eventLogService.emitEmployeeEvent({
      companyId: created.companyId,
      actorId: actor?.id,
      employeeId: created.id,
      action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_HIRED,
      beforeData: null,
      afterData: {
        id: created.id,
        status: created.status,
        hiredAt: created.hiredAt,
      },
      meta: {
        source: 'employees.service.create',
      },
    });

    this.invalidateEmployee360Cache(created.id);

    return created;
  }

  // =================================================
  // UPDATE (🔥 最终稳定版)
  // =================================================
  async update(id: string, data: Record<string, unknown>, actor?: Actor) {
    const input = this.toUpdateEmployeeInput(data);
    await this.assertEmployeeInScope(id, actor);

    const before = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!before) {
      throw new NotFoundException('Employee not found');
    }

    const companyId = input.companyId;
    let resolvedCompanyId = before.companyId;
    if (companyId) {
      const scopedCompanyId = await this.assertCompanyScope(actor, companyId);
      if (!scopedCompanyId.companyId) {
        throw new BadRequestException('companyId is required');
      }
      resolvedCompanyId = scopedCompanyId.companyId;
    }

    const prevStatus = this.normalizeLifecycleStatus(before.status || 'ACTIVE');
    const nextStatus = this.normalizeLifecycleStatus(
      input.status ?? before.status ?? 'ACTIVE',
    );
    const hiredAt =
      this.toDateOrNull(input.hiredAt) ||
      before.hiredAt ||
      (nextStatus === 'ACTIVE' ? new Date() : null);
    const terminatedAtFromInput = this.toDateOrNull(input.terminatedAt);
    const isRehire = prevStatus === 'LEFT' && nextStatus !== 'LEFT';
    const isTermination = prevStatus !== 'LEFT' && nextStatus === 'LEFT';
    const terminatedAt =
      nextStatus === 'LEFT'
        ? terminatedAtFromInput || before.terminatedAt || new Date()
        : null;
    const terminationReason =
      nextStatus === 'LEFT'
        ? (input.terminationReason ?? before.terminationReason ?? null)
        : null;

    const payload: Prisma.EmployeeUncheckedUpdateInput = {
      employeeNo: input.employeeNo,
      name: input.name,
      email: input.email,
      phone: input.phone,
      position: input.position,
      status: nextStatus,
      hiredAt,
      terminatedAt,
      terminationReason,
      companyId: resolvedCompanyId,
    };

    const departmentId = input.departmentId;
    if (departmentId) {
      payload.departmentId = departmentId;
    } else {
      payload.departmentId = null;
    }

    const updated = await this.prisma.employee.update({
      where: { id },
      data: payload,
      include: {
        company: true,
        department: true,
        workGroup: true,
        user: true,
      },
    });

    const baseBefore = {
      id: before.id,
      name: before.name,
      email: before.email,
      status: before.status,
      hiredAt: before.hiredAt,
      terminatedAt: before.terminatedAt,
      terminationReason: before.terminationReason,
      companyId: before.companyId,
      departmentId: before.departmentId,
      departmentName: before.department?.name ?? null,
      workGroupId: before.workGroupId,
    };

    const baseAfter = {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      status: updated.status,
      hiredAt: updated.hiredAt,
      terminatedAt: updated.terminatedAt,
      terminationReason: updated.terminationReason,
      companyId: updated.companyId,
      departmentId: updated.departmentId,
      departmentName: updated.department?.name ?? null,
      workGroupId: updated.workGroupId,
    };

    await this.eventLogService.emitEmployeeEvent({
      companyId: updated.companyId,
      actorId: actor?.id,
      employeeId: updated.id,
      action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_UPDATED,
      beforeData: baseBefore,
      afterData: baseAfter,
      meta: {
        source: 'employees.service.update',
      },
    });

    if (before.departmentId !== updated.departmentId) {
      await this.eventLogService.emitEmployeeEvent({
        companyId: updated.companyId,
        actorId: actor?.id,
        employeeId: updated.id,
        action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_DEPARTMENT_CHANGED,
        beforeData: baseBefore,
        afterData: baseAfter,
        meta: {
          source: 'employees.service.update',
        },
      });
    }

    if (before.status !== updated.status) {
      await this.eventLogService.emitEmployeeEvent({
        companyId: updated.companyId,
        actorId: actor?.id,
        employeeId: updated.id,
        action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_STATUS_CHANGED,
        beforeData: baseBefore,
        afterData: baseAfter,
        meta: {
          source: 'employees.service.update',
        },
      });
    }

    if (isTermination) {
      await this.eventLogService.emitEmployeeEvent({
        companyId: updated.companyId,
        actorId: actor?.id,
        employeeId: updated.id,
        action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_TERMINATED,
        beforeData: baseBefore,
        afterData: baseAfter,
        meta: {
          source: 'employees.service.update',
          reason: terminationReason,
        },
      });
    }

    if (isRehire) {
      await this.eventLogService.emitEmployeeEvent({
        companyId: updated.companyId,
        actorId: actor?.id,
        employeeId: updated.id,
        action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_REHIRED,
        beforeData: baseBefore,
        afterData: baseAfter,
        meta: {
          source: 'employees.service.update',
        },
      });
    }

    this.invalidateEmployee360Cache(updated.id);

    return updated;
  }

  // =================================================
  // LIFECYCLE UPDATE
  // =================================================
  async updateLifecycle(
    id: string,
    data: Record<string, unknown>,
    actor?: Actor,
  ) {
    const input = this.toLifecycleUpdateInput(data);
    await this.assertEmployeeInScope(id, actor);

    const before = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            roleId: true,
            roleRelation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (!before) {
      throw new NotFoundException('Employee not found');
    }

    const prevStatus = this.normalizeLifecycleStatus(before.status || 'ACTIVE');
    const nextStatus = this.normalizeLifecycleStatus(
      input.status ?? before.status ?? 'ACTIVE',
    );
    const hiredAt =
      this.toDateOrNull(input.hiredAt) ||
      before.hiredAt ||
      (nextStatus === 'ACTIVE' ? new Date() : null);
    const terminatedAtInput = this.toDateOrNull(input.terminatedAt);
    const isTermination = prevStatus !== 'LEFT' && nextStatus === 'LEFT';
    const isRehire = prevStatus === 'LEFT' && nextStatus !== 'LEFT';
    const terminatedAt =
      nextStatus === 'LEFT'
        ? terminatedAtInput || before.terminatedAt || new Date()
        : null;
    const terminationReason =
      nextStatus === 'LEFT'
        ? (input.terminationReason ?? before.terminationReason ?? null)
        : null;

    const updated = await this.prisma.employee.update({
      where: { id },
      data: {
        status: nextStatus,
        hiredAt,
        terminatedAt,
        terminationReason,
      },
      include: {
        user: {
          include: {
            roleRelation: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });

    if (before.status !== updated.status) {
      const beforeData: Prisma.InputJsonObject = {
        status: before.status,
        hiredAt: before.hiredAt,
        terminatedAt: before.terminatedAt,
        terminationReason: before.terminationReason,
      };
      const afterData: Prisma.InputJsonObject = {
        status: updated.status,
        hiredAt: updated.hiredAt,
        terminatedAt: updated.terminatedAt,
        terminationReason: updated.terminationReason,
      };
      const meta: Prisma.InputJsonObject = {
        source: 'employees.service.updateLifecycle',
      };

      await this.eventLogService.emitEmployeeEvent({
        companyId: updated.companyId,
        actorId: actor?.id,
        employeeId: updated.id,
        action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_STATUS_CHANGED,
        beforeData,
        afterData,
        meta,
      });
    }

    if (isTermination) {
      const beforeData: Prisma.InputJsonObject = {
        status: before.status,
        terminatedAt: before.terminatedAt,
        terminationReason: before.terminationReason,
      };
      const afterData: Prisma.InputJsonObject = {
        status: updated.status,
        terminatedAt: updated.terminatedAt,
        terminationReason: updated.terminationReason,
      };
      const meta: Prisma.InputJsonObject = {
        source: 'employees.service.updateLifecycle',
        reason: updated.terminationReason,
      };

      await this.eventLogService.emitEmployeeEvent({
        companyId: updated.companyId,
        actorId: actor?.id,
        employeeId: updated.id,
        action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_TERMINATED,
        beforeData,
        afterData,
        meta,
      });
    }

    if (isRehire) {
      const beforeData: Prisma.InputJsonObject = {
        status: before.status,
        hiredAt: before.hiredAt,
      };
      const afterData: Prisma.InputJsonObject = {
        status: updated.status,
        hiredAt: updated.hiredAt,
      };
      const meta: Prisma.InputJsonObject = {
        source: 'employees.service.updateLifecycle',
      };

      await this.eventLogService.emitEmployeeEvent({
        companyId: updated.companyId,
        actorId: actor?.id,
        employeeId: updated.id,
        action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_REHIRED,
        beforeData,
        afterData,
        meta,
      });
    }

    const roleId = input.roleId;
    if (roleId && before.user?.id) {
      await this.assertRoleAssignmentAllowed(roleId, actor);

      const [nextRole, updatedUser] = await this.prisma.$transaction([
        this.prisma.role.findUnique({
          where: { id: roleId },
          select: { id: true, name: true },
        }),
        this.prisma.user.update({
          where: { id: before.user.id },
          data: { roleRelation: { connect: { id: roleId } } },
          include: { roleRelation: { select: { id: true, name: true } } },
        }),
      ]);

      if (!nextRole) {
        throw new NotFoundException('Role not found');
      }

      if (before.user.roleId !== updatedUser.roleId) {
        await this.eventLogService.emitEmployeeEvent({
          companyId: updated.companyId,
          actorId: actor?.id,
          employeeId: updated.id,
          action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_ROLE_CHANGED,
          beforeData: {
            roleId: before.user.roleId,
            roleName: before.user.roleRelation?.name ?? null,
          },
          afterData: {
            roleId: updatedUser.roleId,
            roleName: updatedUser.roleRelation?.name ?? null,
          },
          meta: {
            source: 'employees.service.updateLifecycle',
          },
        });
      }
    }

    this.invalidateEmployee360Cache(updated.id);

    return updated;
  }

  // =================================================
  // DELETE
  // =================================================
  async remove(id: string, actor?: Actor) {
    await this.assertEmployeeInScope(id, actor);

    const before = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!before) {
      throw new NotFoundException('Employee not found');
    }

    const removed = await this.prisma.employee.delete({
      where: { id },
    });

    await this.eventLogService.emitEmployeeEvent({
      companyId: before.companyId,
      actorId: actor?.id,
      employeeId: before.id,
      action: EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_DELETED,
      beforeData: {
        id: before.id,
        name: before.name,
        email: before.email,
        status: before.status,
        companyId: before.companyId,
        departmentId: before.departmentId,
        departmentName: before.department?.name ?? null,
        workGroupId: before.workGroupId,
        deleted: false,
      },
      afterData: {
        id: before.id,
        deleted: true,
      },
      meta: {
        source: 'employees.service.remove',
      },
    });

    this.invalidateEmployee360Cache(before.id);

    return removed;
  }
}
