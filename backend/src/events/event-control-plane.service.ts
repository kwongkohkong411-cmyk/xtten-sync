import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  EventGovernancePolicyService,
  GovernancePolicyConfig,
} from './event-governance-policy.service';
import { EventOpsService, EventSystemMetrics } from './event-ops.service';

export type EventControlDecision = {
  throttleQueue: boolean;
  pauseAutoRepair: boolean;
  freezeDlqReplay: boolean;
  repairBudgetPerMinute: number;
  repairCooldownPerEntityMs: number;
  repairMaxDepth: number;
  reason: string[];
  refreshedAt: string;
  metrics: EventSystemMetrics;
  stable: boolean;
  stableForMs: number;
  manualFreeze: boolean;
  manualFreezeReason?: string;
  dryRunEnabled: boolean;
  dryRunReason?: string;
  decisionId: string;
  arbitrationVersion: string;
  governanceTrace: Array<{
    source: string;
    rule: string;
    priority: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
    triggered: boolean;
    effects: {
      throttleQueue?: boolean;
      pauseAutoRepair?: boolean;
      freezeDlqReplay?: boolean;
    };
    reason?: string;
  }>;
  safetyConstraints: {
    maxReplayBatch: number;
    replayBudgetPerMinute: number;
    backlogHardStopDepth: number;
  };
};

type ManualFreezeState = {
  enabled: boolean;
  reason?: string;
  updatedAt: string;
};

type DryRunState = {
  enabled: boolean;
  reason?: string;
  updatedAt: string;
};

@Injectable()
export class EventControlPlaneService {
  private readonly logger = new Logger(EventControlPlaneService.name);
  private readonly arbitrationVersion = 'governance-v2';
  private decisionSeq = 0;
  private cachedDecision: {
    value: EventControlDecision;
    expiresAt: number;
  } | null = null;
  private readonly decisionTtlMs = 5_000;
  private readonly decisionStabilizationMs = 15_000;
  private pendingDecision: {
    fingerprint: string;
    decision: EventControlDecision;
    since: number;
  } | null = null;
  private appliedDecision: EventControlDecision | null = null;
  private readonly repairAttempts = new Map<string, number[]>();
  private readonly repairCooldowns = new Map<string, number>();
  private readonly lastRecordedDecisionFingerprint = new Map<string, string>();
  private readonly replayAttempts = new Map<string, number[]>();
  private readonly policyWarnIntervalMs = 60_000;
  private lastPolicyWarnAt = 0;
  private lastPolicyWarnMessage = '';
  private suppressedPolicyWarnCount = 0;
  private manualFreeze: ManualFreezeState = {
    enabled: false,
    updatedAt: new Date().toISOString(),
  };
  private dryRun: DryRunState = {
    enabled: false,
    updatedAt: new Date().toISOString(),
  };

  constructor(
    private readonly eventOpsService: EventOpsService,
    private readonly prisma: PrismaService,
    private readonly governancePolicy: EventGovernancePolicyService,
  ) {}

  private warnPolicyRateLimited(message: string) {
    const now = Date.now();
    const isSameMessage = this.lastPolicyWarnMessage === message;

    if (
      !isSameMessage ||
      now - this.lastPolicyWarnAt >= this.policyWarnIntervalMs
    ) {
      const suffix =
        this.suppressedPolicyWarnCount > 0
          ? ` (suppressed ${this.suppressedPolicyWarnCount} similar warn logs)`
          : '';
      this.logger.warn(`${message}${suffix}`);
      this.lastPolicyWarnAt = now;
      this.lastPolicyWarnMessage = message;
      this.suppressedPolicyWarnCount = 0;
      return;
    }

    this.suppressedPolicyWarnCount += 1;
  }

