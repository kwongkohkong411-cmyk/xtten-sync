import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { EmployeeEventAction } from './event-actions';
import { EventInfrastructureService } from './event-infrastructure.service';

type EmployeeEventPayload = {
  eventLogId: string;
  companyId: string;
  entityType: 'Employee';
  entityId: string;
  action: EmployeeEventAction;
  createdAt: Date;
};

@Injectable()
export class EventLogService {
  private readonly logger = new Logger(EventLogService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly infrastructure: EventInfrastructureService,
  ) {}

  async emitEmployeeEvent(params: {
    companyId: string;
    actorId?: string;
    employeeId: string;
    action: EmployeeEventAction;
    beforeData?: Prisma.InputJsonValue | null;
    afterData?: Prisma.InputJsonValue | null;
    meta?: Prisma.InputJsonValue | null;
  }) {
    const health = await this.infrastructure.getHealth();

    return this.prisma.$transaction(async (tx) => {
      const log = await tx.tenantAuditLog.create({
        data: {
          companyId: params.companyId,
          actorId: params.actorId,
          action: params.action,
          scope: 'EVENT',
          entityType: 'Employee',
          entityId: params.employeeId,
          beforeData: params.beforeData ?? undefined,
          afterData: params.afterData ?? undefined,
          meta: params.meta ?? undefined,
        },
      });

      const queuePayload: EmployeeEventPayload = {
        eventLogId: log.id,
        companyId: params.companyId,
        entityType: 'Employee',
        entityId: params.employeeId,
        action: params.action,
        createdAt: log.createdAt,
      };
      const queuePayloadJson = JSON.stringify(queuePayload);

      if (!health.queue) {
        this.logger.warn(
          'EmployeeEventQueue table missing. Event stored in audit log only until migrations are applied.',
        );
        return log;
      }

      try {
        await tx.$executeRaw`
          INSERT INTO "EmployeeEventQueue" (
            "id", "companyId", "entityType", "entityId", "action", "eventLogId", "payload", "status", "attempts", "availableAt", "createdAt", "updatedAt"
          ) VALUES (
            ${randomUUID()}, ${params.companyId}, 'Employee', ${params.employeeId}, ${params.action}, ${log.id},
            ${queuePayloadJson}::jsonb, 'PENDING', 0, NOW(), NOW(), NOW()
          )
        `;
      } catch (error) {
        let text = '';
        if (error instanceof Error) {
          text = error.message;
        } else if (typeof error === 'string') {
          text = error;
        }
        if (text.includes('42P01') && text.includes('EmployeeEventQueue')) {
          this.logger.warn(
            'EmployeeEventQueue table missing. Event stored in audit log only. Apply migrations to enable async projection updates.',
          );
          return log;
        }

        throw error;
      }

      return log;
    });
  }
}
