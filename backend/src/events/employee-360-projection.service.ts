import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { EventControlPlaneService } from './event-control-plane.service';
import {
  EMPLOYEE_EVENT_ACTIONS,
  EMPLOYEE_EVENT_ACTION_LIST,
} from './event-actions';

type EmployeeAuditLogRow = {
  id: string;
  action: string;
  scope: string;
  createdAt: Date;
  actor: {
    id: string;
    username: string | null;
    name: string | null;
    email: string | null;
  } | null;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
};

type EmployeeProjectionActor = EmployeeAuditLogRow['actor'];

type EmployeeProjectionActivityItem = {
  id: string;
  action: string;
  scope: string;
  createdAt: Date;
  actor: EmployeeProjectionActor;
};

type EmployeeProjectionDepartmentHistoryItem = {
  id: string;
  changedAt: Date;
  fromDepartmentId: string | null;
  fromDepartmentName: string | null;
  toDepartmentId: string | null;
  toDepartmentName: string | null;
  actor: EmployeeProjectionActor;
  action: string;
  meta: Record<string, unknown> | null;
};

type EmployeeProjectionStatusHistoryItem = {
  id: string;
  action: string;
  createdAt: Date;
  fromStatus: string | null;
  toStatus: string | null;
  actor: EmployeeProjectionActor;
  meta: Record<string, unknown> | null;
};

type EmployeeProjectionRoleHistoryItem = {
  id: string;
  action: string;
  createdAt: Date;
  fromRoleId: string | null;
  toRoleId: string | null;
  fromRoleName: string | null;
  toRoleName: string | null;
  actor: EmployeeProjectionActor;
  meta: Record<string, unknown> | null;
};

type EmployeeProjectionTimelineItem = {
  id: string;
  action: string;
  createdAt: Date;
  actor: EmployeeProjectionActor;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
};

type EmployeeProjectionSnapshot = {
  profile: unknown;
  lifecycle: {
    currentStatus: string;
    hiredAt: Date | null;
    terminatedAt: Date | null;
    terminationReason: string | null;
    statusHistory: EmployeeProjectionStatusHistoryItem[];
    roleHistory: EmployeeProjectionRoleHistoryItem[];
    loaded: boolean;
  };
  activity: {
    items: EmployeeProjectionActivityItem[];
    total: number;
    page: number;
    pageSize: number;
    loaded: boolean;
  };
  departmentHistory: {
    items: EmployeeProjectionDepartmentHistoryItem[];
    total: number;
    page: number;
    pageSize: number;
    loaded: boolean;
  };
  timeline: {
    items: EmployeeProjectionTimelineItem[];
    total: number;
    page: number;
    pageSize: number;
    loaded: boolean;
  };
  totals: {
    activity: number;
    departmentHistory: number;
    timeline: number;
  };
  generatedAt: string;
};