  private createDecision(
    metrics: EventSystemMetrics,
    previous?: EventControlDecision | null,
    options?: {
      companyId?: string;
      policyOverride?: Partial<GovernancePolicyConfig>;
      simulated?: boolean;
    },
  ): EventControlDecision {
    const policy = this.governancePolicy.getPolicy(
      options?.companyId,
      options?.policyOverride,
    );
    const reason: string[] = [];
    const trace: EventControlDecision['governanceTrace'] = [];

    const baseThrottle = previous?.throttleQueue
      ? metrics.eventQueueDepth >= policy.queue.throttleOffDepth ||
        metrics.retryCountLastHour >= policy.queue.retryOffPerHour ||
        metrics.eventsProcessedLastHour >= policy.queue.processedOffPerHour ||
        metrics.dlqGrowthLastHour >= policy.queue.dlqGrowthOffPerHour
      : metrics.eventQueueDepth >= policy.queue.throttleOnDepth ||
        metrics.retryCountLastHour >= policy.queue.retryOnPerHour ||
        metrics.eventsProcessedLastHour >= policy.queue.processedOnPerHour ||
        metrics.dlqGrowthLastHour >= policy.queue.dlqGrowthOnPerHour;
    const basePauseRepair = previous?.pauseAutoRepair
      ? (metrics.dlqCount >= policy.repair.pauseOffDlqCount &&
          metrics.retryCountLastHour >= policy.repair.pauseOffRetryPerHour) ||
        (metrics.projectionStalenessMs !== null &&
          metrics.projectionStalenessMs >
            policy.repair.pauseOffProjectionStalenessMs)
      : (metrics.dlqCount >= policy.repair.pauseOnDlqCount &&
          metrics.retryCountLastHour >= policy.repair.pauseOnRetryPerHour) ||
        (metrics.projectionStalenessMs !== null &&
          metrics.projectionStalenessMs >
            policy.repair.pauseOnProjectionStalenessMs);
    const baseFreezeDlq = previous?.freezeDlqReplay
      ? metrics.dlqCount >= policy.replay.freezeOffDlqCount ||
        metrics.retryCountLastHour >= policy.replay.freezeOffRetryPerHour
      : metrics.dlqCount >= policy.replay.freezeOnDlqCount ||
        metrics.retryCountLastHour >= policy.replay.freezeOnRetryPerHour;

    let throttleQueue = baseThrottle;
    let pauseAutoRepair = basePauseRepair;
    let freezeDlqReplay = baseFreezeDlq;

    trace.push({
      source: 'metrics',
      rule: 'baseline_hysteresis',
      priority: 'LOW',
      triggered: true,
      effects: {
        throttleQueue: baseThrottle,
        pauseAutoRepair: basePauseRepair,
        freezeDlqReplay: baseFreezeDlq,
      },
      reason:
        'Baseline health policy from queue/dlq/retry/staleness thresholds',
    });

    if (metrics.eventQueueDepth >= policy.safety.backlogHardStopDepth) {
      throttleQueue = true;
      pauseAutoRepair = true;
      freezeDlqReplay = true;
      reason.push('backlog_hard_stop');
      trace.push({
        source: 'safety',
        rule: 'backlog_hard_stop',
        priority: 'CRITICAL',
        triggered: true,
        effects: {
          throttleQueue: true,
          pauseAutoRepair: true,
          freezeDlqReplay: true,
        },
        reason: `Queue depth ${metrics.eventQueueDepth} exceeds hard stop ${policy.safety.backlogHardStopDepth}`,
      });
    } else {
      trace.push({
        source: 'safety',
        rule: 'backlog_hard_stop',
        priority: 'CRITICAL',
        triggered: false,
        effects: {},
      });
    }

    if (this.manualFreeze.enabled) {
      throttleQueue = true;
      pauseAutoRepair = true;
      freezeDlqReplay = true;
      reason.push('manual_freeze');
      trace.push({
        source: 'operator',
        rule: 'manual_freeze_switch',
        priority: 'CRITICAL',
        triggered: true,
        effects: {
          throttleQueue: true,
          pauseAutoRepair: true,
          freezeDlqReplay: true,
        },
        reason: this.manualFreeze.reason || 'operator_forced_freeze',
      });
    }

    if (this.dryRun.enabled) {
      trace.push({
        source: 'operator',
        rule: 'dry_run_mode',
        priority: 'HIGH',
        triggered: true,
        effects: {
          throttleQueue: false,
          pauseAutoRepair: false,
          freezeDlqReplay: false,
        },
        reason: this.dryRun.reason || 'dry_run_enabled',
      });
    }

    if (metrics.eventQueueDepth >= policy.queue.throttleOnDepth)
      reason.push('queue_depth');
    if (metrics.retryCountLastHour >= policy.queue.retryOnPerHour)
      reason.push('retry_storm');
    if (metrics.eventsProcessedLastHour >= policy.queue.processedOnPerHour)
      reason.push('consumer_overload');
    if (metrics.dlqCount >= policy.repair.pauseOnDlqCount)
      reason.push('dlq_growth');
    if (
      metrics.projectionStalenessMs !== null &&
      metrics.projectionStalenessMs > policy.repair.pauseOnProjectionStalenessMs
    )
      reason.push('projection_staleness');

    this.decisionSeq += 1;
    const decisionId = `${options?.simulated ? 'sim' : 'cp'}-${Date.now()}-${this.decisionSeq}`;

    return {
      throttleQueue,
      pauseAutoRepair,
      freezeDlqReplay,
      repairBudgetPerMinute: policy.repair.budgetPerMinute,
      repairCooldownPerEntityMs: policy.repair.cooldownPerEntityMs,
      repairMaxDepth: policy.repair.maxDepth,
      reason,
      refreshedAt: new Date().toISOString(),
      metrics,
      stable: false,
      stableForMs: 0,
      manualFreeze: this.manualFreeze.enabled,
      manualFreezeReason: this.manualFreeze.reason,
      dryRunEnabled: this.dryRun.enabled,
      dryRunReason: this.dryRun.reason,
      decisionId,
      arbitrationVersion: this.arbitrationVersion,
      governanceTrace: trace,
      safetyConstraints: {
        maxReplayBatch: policy.replay.maxBatch,
        replayBudgetPerMinute: policy.replay.budgetPerMinute,
        backlogHardStopDepth: policy.safety.backlogHardStopDepth,
      },
    };
  }

