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

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const health = await this.getHealth(true);
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

    const [queue, projection, deadLetter] = await Promise.all([
      this.tableExists('EmployeeEventQueue'),
      this.tableExists('Employee360Projection'),
      this.tableExists('EmployeeEventDeadLetter'),
    ]);

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
