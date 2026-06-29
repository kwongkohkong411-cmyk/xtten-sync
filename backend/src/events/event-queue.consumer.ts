import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventDeadLetterService } from './event-dead-letter.service';
import { EventInfrastructureService } from './event-infrastructure.service';
import { EventControlPlaneService } from './event-control-plane.service';
import { Employee360ProjectionService } from './employee-360-projection.service';

type QueueRow = {
  id: string;
  companyId: string;
  entityId: string;
  eventLogId: string;
  action: string;
  payload: Prisma.JsonValue | null;
  attempts: number;
};

@Injectable()
export class EventQueueConsumer implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventQueueConsumer.name);
  private timer: NodeJS.Timeout | null = null;
  private watchdog: NodeJS.Timeout | null = null;
  private running = false;
  private runningSince = 0;
  private readonly maxQueueConcurrency = 2;
  private readonly maxBatchSize = 10;
  private readonly maxRunningWindowMs = 60_000;
  private readonly dbBackoffScheduleMs = [5_000, 15_000, 30_000, 60_000] as const;
  private dbBackoffIndex = 0;
  private nextPollAt = 0;
  private readonly warnIntervalMs = 60_000;
  private lastWarnAt = 0;
  private suppressedWarnCount = 0;
  private lastPauseWarnAt = 0;
  private pauseWarnSuppressedCount = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly infrastructure: EventInfrastructureService,
    private readonly controlPlane: EventControlPlaneService,
    private readonly projectionService: Employee360ProjectionService,
    private readonly deadLetterService: EventDeadLetterService,
  ) {}

  private errorMessage(error: unknown) {
    if (error instanceof Error) return error.message;
    if (typeof error === 'string') return error;
    return 'Unknown queue error';
  }

  private isDbUnreachableError(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: string; message?: string };
    if (candidate.code === 'P1001') return true;
    const message = String(candidate.message || '').toLowerCase();
    return message.includes("can't reach database server");
  }

  private warnRateLimited(message: string) {
    const now = Date.now();
    if (now - this.lastWarnAt >= this.warnIntervalMs) {
      const suffix =
        this.suppressedWarnCount > 0
          ? ` (suppressed ${this.suppressedWarnCount} similar warn logs)`
          : '';
      this.logger.warn(`${message}${suffix}`);
      this.lastWarnAt = now;
      this.suppressedWarnCount = 0;
      return;
    }
    this.suppressedWarnCount += 1;
  }

  private warnPauseRateLimited(message: string) {
    const now = Date.now();
    if (now - this.lastPauseWarnAt >= this.warnIntervalMs) {
      const suffix =
        this.pauseWarnSuppressedCount > 0
          ? ` (suppressed ${this.pauseWarnSuppressedCount} similar warn logs)`
          : '';
      this.logger.warn(`${message}${suffix}`);
      this.lastPauseWarnAt = now;
      this.pauseWarnSuppressedCount = 0;
      return;
    }
    this.pauseWarnSuppressedCount += 1;
  }

  private scheduleDbBackoff(error: unknown) {
    const delay =
      this.dbBackoffScheduleMs[
        Math.min(this.dbBackoffIndex, this.dbBackoffScheduleMs.length - 1)
      ];
    this.nextPollAt = Date.now() + delay;
    if (this.dbBackoffIndex < this.dbBackoffScheduleMs.length - 1) {
      this.dbBackoffIndex += 1;
    }

    this.warnRateLimited(
      `Queue consumer degraded: database unreachable (P1001). Backing off ${Math.round(
        delay / 1000,
      )}s. error=${this.errorMessage(error)}`,
    );
  }

  private resetDbBackoffIfNeeded() {
    if (this.dbBackoffIndex === 0 && this.nextPollAt === 0) {
      return;
    }

    this.dbBackoffIndex = 0;
    this.nextPollAt = 0;
    this.logger.log('Queue consumer connectivity recovered. Backoff reset.');
  }

  onModuleInit() {
    if (this.timer) {
      clearInterval(this.timer);
    }

    this.timer = setInterval(() => {
      void this.processBatch();
    }, 1500);

    this.watchdog = setInterval(() => {
      if (!this.running || !this.runningSince) return;
      const duration = Date.now() - this.runningSince;
      if (duration > this.maxRunningWindowMs) {
        this.logger.warn(`Queue worker watchdog reset after ${duration}ms`);
        this.running = false;
        this.runningSince = 0;
      }
    }, 10_000);
  }

  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
    }
    if (this.watchdog) {
      clearInterval(this.watchdog);
    }
  }

  private getRetryDelayMs(attempts: number) {
    const baseDelay = 5_000;
    const capped = Math.min(
      15 * 60_000,
      baseDelay * 2 ** Math.max(0, attempts - 1),
    );
    return capped;
  }

  private async inBatches<T>(
    items: T[],
    batchSize: number,
    handler: (item: T) => Promise<void>,
  ) {
    for (let index = 0; index < items.length; index += batchSize) {
      const chunk = items.slice(index, index + batchSize);
      await Promise.all(chunk.map((item) => handler(item)));
    }
  }

  private async processBatch() {
    if (this.running) return;

    if (this.nextPollAt && Date.now() < this.nextPollAt) {
      return;
    }

    let health;
    try {
      health = await this.infrastructure.getHealth();
    } catch (error: unknown) {
      if (this.isDbUnreachableError(error)) {
        this.scheduleDbBackoff(error);
        return;
      }
      throw error;
    }

    if (!health.queue || !health.projection) {
      this.warnPauseRateLimited(
        'Queue consumer paused because queue/projection tables are not ready yet. Apply migrations first.',
      );
      return;
    }

    let shouldThrottle = false;
    try {
      shouldThrottle = await this.controlPlane.shouldThrottleQueue();
    } catch (error: unknown) {
      if (this.isDbUnreachableError(error)) {
        this.scheduleDbBackoff(error);
        return;
      }
      throw error;
    }

    if (shouldThrottle) {
      try {
        const metrics = await this.controlPlane.getDecision();
        this.warnPauseRateLimited(
          `Queue throttled depth=${metrics.metrics.eventQueueDepth} retry=${metrics.metrics.retryCountLastHour} processed=${metrics.metrics.eventsProcessedLastHour}`,
        );
      } catch (error: unknown) {
        if (this.isDbUnreachableError(error)) {
          this.scheduleDbBackoff(error);
          return;
        }
        throw error;
      }
      return;
    }

    let queueDepth = 0;
    try {
      queueDepth = await this.prisma.employeeEventQueue.count({
        where: {
          status: 'PENDING',
          availableAt: { lte: new Date() },
        },
      });
    } catch (error: unknown) {
      if (this.isDbUnreachableError(error)) {
        this.scheduleDbBackoff(error);
        return;
      }
      throw error;
    }

    if (queueDepth >= 5000) {
      this.logger.error(
        `Queue protection activated: backlog depth=${queueDepth}. Manual intervention required.`,
      );
      return;
    }

    const batchSize =
      queueDepth >= 500 ? 3 : queueDepth >= 200 ? 5 : this.maxBatchSize;
    const concurrency =
      queueDepth >= 500 ? 1 : queueDepth >= 200 ? 1 : this.maxQueueConcurrency;

    this.running = true;
    this.runningSince = Date.now();

    try {
      const rows = await this.prisma.employeeEventQueue.findMany({
        where: {
          status: 'PENDING',
          availableAt: {
            lte: new Date(),
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: batchSize,
      });

      await this.inBatches(rows, concurrency, async (row) =>
        this.processOne(row),
      );
      this.resetDbBackoffIfNeeded();
    } catch (error: unknown) {
      if (this.isDbUnreachableError(error)) {
        this.scheduleDbBackoff(error);
        return;
      }
      this.logger.error(`Queue batch failed: ${this.errorMessage(error)}`);
    } finally {
      this.running = false;
      this.runningSince = 0;
    }
  }

  private async processOne(row: QueueRow) {
    try {
      const existingLedger =
        await this.prisma.employeeEventProcessingLedger.findUnique({
          where: { eventLogId: row.eventLogId },
        });

      if (existingLedger) {
        await this.prisma.employeeEventQueue.update({
          where: { id: row.id },
          data: {
            status: 'DONE',
            processedAt: new Date(),
            lastError: null,
          },
        });
        return;
      }

      await this.prisma.employeeEventQueue.update({
        where: { id: row.id },
        data: { status: 'PROCESSING' },
      });

      const currentProjection = await this.projectionService.getProjection(
        row.companyId,
        row.entityId,
      );
      if (currentProjection?.lastEventLogId === row.eventLogId) {
        await this.prisma.employeeEventProcessingLedger.upsert({
          where: { eventLogId: row.eventLogId },
          create: {
            id: row.eventLogId,
            companyId: row.companyId,
            entityType: 'Employee',
            entityId: row.entityId,
            eventLogId: row.eventLogId,
            projectionVersion: currentProjection.version,
          },
          update: {
            processedAt: new Date(),
            projectionVersion: currentProjection.version,
          },
        });

        await this.prisma.employeeEventQueue.update({
          where: { id: row.id },
          data: {
            status: 'DONE',
            processedAt: new Date(),
            lastError: null,
          },
        });

        return;
      }

      const lock = await this.controlPlane.acquireRepairLock({
        companyId: row.companyId,
        entityId: row.entityId,
        owner: 'queue-consumer',
        source: 'event-queue-consumer',
        reason: row.action,
        ttlMs: 45_000,
      });

      if (!lock.acquired) {
        await this.prisma.employeeEventQueue.update({
          where: { id: row.id },
          data: {
            status: 'PENDING',
            attempts: row.attempts + 1,
            lastError: 'Repair lock held by another actor',
            availableAt: new Date(
              Date.now() + this.getRetryDelayMs(row.attempts + 1),
            ),
          },
        });
        return;
      }

      await this.projectionService.rebuildEmployeeProjection(
        row.companyId,
        row.entityId,
      );

      await this.prisma.employeeEventProcessingLedger.upsert({
        where: { eventLogId: row.eventLogId },
        create: {
          id: row.eventLogId,
          companyId: row.companyId,
          entityType: 'Employee',
          entityId: row.entityId,
          eventLogId: row.eventLogId,
          projectionVersion: currentProjection?.version
            ? currentProjection.version + 1
            : 1,
        },
        update: {
          processedAt: new Date(),
          projectionVersion: currentProjection?.version
            ? currentProjection.version + 1
            : 1,
        },
      });

      await this.prisma.employeeEventQueue.update({
        where: { id: row.id },
        data: {
          status: 'DONE',
          processedAt: new Date(),
          lastError: null,
        },
      });

      await this.controlPlane.releaseRepairLock({
        companyId: row.companyId,
        entityId: row.entityId,
        owner: 'queue-consumer',
      });
    } catch (error: unknown) {
      const maxAttempts = 5;
      const nextAttempts = row.attempts + 1;
      const errorMessage = this.errorMessage(error).slice(0, 500);

      if (nextAttempts >= maxAttempts) {
        await this.deadLetterService.moveEmployeeEventToDeadLetter({
          companyId: row.companyId,
          employeeId: row.entityId,
          action: row.action,
          eventLogId: row.eventLogId,
          payload: row.payload,
          attempts: nextAttempts,
          lastError: errorMessage,
        });

        await this.prisma.employeeEventQueue.update({
          where: { id: row.id },
          data: {
            status: 'DEAD_LETTER',
            attempts: nextAttempts,
            lastError: errorMessage,
            processedAt: new Date(),
          },
        });
      } else {
        await this.prisma.employeeEventQueue.update({
          where: { id: row.id },
          data: {
            status: 'PENDING',
            attempts: nextAttempts,
            lastError: errorMessage,
            availableAt: new Date(
              Date.now() + this.getRetryDelayMs(nextAttempts),
            ),
          },
        });
      }

      this.logger.warn(
        `Queue item failed id=${row.id} attempts=${nextAttempts} error=${errorMessage}`,
      );
    }
  }
}