  private fingerprint(decision: EventControlDecision) {
    return JSON.stringify({
      throttleQueue: decision.throttleQueue,
      pauseAutoRepair: decision.pauseAutoRepair,
      freezeDlqReplay: decision.freezeDlqReplay,
      repairBudgetPerMinute: decision.repairBudgetPerMinute,
      repairCooldownPerEntityMs: decision.repairCooldownPerEntityMs,
      repairMaxDepth: decision.repairMaxDepth,
      reason: decision.reason,
    });
  }

  private withStability(
    decision: EventControlDecision,
    stableForMs: number,
    stable: boolean,
  ): EventControlDecision {
    return {
      ...decision,
      stableForMs,
      stable,
    };
  }

  private decisionKey(decision: EventControlDecision) {
    return this.fingerprint(decision);
  }

  private async recordDecisionSnapshot(decision: EventControlDecision) {
    const key = this.decisionKey(decision);
    const prevKey = this.lastRecordedDecisionFingerprint.get('global');
    if (prevKey === key) {
      return;
    }

    await this.prisma.eventControlDecisionLog.create({
      data: {
        id: `${Date.now()}-${key.slice(0, 12)}`,
        decisionKey: key,
        decisionText: [
          decision.throttleQueue ? 'THROTTLE_ON' : 'THROTTLE_OFF',
          decision.pauseAutoRepair ? 'REPAIR_PAUSE_ON' : 'REPAIR_PAUSE_OFF',
          decision.freezeDlqReplay ? 'DLQ_FREEZE_ON' : 'DLQ_FREEZE_OFF',
        ].join(' | '),
        reason: {
          reasonCodes: decision.reason,
          decisionId: decision.decisionId,
          arbitrationVersion: decision.arbitrationVersion,
          manualFreeze: decision.manualFreeze,
          manualFreezeReason: decision.manualFreezeReason || null,
          dryRunEnabled: decision.dryRunEnabled,
          dryRunReason: decision.dryRunReason || null,
        },
        impact: {
          queueThrottled: decision.throttleQueue,
          autoRepairPaused: decision.pauseAutoRepair,
          dlqReplayFrozen: decision.freezeDlqReplay,
          manualFreeze: decision.manualFreeze,
          manualFreezeReason: decision.manualFreezeReason || null,
          dryRunEnabled: decision.dryRunEnabled,
          dryRunReason: decision.dryRunReason || null,
          governanceTrace: decision.governanceTrace,
          safetyConstraints: decision.safetyConstraints,
          repairBudgetPerMinute: decision.repairBudgetPerMinute,
          repairCooldownPerEntityMs: decision.repairCooldownPerEntityMs,
          repairMaxDepth: decision.repairMaxDepth,
        },
        metrics: decision.metrics,
        stable: decision.stable,
        stableForMs: decision.stableForMs,
      },
    });

    this.lastRecordedDecisionFingerprint.set('global', key);
  }

