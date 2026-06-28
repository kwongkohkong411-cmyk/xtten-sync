import { Injectable } from '@nestjs/common';

export type GovernancePolicyConfig = {
  queue: {
    throttleOnDepth: number;
    throttleOffDepth: number;
    retryOnPerHour: number;
    retryOffPerHour: number;
    processedOnPerHour: number;
    processedOffPerHour: number;
    dlqGrowthOnPerHour: number;
    dlqGrowthOffPerHour: number;
  };
  repair: {
    pauseOnDlqCount: number;
    pauseOffDlqCount: number;
    pauseOnRetryPerHour: number;
    pauseOffRetryPerHour: number;
    pauseOnProjectionStalenessMs: number;
    pauseOffProjectionStalenessMs: number;
    budgetPerMinute: number;
    cooldownPerEntityMs: number;
    maxDepth: number;
  };
  replay: {
    freezeOnDlqCount: number;
    freezeOffDlqCount: number;
    freezeOnRetryPerHour: number;
    freezeOffRetryPerHour: number;
    maxBatch: number;
    budgetPerMinute: number;
  };
  safety: {
    backlogHardStopDepth: number;
  };
};

const DEFAULT_POLICY: GovernancePolicyConfig = {
  queue: {
    throttleOnDepth: 100,
    throttleOffDepth: 70,
    retryOnPerHour: 60,
    retryOffPerHour: 30,
    processedOnPerHour: 300,
    processedOffPerHour: 200,
    dlqGrowthOnPerHour: 15,
    dlqGrowthOffPerHour: 8,
  },
  repair: {
    pauseOnDlqCount: 10,
    pauseOffDlqCount: 5,
    pauseOnRetryPerHour: 20,
    pauseOffRetryPerHour: 10,
    pauseOnProjectionStalenessMs: 5 * 60_000,
    pauseOffProjectionStalenessMs: 3 * 60_000,
    budgetPerMinute: 5,
    cooldownPerEntityMs: 30_000,
    maxDepth: 2,
  },
  replay: {
    freezeOnDlqCount: 50,
    freezeOffDlqCount: 35,
    freezeOnRetryPerHour: 100,
    freezeOffRetryPerHour: 80,
    maxBatch: 20,
    budgetPerMinute: 30,
  },
  safety: {
    backlogHardStopDepth: 5000,
  },
};

function mergePolicy(
  base: GovernancePolicyConfig,
  patch?: Partial<GovernancePolicyConfig>,
): GovernancePolicyConfig {
  if (!patch) return base;

  return {
    queue: {
      ...base.queue,
      ...(patch.queue || {}),
    },
    repair: {
      ...base.repair,
      ...(patch.repair || {}),
    },
    replay: {
      ...base.replay,
      ...(patch.replay || {}),
    },
    safety: {
      ...base.safety,
      ...(patch.safety || {}),
    },
  };
}

@Injectable()
export class EventGovernancePolicyService {
  private globalOverride: Partial<GovernancePolicyConfig> | null = null;
  private readonly companyOverrides = new Map<
    string,
    Partial<GovernancePolicyConfig>
  >();

  getPolicy(
    companyId?: string,
    patch?: Partial<GovernancePolicyConfig>,
  ): GovernancePolicyConfig {
    const companyOverride = companyId
      ? this.companyOverrides.get(companyId)
      : null;
    const merged = mergePolicy(
      mergePolicy(DEFAULT_POLICY, this.globalOverride || undefined),
      companyOverride || undefined,
    );
    return mergePolicy(merged, patch);
  }

  getOverrides() {
    return {
      global: this.globalOverride,
      companies: Array.from(this.companyOverrides.entries()).map(
        ([companyId, override]) => ({ companyId, override }),
      ),
    };
  }

  setGlobalOverride(patch: Partial<GovernancePolicyConfig>) {
    this.globalOverride = mergePolicy(DEFAULT_POLICY, patch);
    return this.globalOverride;
  }

  setCompanyOverride(
    companyId: string,
    patch: Partial<GovernancePolicyConfig>,
  ) {
    const current = this.companyOverrides.get(companyId) || {};
    const next = mergePolicy(mergePolicy(DEFAULT_POLICY, current), patch);
    this.companyOverrides.set(companyId, next);
    return next;
  }

  clearCompanyOverride(companyId: string) {
    this.companyOverrides.delete(companyId);
  }
}
