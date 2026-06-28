import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventInfrastructureService } from './event-infrastructure.service';

@Injectable()
export class EventDeadLetterService {
  private readonly logger = new Logger(EventDeadLetterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly infrastructure: EventInfrastructureService,
  ) {}

  private toNullableJsonInput(
    payload: Prisma.InputJsonValue | null | undefined,
  ) {
    if (payload === null) {
      return Prisma.JsonNull;
    }
    return payload;
  }

  async moveEmployeeEventToDeadLetter(params: {
    companyId: string;
    employeeId: string;
    action: string;
    eventLogId: string;
    payload?: Prisma.InputJsonValue | null;
    attempts: number;
    lastError: string;
  }) {
    if (!(await this.infrastructure.canUseDeadLetter())) {
      this.logger.warn(
        `Dead-letter table missing. Skipping DLQ write for employee=${params.employeeId} eventLogId=${params.eventLogId}`,
      );
      return null;
    }

    return this.prisma.employeeEventDeadLetter.upsert({
      where: {
        eventLogId: params.eventLogId,
      },
      create: {
        id: randomUUID(),
        companyId: params.companyId,
        entityType: 'Employee',
        entityId: params.employeeId,
        action: params.action,
        eventLogId: params.eventLogId,
        payload: this.toNullableJsonInput(params.payload),
        attempts: params.attempts,
        lastError: params.lastError,
        failedAt: new Date(),
      },
      update: {
        attempts: params.attempts,
        lastError: params.lastError,
        payload: this.toNullableJsonInput(params.payload),
        failedAt: new Date(),
      },
    });
  }
}