  private async computeAppliedDecision(forceRefresh = false) {
    const metrics = await this.eventOpsService.getMetrics();
    const candidate = this.createDecision(metrics, this.appliedDecision);
    const now = Date.now();
    const fingerprint = this.fingerprint(candidate);

    if (
      !this.pendingDecision ||
      this.pendingDecision.fingerprint !== fingerprint
    ) {
      this.pendingDecision = {
        fingerprint,
        decision: candidate,
        since: now,
      };
    }

    const pendingForMs = now - this.pendingDecision.since;
    const isStable = pendingForMs >= this.decisionStabilizationMs;

    if (!this.appliedDecision) {
      if (!isStable && !forceRefresh) {
        return this.withStability(
          this.pendingDecision.decision,
          pendingForMs,
          false,
        );
      }

      if (isStable || forceRefresh) {
        this.appliedDecision = this.withStability(
          this.pendingDecision.decision,
          pendingForMs,
          true,
        );
        return this.appliedDecision;
      }
    }

    if (isStable) {
      this.appliedDecision = this.withStability(
        this.pendingDecision.decision,
        pendingForMs,
        true,
      );
      return this.appliedDecision;
    }

    return this.withStability(
      this.appliedDecision || this.pendingDecision.decision,
      pendingForMs,
      false,
    );
  }

  async getDecision(forceRefresh = false) {
    if (
      !forceRefresh &&
      this.cachedDecision &&
      Date.now() < this.cachedDecision.expiresAt
    ) {
      return this.cachedDecision.value;
    }

    const decision = await this.computeAppliedDecision(forceRefresh);

    this.cachedDecision = {
      value: decision,
      expiresAt: Date.now() + this.decisionTtlMs,
    };

    if (
      decision.throttleQueue ||
      decision.pauseAutoRepair ||
      decision.freezeDlqReplay
    ) {
      this.warnPolicyRateLimited(
        `Event policy: throttle=${decision.throttleQueue} pauseRepair=${decision.pauseAutoRepair} freezeDlq=${decision.freezeDlqReplay} reason=${decision.reason.join(',')}`,
      );
    }

    if (decision.stable) {
      await this.recordDecisionSnapshot(decision);
    }

    return decision;
  }

  async shouldThrottleQueue() {
    const decision = await this.getDecision();
    if (this.dryRun.enabled) {
      return false;
    }
    return decision.throttleQueue;
  }

