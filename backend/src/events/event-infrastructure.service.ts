import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type TableHealth = {
  queue: boolean;
  projection: boolean;
  deadLetter: boolean;
  ready: boolean;
};

@Injectable()
export class EventInfrastructureService implements OnModuleInit {
  private readonly logger = new Logger(EventInfrastructureService.name);
  private cachedHealth: { value: TableHealth; expiresAt: number } | null = null;
  private readonly cacheTtlMs = 15_000;
  private readonly dbErrorCacheTtlMs = 5_000;
  private readonly dbWarnIntervalMs = 60_000;
  private lastDbWarnAt = 0;
  private suppressedDbWarnCount = 0;

  constructor(private readonly prisma: PrismaService) {}

  private isDbUnreachableError(error: unknown) {
    if (!error || typeof error !== 'object') return false;
    const candidate = error as { code?: string; message?: string };
    if (candidate.code === 'P1001') return true;
    const message = String(candidate.message || '').toLowerCase();
    return (
      message.includes("can't reach database server") ||
      message.includes('database server')
    );
  }

  private warnDbUnavailable(message: string) {
    const now = Date.now();
    if (now - this.lastDbWarnAt >= this.dbWarnIntervalMs) {
      const suffix =
        this.suppressedDbWarnCount > 0
          ? ` (suppressed ${this.suppressedDbWarnCount} similar warn logs)`
          : '';
      this.logger.warn(`${message}${suffix}`);
      this.lastDbWarnAt = now;
      this.suppressedDbWarnCount = 0;
      return;
    }

    this.suppressedDbWarnCount += 1;
  }

  async onModuleInit() {
    let health: TableHealth;
    try {
      health = await this.getHealth(true);
    } catch (error: unknown) {
      if (this.isDbUnreachableError(error)) {
        this.warnDbUnavailable(
          'Event infrastructure init degraded: database is temporarily unreachable (P1001).',
        );
        return;
      }
      throw error;
    }

    if (!health.ready) {
      this.logger.warn(
        `Event infrastructure not fully ready. Missing tables: ${[
          !health.queue ? 'EmployeeEventQueue' : null,
          !health.projection ? 'Employee360Projection' : null,
          !health.deadLetter ? 'EmployeeEventDeadLetter' : null,
        ]
          .filter(Boolean)
          .join(', ')}`,
      );
    }
  }

  private async tableExists(tableName: string) {
    const rows = await this.prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT to_regclass(${`public."${tableName}"`}) IS NOT NULL AS "exists"
    `;

    return !!rows[0]?.exists;
  }

  async getHealth(forceRefresh = false): Promise<TableHealth> {
    if (
      !forceRefresh &&
      this.cachedHealth &&
      Date.now() < this.cachedHealth.expiresAt
    ) {
      return this.cachedHealth.value;
    }

    let queue = false;
    let projection = false;
    let deadLetter = false;

    try {
      [queue, projection, deadLetter] = await Promise.all([
        this.tableExists('EmployeeEventQueue'),
        this.tableExists('Employee360Projection'),
        this.tableExists('EmployeeEventDeadLetter'),
      ]);
    } catch (error: unknown) {
      if (!this.isDbUnreachableError(error)) {
        throw error;
      }

      this.warnDbUnavailable(
        'Event infrastructure health check degraded: database is temporarily unreachable (P1001).',
      );

      const degraded: TableHealth = {
        queue: false,
        projection: false,
        deadLetter: false,
        ready: false,
      };

      this.cachedHealth = {
        value: degraded,
        expiresAt: Date.now() + this.dbErrorCacheTtlMs,
      };

      return degraded;
    }

    const value: TableHealth = {
      queue,
      projection,
      deadLetter,
      ready: queue && projection && deadLetter,
    };

    this.cachedHealth = {
      value,
      expiresAt: Date.now() + this.cacheTtlMs,
    };

    return value;
  }

  async canUseQueue() {
    return (await this.getHealth()).queue;
  }

  async canUseProjection() {
    return (await this.getHealth()).projection;
  }

  async canUseDeadLetter() {
    return (await this.getHealth()).deadLetter;
  }
}
