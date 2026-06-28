import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventInfrastructureService } from './event-infrastructure.service';

export type EventSystemMetrics = {
  eventQueueDepth: number;
  eventProcessingLatencyMs: number | null;
  projectionStalenessMs: number | null;
  dlqCount: number;
  dlqGrowthLastHour: number;
  retryCountLastHour: number;
  eventsProcessedLastHour: number;
  healthy: boolean;
};

@Injectable()
export class EventOpsService {
  private readonly logger = new Logger(EventOpsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly infrastructure: EventInfrastructureService,
  ) {}

  async getMetrics(companyId?: string): Promise<EventSystemMetrics> {
    const health = await this.infrastructure.getHealth();
    if (!health.queue || !health.projection || !health.deadLetter) {
      return {
        eventQueueDepth: 0,
        eventProcessingLatencyMs: null,
        projectionStalenessMs: null,
        dlqCount: 0,
        dlqGrowthLastHour: 0,
        retryCountLastHour: 0,
        eventsProcessedLastHour: 0,
        healthy: false,
      };
    }

    const filter = companyId ? { companyId } : {};
    const oneHourAgo = new Date(Date.now() - 60 * 60_000);

    const [
      queueDepth,
      oldestPending,
      dlqCount,
      dlqGrowthLastHour,
      retryCountLastHour,
      eventsProcessedLastHour,
      projectionRows,
    ] = await Promise.all([
      this.prisma.employeeEventQueue.count({
        where: {
          ...filter,
          status: 'PENDING',
        },
      }),
      this.prisma.employeeEventQueue.findFirst({
        where: {
          ...filter,
          status: 'PENDING',
        },
        orderBy: {
          createdAt: 'asc',
        },
        select: {
          createdAt: true,
        },
      }),
      this.prisma.employeeEventDeadLetter.count({
        where: filter,
      }),
      this.prisma.employeeEventDeadLetter.count({
        where: {
          ...filter,
          failedAt: {
            gte: oneHourAgo,
          },
        },
      }),
      this.prisma.employeeEventQueue.count({
        where: {
          ...filter,
          attempts: {
            gt: 0,
          },
          updatedAt: {
            gte: oneHourAgo,
          },
        },
      }),
      this.prisma.employeeEventQueue.count({
        where: {
          ...filter,
          processedAt: {
            gte: oneHourAgo,
          },
        },
      }),
      this.prisma.employee360Projection.findMany({
        where: filter,
        select: {
          employeeId: true,
          updatedAt: true,
          lastEventLogId: true,
        },
        take: 50,
      }),
    ]);

    let projectionStalenessMs: number | null = null;
    if (projectionRows.length > 0) {
      const latestProjectionUpdatedAt = projectionRows.reduce(
        (latest, row) => (row.updatedAt > latest ? row.updatedAt : latest),
        projectionRows[0].updatedAt,
      );
      projectionStalenessMs = Date.now() - latestProjectionUpdatedAt.getTime();
    }

    return {
      eventQueueDepth: queueDepth,
      eventProcessingLatencyMs: oldestPending
        ? Date.now() - oldestPending.createdAt.getTime()
        : null,
      projectionStalenessMs,
      dlqCount,
      dlqGrowthLastHour,
      retryCountLastHour,
      eventsProcessedLastHour,
      healthy: true,
    };
  }

  shouldThrottle(metrics: EventSystemMetrics) {
    const queueTooDeep = metrics.eventQueueDepth >= 100;
    const retryStorm = metrics.retryCountLastHour >= 60;
    const overloaded = metrics.eventsProcessedLastHour >= 300;
    const dlqSpike = metrics.dlqGrowthLastHour >= 10;

    return queueTooDeep || retryStorm || overloaded || dlqSpike;
  }

  async getHealth(companyId?: string) {
    const metrics = await this.getMetrics(companyId);
    return {
      ...metrics,
      throttled: this.shouldThrottle(metrics),
    };
  }
}