  async shouldPauseAutoRepair() {
    const decision = await this.getDecision();
    if (this.dryRun.enabled) {
      return false;
    }
    return decision.pauseAutoRepair;
  }

  async shouldFreezeDlqReplay() {
    const decision = await this.getDecision();
    if (this.dryRun.enabled) {
      return false;
    }
    return decision.freezeDlqReplay;
  }

  getManualFreezeState() {
    return this.manualFreeze;
  }

  async setManualFreeze(enabled: boolean, reason?: string) {
    this.manualFreeze = {
      enabled,
      reason: reason || null || undefined,
      updatedAt: new Date().toISOString(),
    };

    // Force immediate recomputation so consumers honor freeze right away.
    this.cachedDecision = null;
    await this.getDecision(true);

    return this.manualFreeze;
  }

  getDryRunState() {
    return this.dryRun;
  }

  async setDryRun(enabled: boolean, reason?: string) {
    this.dryRun = {
      enabled,
      reason: reason || null || undefined,
      updatedAt: new Date().toISOString(),
    };

    this.cachedDecision = null;
    await this.getDecision(true);

    return this.dryRun;
  }

  getSafetyConstraints(companyId?: string) {
    const policy = this.governancePolicy.getPolicy(companyId);
    return {
      maxReplayBatch: policy.replay.maxBatch,
      replayBudgetPerMinute: policy.replay.budgetPerMinute,
      backlogHardStopDepth: policy.safety.backlogHardStopDepth,
    };
  }

  private consumeReplayBudget(
    companyId: string,
    count: number,
    budgetPerMinute: number,
  ) {
    const now = Date.now();
    const key = companyId || 'global';
    const list = (this.replayAttempts.get(key) || []).filter(
      (ts) => now - ts < 60_000,
    );
    if (list.length + count > budgetPerMinute) {
      return {
        allowed: false,
        remaining: Math.max(0, budgetPerMinute - list.length),
      };
    }

    for (let i = 0; i < count; i += 1) {
      list.push(now);
    }
    this.replayAttempts.set(key, list);

    return {
      allowed: true,
      remaining: Math.max(0, budgetPerMinute - list.length),
    };
  }

  async guardDlqReplay(params: { companyId: string; count?: number }) {
    const count = Math.max(1, params.count || 1);
    const policy = this.governancePolicy.getPolicy(params.companyId);
    const decision = await this.getDecision();

    if (this.dryRun.enabled) {
      return {
        allowed: true,
        code: 'DRY_RUN_BYPASS',
        message: 'Replay bypassed by dry-run mode',
        decision,
      };
    }

    if (count > policy.replay.maxBatch) {
      return {
        allowed: false,
        code: 'REPLAY_BATCH_TOO_LARGE',
        message: `Replay batch exceeds maxReplayBatch=${policy.replay.maxBatch}`,
        decision,
      };
    }

    if (decision.freezeDlqReplay || decision.manualFreeze) {
      return {
        allowed: false,
        code: 'REPLAY_FROZEN',
        message: 'DLQ replay is frozen by control plane governance',
        decision,
      };
    }

    if (
      decision.metrics.eventQueueDepth >= policy.safety.backlogHardStopDepth
    ) {
      return {
        allowed: false,
        code: 'BACKLOG_HARD_STOP',
        message: `Queue depth ${decision.metrics.eventQueueDepth} exceeds hard stop ${policy.safety.backlogHardStopDepth}`,
        decision,
      };
    }

    const budget = this.consumeReplayBudget(
      params.companyId,
      count,
      policy.replay.budgetPerMinute,
    );
    if (!budget.allowed) {
      return {
        allowed: false,
        code: 'REPLAY_BUDGET_EXCEEDED',
        message: `Replay budget exceeded. Remaining=${budget.remaining}/min`,
        decision,
      };
    }

    return {
      allowed: true,
      code: 'OK',
      message: 'Replay allowed by governance',
      decision,
      remainingBudget: budget.remaining,
    };
  }