@Injectable()
export class Employee360ProjectionService {
  private readonly logger = new Logger(Employee360ProjectionService.name);
  private readonly snapshotCache = new Map<
    string,
    { value: EmployeeProjectionSnapshot; expiresAt: number }
  >();
  private readonly cacheTtlMs = 20_000;

  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlane: EventControlPlaneService,
  ) {}

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

  private toStringOrNull(value: unknown) {
    return typeof value === 'string' ? value : null;
  }

  async getProjection(companyId: string, employeeId: string) {
    try {
      return await this.prisma.employee360Projection.findFirst({
        where: {
          companyId,
          employeeId,
        },
      });
    } catch (error: unknown) {
      let text = '';
      if (error instanceof Error) {
        text = error.message;
      } else if (typeof error === 'string') {
        text = error;
      }
      if (text.includes('Employee360Projection')) {
        return null;
      }
      throw error;
    }
  }

  private async getLatestEventLogId(companyId: string, employeeId: string) {
    const latest = await this.prisma.tenantAuditLog.findFirst({
      where: {
        companyId,
        entityType: 'Employee',
        entityId: employeeId,
        scope: 'EVENT',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });

    return latest?.id || null;
  }

  async getProjectionSnapshot(
    companyId: string,
    employeeId: string,
    options?: { repairIfStale?: boolean },
  ): Promise<EmployeeProjectionSnapshot | null> {
    const cacheKey = `${companyId}:${employeeId}`;
    const cached = this.snapshotCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.value;
    }

    const repairIfStale = options?.repairIfStale !== false;
    const projection = await this.getProjection(companyId, employeeId);

    if (!projection) {
      if (repairIfStale) {
        const guard = await this.controlPlane.getRepairGuard(
          companyId,
          employeeId,
        );
        if (
          !guard.canRepair ||
          guard.repairDepth >= guard.decision.repairMaxDepth
        ) {
          return null;
        }
        const lock = await this.controlPlane.acquireRepairLock({
          companyId,
          entityId: employeeId,
          owner: 'projection-auto-repair',
          source: 'projection-service',
          reason: 'missing_projection',
          ttlMs: 45_000,
        });

        if (!lock.acquired) {
          return null;
        }

        this.controlPlane.recordRepairAttempt(companyId, employeeId);
        try {
          const rebuilt = (
            await this.rebuildEmployeeProjection(companyId, employeeId)
          ).snapshot;
          this.snapshotCache.set(cacheKey, {
            value: rebuilt,
            expiresAt: Date.now() + this.cacheTtlMs,
          });
          return rebuilt;
        } catch (error) {
          this.controlPlane.recordRepairFailure(companyId, employeeId);
          throw error;
        } finally {
          await this.controlPlane.releaseRepairLock({
            companyId,
            entityId: employeeId,
            owner: 'projection-auto-repair',
          });
        }
      }

      return null;
    }

    const latestEventLogId = await this.getLatestEventLogId(
      companyId,
      employeeId,
    );
    if (
      latestEventLogId &&
      projection.lastEventLogId !== latestEventLogId &&
      repairIfStale
    ) {
      const guard = await this.controlPlane.getRepairGuard(
        companyId,
        employeeId,
      );
      if (
        !guard.canRepair ||
        guard.repairDepth >= guard.decision.repairMaxDepth
      ) {
        return projection.snapshot as unknown as EmployeeProjectionSnapshot;
      }
      this.logger.warn(
        `Stale employee projection detected. Auto repairing employee=${employeeId} company=${companyId}`,
      );
      const lock = await this.controlPlane.acquireRepairLock({
        companyId,
        entityId: employeeId,
        owner: 'projection-auto-repair',
        source: 'projection-service',
        reason: 'stale_projection',
        ttlMs: 45_000,
      });

      if (!lock.acquired) {
        return projection.snapshot as unknown as EmployeeProjectionSnapshot;
      }

      this.controlPlane.recordRepairAttempt(companyId, employeeId);
      try {
        const rebuilt = (
          await this.rebuildEmployeeProjection(companyId, employeeId)
        ).snapshot;
        this.snapshotCache.set(cacheKey, {
          value: rebuilt,
          expiresAt: Date.now() + this.cacheTtlMs,
        });
        return rebuilt;
      } catch (error) {
        this.controlPlane.recordRepairFailure(companyId, employeeId);
        throw error;
      } finally {
        await this.controlPlane.releaseRepairLock({
          companyId,
          entityId: employeeId,
          owner: 'projection-auto-repair',
        });
      }
    }

    this.snapshotCache.set(cacheKey, {
      value: projection.snapshot as unknown as EmployeeProjectionSnapshot,
      expiresAt: Date.now() + this.cacheTtlMs,
    });
    return projection.snapshot as unknown as EmployeeProjectionSnapshot;
  }

  async rebuildEmployeeProjection(
    companyId: string,
    employeeId: string,
  ): Promise<{
    snapshot: EmployeeProjectionSnapshot;
    lastEventLogId: string | null;
  }> {
    const employee = await this.prisma.employee.findFirst({
      where: {
        id: employeeId,
        companyId,
      },
      include: {
        company: true,
        department: true,
        workGroup: true,
        user: true,
      },
    });

    const logs = (await this.prisma.tenantAuditLog.findMany({
      where: {
        companyId,
        entityType: 'Employee',
        entityId: employeeId,
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
      take: 2000,
    })) as EmployeeAuditLogRow[];

    const actionSet = new Set<string>(EMPLOYEE_EVENT_ACTION_LIST);

    const activityItems: EmployeeProjectionActivityItem[] = logs
      .filter((log) => actionSet.has(log.action))
      .map((log) => ({
        id: log.id,
        action: log.action,
        scope: log.scope,
        createdAt: log.createdAt,
        actor: log.actor,
      }));

    const departmentHistoryItems: EmployeeProjectionDepartmentHistoryItem[] =
      logs
        .filter(
          (log) =>
            log.action === EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_DEPARTMENT_CHANGED,
        )
        .map((log) => ({
          id: log.id,
          changedAt: log.createdAt,
          fromDepartmentId: this.toStringOrNull(log?.beforeData?.departmentId),
          fromDepartmentName: this.toStringOrNull(
            log?.beforeData?.departmentName,
          ),
          toDepartmentId: this.toStringOrNull(log?.afterData?.departmentId),
          toDepartmentName: this.toStringOrNull(log?.afterData?.departmentName),
          actor: log.actor,
          action: log.action,
          meta: log.meta,
        }));

    const lifecycleActionSet = new Set<string>([
      EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_STATUS_CHANGED,
      EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_HIRED,
      EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_TERMINATED,
      EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_REHIRED,
    ]);

    const lifecycleStatusHistory: EmployeeProjectionStatusHistoryItem[] = logs
      .filter((log) => lifecycleActionSet.has(log.action))
      .map((log) => ({
        id: log.id,
        action: log.action,
        createdAt: log.createdAt,
        fromStatus: this.toStringOrNull(log?.beforeData?.status),
        toStatus: this.toStringOrNull(log?.afterData?.status),
        actor: log.actor,
        meta: log.meta,
      }));

    const lifecycleRoleHistory: EmployeeProjectionRoleHistoryItem[] = logs
      .filter(
        (log) => log.action === EMPLOYEE_EVENT_ACTIONS.EMPLOYEE_ROLE_CHANGED,
      )
      .map((log) => ({
        id: log.id,
        action: log.action,
        createdAt: log.createdAt,
        fromRoleId: this.toStringOrNull(log?.beforeData?.roleId),
        toRoleId: this.toStringOrNull(log?.afterData?.roleId),
        fromRoleName: this.toStringOrNull(log?.beforeData?.roleName),
        toRoleName: this.toStringOrNull(log?.afterData?.roleName),
        actor: log.actor,
        meta: log.meta,
      }));

    const timelineItems: EmployeeProjectionTimelineItem[] = logs.map((log) => ({
      id: log.id,
      action: log.action,
      createdAt: log.createdAt,
      actor: log.actor,
      beforeData: log.beforeData,
      afterData: log.afterData,
      meta: log.meta,
    }));

    const lifecycle = {
      currentStatus: String(
        employee?.status || lifecycleStatusHistory[0]?.toStatus || 'UNKNOWN',
      ),
      hiredAt: employee?.hiredAt || null,
      terminatedAt: employee?.terminatedAt || null,
      terminationReason: employee?.terminationReason || null,
      statusHistory: lifecycleStatusHistory,
      roleHistory: lifecycleRoleHistory,
      loaded: true,
    };

    const snapshot: EmployeeProjectionSnapshot = {
      profile: employee,
      lifecycle,
      activity: this.paginate(activityItems, 1, 50),
      departmentHistory: this.paginate(departmentHistoryItems, 1, 50),
      timeline: this.paginate(timelineItems, 1, 100),
      totals: {
        activity: activityItems.length,
        departmentHistory: departmentHistoryItems.length,
        timeline: timelineItems.length,
      },
      generatedAt: new Date().toISOString(),
    };

    const projectionId = randomUUID();
    const lastEventLogId = logs[0]?.id || null;
    const snapshotText = JSON.stringify(snapshot);

    await this.prisma.$executeRaw`
      INSERT INTO "Employee360Projection" (
        "id", "companyId", "employeeId", "version", "lastEventLogId", "snapshot", "createdAt", "updatedAt"
      ) VALUES (
        ${projectionId}, ${companyId}, ${employeeId}, 1, ${lastEventLogId}, ${snapshotText}::jsonb, NOW(), NOW()
      )
      ON CONFLICT ("employeeId") DO UPDATE
      SET
        "companyId" = EXCLUDED."companyId",
        "lastEventLogId" = EXCLUDED."lastEventLogId",
        "snapshot" = EXCLUDED."snapshot",
        "version" = "Employee360Projection"."version" + 1,
        "updatedAt" = NOW()
    `;

    this.controlPlane.recordRepairAttempt(companyId, employeeId);

    const cacheKey = `${companyId}:${employeeId}`;
    this.snapshotCache.set(cacheKey, {
      value: snapshot,
      expiresAt: Date.now() + this.cacheTtlMs,
    });

    this.logger.debug(
      `Projection updated for employee=${employeeId} company=${companyId}`,
    );

    return {
      snapshot,
      lastEventLogId,
    };
  }

  async benchmarkProjectionReads(options?: {
    companyId?: string;
    limit?: number;
    batchSize?: number;
  }) {
    const limit = Math.min(1000, Math.max(1, options?.limit || 500));
    const batchSize = Math.min(100, Math.max(5, options?.batchSize || 25));

    const employees = await this.prisma.employee.findMany({
      where: options?.companyId ? { companyId: options.companyId } : undefined,
      select: { id: true, companyId: true },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const startedAt = Date.now();
    let processed = 0;

    for (let i = 0; i < employees.length; i += batchSize) {
      const chunk = employees.slice(i, i + batchSize);
      await Promise.all(
        chunk.map((item) =>
          this.getProjectionSnapshot(item.companyId, item.id, {
            repairIfStale: false,
          }),
        ),
      );
      processed += chunk.length;
    }

    const durationMs = Date.now() - startedAt;

    return {
      processed,
      limit,
      batchSize,
      durationMs,
      perEmployeeMs: processed
        ? Number((durationMs / processed).toFixed(2))
        : null,
      cacheEntries: this.snapshotCache.size,
    };
  }
}
