import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventControlPlaneService } from './event-control-plane.service';
import { EventInfrastructureService } from './event-infrastructure.service';
import { Employee360ProjectionService } from './employee-360-projection.service';

@Injectable()
export class EventConsistencyCheckerService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(EventConsistencyCheckerService.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly infrastructure: EventInfrastructureService,
    private readonly controlPlane: EventControlPlaneService,
    private readonly projectionService: Employee360ProjectionService,
  ) {}

  onModuleInit() {
    this.timer = setInterval(() => {
      void this.checkConsistency();
    }, 60_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async checkConsistency() {
    if (this.running) return;
    this.running = true;

    try {
      const health = await this.infrastructure.getHealth();
      if (!health.queue || !health.projection) {
        this.logger.warn(
          'Consistency checker paused because queue/projection tables are not ready yet.',
        );
        return;
      }

      await this.repairStaleSnapshots();
      await this.repairMissingSnapshots();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Consistency check failed: ${message}`);
    } finally {
      this.running = false;
    }
  }

  private async repairStaleSnapshots() {
    const projections = await this.prisma.employee360Projection.findMany({
      orderBy: { updatedAt: 'asc' },
      take: 20,
      select: {
        companyId: true,
        employeeId: true,
        lastEventLogId: true,
        updatedAt: true,
      },
    });

    for (const projection of projections) {
      const latestLog = await this.prisma.tenantAuditLog.findFirst({
        where: {
          companyId: projection.companyId,
          entityType: 'Employee',
          entityId: projection.employeeId,
          scope: 'EVENT',
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (!latestLog) {
        continue;
      }

      if (projection.lastEventLogId !== latestLog.id) {
        const guard = await this.controlPlane.getRepairGuard(
          projection.companyId,
          projection.employeeId,
        );
        if (
          !guard.canRepair ||
          guard.repairDepth >= guard.decision.repairMaxDepth
        ) {
          continue;
        }

        const lock = await this.controlPlane.acquireRepairLock({
          companyId: projection.companyId,
          entityId: projection.employeeId,
          owner: 'consistency-checker',
          source: 'consistency-checker',
          reason: 'stale_projection',
          ttlMs: 60_000,
        });

        if (!lock.acquired) {
          continue;
        }

        this.logger.warn(
          `Repairing stale employee projection employee=${projection.employeeId} company=${projection.companyId}`,
        );
        this.controlPlane.recordRepairAttempt(
          projection.companyId,
          projection.employeeId,
        );
        try {
          await this.projectionService.rebuildEmployeeProjection(
            projection.companyId,
            projection.employeeId,
          );
        } catch (error) {
          this.controlPlane.recordRepairFailure(
            projection.companyId,
            projection.employeeId,
          );
          throw error;
        } finally {
          await this.controlPlane.releaseRepairLock({
            companyId: projection.companyId,
            entityId: projection.employeeId,
            owner: 'consistency-checker',
          });
        }
      }
    }
  }

  private async repairMissingSnapshots() {
    const missingRows = await this.prisma.$queryRaw<
      Array<{ companyId: string; employeeId: string }>
    >`
      SELECT q."companyId", q."employeeId"
      FROM (
        SELECT
          l."companyId",
          l."entityId" AS "employeeId",
          MAX(l."createdAt") AS "lastEventAt"
        FROM "TenantAuditLog" l
        WHERE l."scope" = 'EVENT'
          AND l."entityType" = 'Employee'
          AND NOT EXISTS (
            SELECT 1
            FROM "Employee360Projection" p
            WHERE p."employeeId" = l."entityId"
              AND p."companyId" = l."companyId"
          )
        GROUP BY l."companyId", l."entityId"
      ) q
      ORDER BY q."lastEventAt" DESC
      LIMIT 20
    `;

    for (const row of missingRows) {
      const guard = await this.controlPlane.getRepairGuard(
        row.companyId,
        row.employeeId,
      );
      if (
        !guard.canRepair ||
        guard.repairDepth >= guard.decision.repairMaxDepth
      ) {
        continue;
      }

      const lock = await this.controlPlane.acquireRepairLock({
        companyId: row.companyId,
        entityId: row.employeeId,
        owner: 'consistency-checker',
        source: 'consistency-checker',
        reason: 'missing_projection',
        ttlMs: 60_000,
      });

      if (!lock.acquired) {
        continue;
      }

      this.logger.warn(
        `Rebuilding missing employee projection employee=${row.employeeId} company=${row.companyId}`,
      );
      this.controlPlane.recordRepairAttempt(row.companyId, row.employeeId);
      try {
        await this.projectionService.rebuildEmployeeProjection(
          row.companyId,
          row.employeeId,
        );
      } catch (error) {
        this.controlPlane.recordRepairFailure(row.companyId, row.employeeId);
        throw error;
      } finally {
        await this.controlPlane.releaseRepairLock({
          companyId: row.companyId,
          entityId: row.employeeId,
          owner: 'consistency-checker',
        });
      }
    }
  }
}