  async getRepairGuard(companyId: string, employeeId: string) {
    const decision = await this.getDecision();
    const key = `${companyId}:${employeeId}`;
    const now = Date.now();
    const attempts = (this.repairAttempts.get(key) || []).filter(
      (ts) => now - ts < 60_000,
    );
    const cooldownUntil = this.repairCooldowns.get(key) || 0;

    const canRepair =
      !decision.pauseAutoRepair &&
      attempts.length < decision.repairBudgetPerMinute &&
      now >= cooldownUntil;

    return {
      canRepair,
      decision,
      attemptsLastMinute: attempts.length,
      cooldownRemainingMs: Math.max(0, cooldownUntil - now),
      repairDepth: attempts.length,
    };
  }

  async acquireRepairLock(params: {
    companyId: string;
    entityId: string;
    owner: string;
    source: string;
    reason?: string;
    ttlMs?: number;
  }) {
    const ttlMs = params.ttlMs || 45_000;
    const now = new Date();
    const lockedUntil = new Date(Date.now() + ttlMs);

    const existing = await this.prisma.employeeRepairLock.findUnique({
      where: {
        companyId_entityType_entityId: {
          companyId: params.companyId,
          entityType: 'Employee',
          entityId: params.entityId,
        },
      },
    });

    if (
      existing &&
      existing.lockedUntil.getTime() > Date.now() &&
      existing.owner !== params.owner
    ) {
      return {
        acquired: false,
        lockedUntil: existing.lockedUntil,
        owner: existing.owner,
      };
    }

    const row = await this.prisma.employeeRepairLock.upsert({
      where: {
        companyId_entityType_entityId: {
          companyId: params.companyId,
          entityType: 'Employee',
          entityId: params.entityId,
        },
      },
      create: {
        id: `${params.companyId}:${params.entityId}:${params.owner}`,
        companyId: params.companyId,
        entityType: 'Employee',
        entityId: params.entityId,
        owner: params.owner,
        source: params.source,
        reason: params.reason || null,
        lockedUntil,
      },
      update: {
        owner: params.owner,
        source: params.source,
        reason: params.reason || null,
        lockedUntil,
      },
    });

    return {
      acquired: true,
      lockedUntil: row.lockedUntil,
      owner: row.owner,
      acquiredAt: now,
    };
  }

  async releaseRepairLock(params: {
    companyId: string;
    entityId: string;
    owner: string;
  }) {
    try {
      const row = await this.prisma.employeeRepairLock.findUnique({
        where: {
          companyId_entityType_entityId: {
            companyId: params.companyId,
            entityType: 'Employee',
            entityId: params.entityId,
          },
        },
      });

      if (!row || row.owner !== params.owner) {
        return false;
      }

      await this.prisma.employeeRepairLock.delete({
        where: {
          companyId_entityType_entityId: {
            companyId: params.companyId,
            entityType: 'Employee',
            entityId: params.entityId,
          },
        },
      });

      return true;
    } catch {
      return false;
    }
  }

