import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EventControlPlaneService } from './event-control-plane.service';

type DeadLetterRow = {
  companyId: string;
  entityType: string;
  entityId: string;
  action: string;
  eventLogId: string;
  payload: Prisma.JsonValue;
};

@Injectable()
export class EventDlqLifecycleService {
  private readonly logger = new Logger(EventDlqLifecycleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly controlPlane: EventControlPlaneService,
  ) {}

  private async executeReplay(
    deadLetter: DeadLetterRow,
    actorId?: string,
    governance?: {
      code: string;
      message: string;
      remainingBudget?: number;
      decisionId?: string;
    },
  ) {
    const existingLedger =
      await this.prisma.employeeEventProcessingLedger.findUnique({
        where: { eventLogId: deadLetter.eventLogId },
      });

    if (existingLedger) {
      throw new BadRequestException(
        'Event already processed; replay would be ignored by idempotency guard',
      );
    }

    await this.prisma.employeeEventQueue.upsert({
      where: { eventLogId: deadLetter.eventLogId },
      create: {
        id: randomUUID(),
        companyId: deadLetter.companyId,
        entityType: deadLetter.entityType,
        entityId: deadLetter.entityId,
        action: deadLetter.action,
        eventLogId: deadLetter.eventLogId,
        payload: deadLetter.payload as Prisma.InputJsonValue,
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
      },
      update: {
        status: 'PENDING',
        attempts: 0,
        availableAt: new Date(),
        lastError: null,
        payload: deadLetter.payload as Prisma.InputJsonValue,
      },
    });

    await this.prisma.employeeEventDeadLetter.delete({
      where: { eventLogId: deadLetter.eventLogId },
    });

    this.logger.warn(`DLQ replayed eventLogId=${deadLetter.eventLogId}`);

    return {
      replayed: true,
      eventLogId: deadLetter.eventLogId,
      actorId: actorId || null,
      governance,
    };
  }

  async list(companyId?: string, limit = 50) {
    return this.prisma.employeeEventDeadLetter.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: { failedAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  async replay(eventLogId: string, actorId?: string) {
    const deadLetter = await this.prisma.employeeEventDeadLetter.findUnique({
      where: { eventLogId },
    });

    if (!deadLetter) {
      throw new NotFoundException('Dead-letter event not found');
    }

    const replayGuard = await this.controlPlane.guardDlqReplay({
      companyId: deadLetter.companyId,
      count: 1,
    });

    if (!replayGuard.allowed) {
      throw new BadRequestException(
        `${replayGuard.code}: ${replayGuard.message}`,
      );
    }

    return this.executeReplay(deadLetter, actorId, {
      code: replayGuard.code,
      message: replayGuard.message,
      remainingBudget: replayGuard.remainingBudget,
      decisionId: replayGuard.decision.decisionId,
    });
  }

  async replayBatch(eventLogIds: string[], actorId?: string) {
    const uniqueIds = Array.from(
      new Set((eventLogIds || []).filter((id): id is string => Boolean(id))),
    );
    if (!uniqueIds.length) {
      throw new BadRequestException('eventLogIds is required');
    }

    const safety = this.controlPlane.getSafetyConstraints();
    if (uniqueIds.length > safety.maxReplayBatch) {
      throw new BadRequestException(
        `REPLAY_BATCH_TOO_LARGE: maxReplayBatch=${safety.maxReplayBatch}`,
      );
    }

    const deadLetters = (await this.prisma.employeeEventDeadLetter.findMany({
      where: { eventLogId: { in: uniqueIds } },
      select: {
        eventLogId: true,
        companyId: true,
        entityType: true,
        entityId: true,
        action: true,
        payload: true,
      },
    })) as Array<{
      eventLogId: string;
      companyId: string;
      entityType: string;
      entityId: string;
      action: string;
      payload: Prisma.JsonValue;
    }>;

    const missing = uniqueIds.filter(
      (id) => !deadLetters.some((d) => d.eventLogId === id),
    );
    if (missing.length) {
      throw new NotFoundException(
        `Dead-letter event not found: ${missing.join(', ')}`,
      );
    }

    const grouped = new Map<string, string[]>();
    for (const row of deadLetters) {
      const list = grouped.get(row.companyId) || [];
      list.push(row.eventLogId);
      grouped.set(row.companyId, list);
    }

    for (const [companyId, ids] of grouped.entries()) {
      const guard = await this.controlPlane.guardDlqReplay({
        companyId,
        count: ids.length,
      });

      if (!guard.allowed) {
        throw new BadRequestException(`${guard.code}: ${guard.message}`);
      }
    }

    const deadLetterMap = new Map<string, DeadLetterRow>(
      deadLetters.map((row) => [row.eventLogId, row]),
    );

    const results: Array<{
      eventLogId: string;
      replayed: boolean;
      error?: string;
    }> = [];
    for (const eventLogId of uniqueIds) {
      try {
        const row = deadLetterMap.get(eventLogId);
        if (!row) {
          throw new NotFoundException(
            `Dead-letter event not found: ${eventLogId}`,
          );
        }

        await this.executeReplay(row, actorId, {
          code: 'BATCH_REPLAY',
          message: 'Replay approved in batch governance pre-check',
        });
        results.push({ eventLogId, replayed: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        results.push({
          eventLogId,
          replayed: false,
          error: message,
        });
      }
    }

    return {
      requested: uniqueIds.length,
      replayed: results.filter((r) => r.replayed).length,
      failed: results.filter((r) => !r.replayed).length,
      results,
    };
  }
}