  async listRepairLocks(limit = 100) {
    return this.prisma.employeeRepairLock.findMany({
      orderBy: { lockedUntil: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  async listDecisionTimeline(limit = 20) {
    return this.prisma.eventControlDecisionLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  getPolicy(companyId?: string) {
    return {
      policy: this.governancePolicy.getPolicy(companyId),
      overrides: this.governancePolicy.getOverrides(),
    };
  }

  setGlobalPolicyOverride(patch: Partial<GovernancePolicyConfig>) {
    const override = this.governancePolicy.setGlobalOverride(patch || {});
    this.cachedDecision = null;
    return {
      scope: 'global',
      override,
    };
  }

  setCompanyPolicyOverride(
    companyId: string,
    patch: Partial<GovernancePolicyConfig>,
  ) {
    const override = this.governancePolicy.setCompanyOverride(
      companyId,
      patch || {},
    );
    this.cachedDecision = null;
    return {
      scope: 'company',
      companyId,
      override,
    };
  }

  clearCompanyPolicyOverride(companyId: string) {
    this.governancePolicy.clearCompanyOverride(companyId);
    this.cachedDecision = null;
    return {
      scope: 'company',
      companyId,
      cleared: true,
    };
  }

  async simulateDecision(params: {
    companyId?: string;
    metrics?: Partial<EventSystemMetrics>;
    policyOverride?: Partial<GovernancePolicyConfig>;
    previousDecision?: Partial<EventControlDecision>;
  }) {
    const baseline = await this.eventOpsService.getMetrics(params.companyId);
    const metrics: EventSystemMetrics = {
      ...baseline,
      ...(params.metrics || {}),
    };

    const previous = params.previousDecision
      ? {
          ...this.createDecision(metrics, null, {
            companyId: params.companyId,
            policyOverride: params.policyOverride,
            simulated: true,
          }),
          ...(params.previousDecision || {}),
        }
      : this.appliedDecision;

    const decision = this.createDecision(metrics, previous, {
      companyId: params.companyId,
      policyOverride: params.policyOverride,
      simulated: true,
    });

    return {
      simulated: true,
      policy: this.governancePolicy.getPolicy(
        params.companyId,
        params.policyOverride,
      ),
      baselineMetrics: baseline,
      inputMetrics: metrics,
      decision,
      dryRunState: this.dryRun,
    };
  }

  async replayDecisions(params: {
    companyId?: string;
    limit?: number;
    policyOverride?: Partial<GovernancePolicyConfig>;
  }) {
    const rows = await this.prisma.eventControlDecisionLog.findMany({
      orderBy: { createdAt: 'asc' },
      take: Math.min(200, Math.max(1, params.limit || 30)),
    });

    let previous: EventControlDecision | null = null;
    const outputs = rows.map((row) => {
      const sourceMetrics = (row.metrics || {}) as EventSystemMetrics;
      const decision = this.createDecision(sourceMetrics, previous, {
        companyId: params.companyId,
        policyOverride: params.policyOverride,
        simulated: true,
      });
      previous = decision;

      return {
        sourceDecisionLogId: row.id,
        createdAt: row.createdAt,
        originalDecisionText: row.decisionText,
        replayedDecision: {
          throttleQueue: decision.throttleQueue,
          pauseAutoRepair: decision.pauseAutoRepair,
          freezeDlqReplay: decision.freezeDlqReplay,
        },
        replayedReason: decision.reason,
        replayedTrace: decision.governanceTrace,
      };
    });

    return {
      replayed: outputs.length,
      policy: this.governancePolicy.getPolicy(
        params.companyId,
        params.policyOverride,
      ),
      decisions: outputs,
    };
  }

  async listDeadLetters(companyId?: string, limit = 20) {
    return this.prisma.employeeEventDeadLetter.findMany({
      where: companyId ? { companyId } : undefined,
      orderBy: { failedAt: 'desc' },
      take: Math.min(100, Math.max(1, limit)),
    });
  }

  recordRepairAttempt(companyId: string, employeeId: string) {
    const key = `${companyId}:${employeeId}`;
    const now = Date.now();
    const attempts = (this.repairAttempts.get(key) || []).filter(
      (ts) => now - ts < 60_000,
    );
    attempts.push(now);
    this.repairAttempts.set(key, attempts);
    this.repairCooldowns.set(key, now + 30_000);
  }

  recordRepairFailure(companyId: string, employeeId: string) {
    const key = `${companyId}:${employeeId}`;
    const now = Date.now();
    const cooldown = this.repairCooldowns.get(key) || now;
    this.repairCooldowns.set(key, Math.max(cooldown, now + 60_000));
  }
}
