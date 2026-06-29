import { Injectable } from '@nestjs/common';
import { filter, map, Observable } from 'rxjs';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';

type ActivityAction =
  | 'ACTIVITY_WINDOW'
  | 'ACTIVITY_IDLE'
  | 'ACTIVITY_INPUT'
  | 'ACTIVITY_HEARTBEAT'
  | 'ACTIVITY_SCREENSHOT';

type NormalizedEvent = {
  id: string;
  employeeId: string;
  action: ActivityAction;
  at: Date;
  appName: string;
  processName: string;
  windowTitle: string;
  url: string;
  domain: string;
  durationSec: number;
  idleSec: number;
  isAfk: boolean;
  keyboardCount: number;
  mouseCount: number;
};

type SessionSegmentType =
  | 'focused_work'
  | 'idle'
  | 'distracted'
  | 'switching_apps';

type SessionSegment = {
  type: SessionSegmentType;
  startAt: string;
  endAt: string;
  durationSec: number;
  appName: string | null;
  domain: string | null;
};

type SessionMetrics = {
  totalSec: number;
  activeSec: number;
  focusedSec: number;
  idleSec: number;
  distractedSec: number;
  switchingSec: number;
  appDominance: {
    appName: string;
    ratio: number;
    durationSec: number;
  } | null;
  websiteLeakageRatio: number;
  productivityRatio: number;
  activeTimeRatio: number;
  distractionScore: number;
  productivityIndex: number;
  switchRatePerHour: number;
};

type BuiltSession = {
  startAt: string;
  endAt: string;
  durationSec: number;
  focusState: 'deep_focus' | 'normal_focus' | 'fragmented';
  segments: SessionSegment[];
  metrics: SessionMetrics;
};

type CategoryTag = 'productive' | 'distracting' | 'neutral';

const PRODUCTIVE_KEYWORDS = [
  'code',
  'cursor',
  'visual studio',
  'vscode',
  'github',
  'figma',
  'notion',
  'slack',
  'teams',
  'excel',
  'word',
  'terminal',
  'postman',
  'jira',
  'confluence',
  'docs',
  'drive',
  'datagrip',
  'intellij',
  'webstorm',
  'pycharm',
];

const DISTRACTING_KEYWORDS = [
  'youtube',
  'facebook',
  'instagram',
  'twitter',
  'x.com',
  'tiktok',
  'bilibili',
  'netflix',
  'steam',
  'game',
  'reddit',
  'shopping',
  'taobao',
  'jd.com',
];

@Injectable()
export class ActivitySessionService extends BaseRbacService {
  private readonly sessionGapSec = 10 * 60;
  private readonly afkThresholdSec = 60;

  constructor(
    prisma: PrismaService,
    rbacCore: RbacCoreService,
    private readonly activityService: ActivityService,
  ) {
    super(prisma, rbacCore);
  }

  private toText(input: unknown, fallback = '') {
    if (typeof input === 'string') return input;
    if (typeof input === 'number' || typeof input === 'boolean') {
      return String(input);
    }
    return fallback;
  }

  private dayRange(dateText?: string) {
    const now = (() => {
      if (!dateText) return new Date();
      const m = String(dateText).match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (m) {
        return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
      }
      return new Date(dateText);
    })();
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    const date = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    return { start, end, date };
  }

  private classifyCategory(evt: NormalizedEvent): CategoryTag {
    const text =
      `${evt.appName} ${evt.processName} ${evt.windowTitle} ${evt.domain} ${evt.url}`.toLowerCase();
    if (DISTRACTING_KEYWORDS.some((k) => text.includes(k)))
      return 'distracting';
    if (PRODUCTIVE_KEYWORDS.some((k) => text.includes(k))) return 'productive';
    return 'neutral';
  }

  private normalizeEvent(row: {
    id: string;
    action: string;
    entityId: string | null;
    createdAt: Date;
    afterData: unknown;
  }): NormalizedEvent | null {
    const supportedActions = new Set<ActivityAction>([
      'ACTIVITY_WINDOW',
      'ACTIVITY_IDLE',
      'ACTIVITY_INPUT',
      'ACTIVITY_HEARTBEAT',
      'ACTIVITY_SCREENSHOT',
    ]);

    if (!supportedActions.has(row.action as ActivityAction)) {
      return null;
    }

    const data =
      row.afterData && typeof row.afterData === 'object'
        ? (row.afterData as Record<string, unknown>)
        : {};
    const rawCapturedAt = data.capturedAt;
    const capturedAt = rawCapturedAt
      ? new Date(this.toText(rawCapturedAt))
      : row.createdAt;

    return {
      id: row.id,
      employeeId: row.entityId || this.toText(data.employeeId, 'unknown'),
      action: row.action as ActivityAction,
      at: Number.isNaN(capturedAt.getTime()) ? row.createdAt : capturedAt,
      appName: this.toText(data.appName),
      processName: this.toText(data.processName),
      windowTitle: this.toText(data.windowTitle),
      url: this.toText(data.url),
      domain: this.toText(data.domain),
      durationSec: Math.max(0, Number(data.durationSec || 0)),
      idleSec: Math.max(0, Number(data.idleSec || 0)),
      isAfk: Boolean(data.isAfk || false),
      keyboardCount: Math.max(0, Number(data.keyboardCount || 0)),
      mouseCount: Math.max(0, Number(data.mouseCount || 0)),
    };
  }

  private buildSessionFromEvents(events: NormalizedEvent[]): BuiltSession[] {
    if (events.length === 0) return [];

    const sessions: BuiltSession[] = [];
    let cursor = 0;

    while (cursor < events.length) {
      const bucket: NormalizedEvent[] = [events[cursor]];
      let idx = cursor + 1;
      while (idx < events.length) {
        const gapSec = Math.max(
          0,
          (events[idx].at.getTime() - events[idx - 1].at.getTime()) / 1000,
        );
        if (gapSec > this.sessionGapSec) {
          break;
        }
        bucket.push(events[idx]);
        idx += 1;
      }

      sessions.push(this.toSession(bucket));
      cursor = idx;
    }

    return sessions;
  }

  private toSession(bucket: NormalizedEvent[]): BuiltSession {
    const segments: SessionSegment[] = [];
    const appDurations = new Map<string, number>();

    let focusedSec = 0;
    let idleSec = 0;
    let distractedSec = 0;
    let switchingSec = 0;
    let switchCount = 0;
    let distractedWebsiteSec = 0;

    let previousWindowKey = '';

    for (let i = 0; i < bucket.length; i += 1) {
      const evt = bucket[i];
      const nextEvt = bucket[i + 1];

      if (
        evt.action === 'ACTIVITY_INPUT' ||
        evt.action === 'ACTIVITY_SCREENSHOT'
      ) {
        continue;
      }

      const inferredSec = nextEvt
        ? Math.max(
            1,
            Math.min(
              10 * 60,
              Math.floor((nextEvt.at.getTime() - evt.at.getTime()) / 1000),
            ),
          )
        : 15;
      const durationSec = evt.durationSec > 0 ? evt.durationSec : inferredSec;

      const isIdle =
        evt.action === 'ACTIVITY_IDLE' ||
        evt.idleSec >= this.afkThresholdSec ||
        evt.isAfk;
      const category = this.classifyCategory(evt);

      let type: SessionSegmentType;
      if (isIdle) {
        type = 'idle';
      } else if (category === 'distracting') {
        type = 'distracted';
      } else {
        type = 'focused_work';
      }

      const appName = evt.appName || evt.processName || 'Unknown';
      const windowKey = `${appName}::${evt.windowTitle}::${evt.domain}`;

      if (
        evt.action === 'ACTIVITY_WINDOW' &&
        previousWindowKey &&
        previousWindowKey !== windowKey
      ) {
        switchCount += 1;
        const switchDur = Math.min(5, durationSec);
        switchingSec += switchDur;
        segments.push({
          type: 'switching_apps',
          startAt: evt.at.toISOString(),
          endAt: new Date(evt.at.getTime() + switchDur * 1000).toISOString(),
          durationSec: switchDur,
          appName,
          domain: evt.domain || null,
        });
      }

      previousWindowKey = windowKey;

      if (type === 'idle') {
        idleSec += durationSec;
      } else if (type === 'distracted') {
        distractedSec += durationSec;
      } else {
        focusedSec += durationSec;
      }

      if (evt.action === 'ACTIVITY_WINDOW') {
        appDurations.set(
          appName,
          (appDurations.get(appName) || 0) + durationSec,
        );
        if (type === 'distracted' && evt.domain) {
          distractedWebsiteSec += durationSec;
        }
      }

      segments.push({
        type,
        startAt: evt.at.toISOString(),
        endAt: new Date(evt.at.getTime() + durationSec * 1000).toISOString(),
        durationSec,
        appName: appName || null,
        domain: evt.domain || null,
      });
    }

    const totalSec = Math.max(1, focusedSec + idleSec + distractedSec);
    const activeSec = focusedSec + distractedSec + switchingSec;
    const activeTimeRatio = Math.min(1, activeSec / totalSec);
    const productivityRatio = activeSec > 0 ? focusedSec / activeSec : 0;
    const websiteLeakageRatio =
      activeSec > 0 ? distractedWebsiteSec / activeSec : 0;

    let dominantApp: SessionMetrics['appDominance'] = null;
    for (const [appName, duration] of appDurations.entries()) {
      if (!dominantApp || duration > dominantApp.durationSec) {
        dominantApp = {
          appName,
          durationSec: duration,
          ratio: activeSec > 0 ? duration / activeSec : 0,
        };
      }
    }

    const sessionDurationHours = totalSec / 3600;
    const switchRatePerHour =
      sessionDurationHours > 0 ? switchCount / sessionDurationHours : 0;
    const distractionRatio = activeSec > 0 ? distractedSec / activeSec : 0;
    const switchPenalty = Math.min(1, switchRatePerHour / 24);
    const productivityIndex = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          (0.6 * productivityRatio +
            0.25 * (1 - distractionRatio) +
            0.15 * (1 - switchPenalty)) *
            100,
        ),
      ),
    );

    const focusState: BuiltSession['focusState'] =
      productivityRatio >= 0.75 && switchRatePerHour <= 8
        ? 'deep_focus'
        : productivityRatio >= 0.5 && switchRatePerHour <= 16
          ? 'normal_focus'
          : 'fragmented';

    const metrics: SessionMetrics = {
      totalSec,
      activeSec,
      focusedSec,
      idleSec,
      distractedSec,
      switchingSec,
      appDominance: dominantApp,
      websiteLeakageRatio,
      productivityRatio,
      activeTimeRatio,
      distractionScore: Math.round(
        Math.min(100, (distractionRatio * 0.7 + switchPenalty * 0.3) * 100),
      ),
      productivityIndex,
      switchRatePerHour,
    };

    return {
      startAt: bucket[0].at.toISOString(),
      endAt: bucket[bucket.length - 1].at.toISOString(),
      durationSec: totalSec,
      focusState,
      segments,
      metrics,
    };
  }

  private aggregateSessions(sessions: BuiltSession[]) {
    const totalSec = sessions.reduce((sum, s) => sum + s.metrics.totalSec, 0);
    const activeSec = sessions.reduce((sum, s) => sum + s.metrics.activeSec, 0);
    const focusedSec = sessions.reduce(
      (sum, s) => sum + s.metrics.focusedSec,
      0,
    );
    const idleSec = sessions.reduce((sum, s) => sum + s.metrics.idleSec, 0);
    const distractedSec = sessions.reduce(
      (sum, s) => sum + s.metrics.distractedSec,
      0,
    );
    const productivityRatio = activeSec > 0 ? focusedSec / activeSec : 0;
    const activeTimeRatio = totalSec > 0 ? activeSec / totalSec : 0;
    const distractionRatio = activeSec > 0 ? distractedSec / activeSec : 0;

    const productivityIndex = Math.round(
      Math.max(
        0,
        Math.min(
          100,
          (0.65 * productivityRatio +
            0.2 * activeTimeRatio +
            0.15 * (1 - distractionRatio)) *
            100,
        ),
      ),
    );

    return {
      totalSec,
      activeSec,
      focusedSec,
      idleSec,
      distractedSec,
      productivityRatio,
      activeTimeRatio,
      productivityIndex,
      sessionCount: sessions.length,
    };
  }

  async getDailySessions(
    actor: Actor | undefined,
    query: { date?: string; companyId?: string; employeeId?: string },
  ) {
    const scope = await this.activityService.resolveActivityReadScope(
      actor,
      query.companyId,
      query.employeeId,
    );
    const { start, end, date } = this.dayRange(query.date);

    if (scope.visibleEmployeeIds && scope.visibleEmployeeIds.length === 0) {
      return { date, employees: [] };
    }

    const entityWhere = query.employeeId
      ? { entityId: query.employeeId }
      : scope.visibleEmployeeIds
        ? { entityId: { in: scope.visibleEmployeeIds } }
        : {};

    const rows = await this.prisma.tenantAuditLog.findMany({
      where: {
        companyId: scope.companyId,
        scope: 'ACTIVITY',
        createdAt: { gte: start, lte: end },
        ...entityWhere,
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        action: true,
        entityId: true,
        createdAt: true,
        afterData: true,
      },
    });

    const normalized = rows
      .map((r) => this.normalizeEvent(r))
      .filter((r): r is NormalizedEvent => Boolean(r));

    const eventsByEmployee = new Map<string, NormalizedEvent[]>();
    for (const evt of normalized) {
      if (!eventsByEmployee.has(evt.employeeId)) {
        eventsByEmployee.set(evt.employeeId, []);
      }
      eventsByEmployee.get(evt.employeeId)!.push(evt);
    }

    const employees = Array.from(eventsByEmployee.entries()).map(
      ([employeeId, events]) => {
        const sessions = this.buildSessionFromEvents(events);
        return {
          employeeId,
          summary: this.aggregateSessions(sessions),
          sessions,
        };
      },
    );

    return {
      date,
      employees,
    };
  }

  async getProductivitySummary(
    actor: Actor | undefined,
    query: { date?: string; companyId?: string; employeeId?: string },
  ) {
    const data = await this.getDailySessions(actor, query);

    const companySummary = data.employees.reduce(
      (acc, employee) => {
        acc.totalSec += employee.summary.totalSec;
        acc.activeSec += employee.summary.activeSec;
        acc.focusedSec += employee.summary.focusedSec;
        acc.idleSec += employee.summary.idleSec;
        acc.distractedSec += employee.summary.distractedSec;
        acc.sessionCount += employee.summary.sessionCount;
        return acc;
      },
      {
        totalSec: 0,
        activeSec: 0,
        focusedSec: 0,
        idleSec: 0,
        distractedSec: 0,
        sessionCount: 0,
      },
    );

    const productivityRatio =
      companySummary.activeSec > 0
        ? companySummary.focusedSec / companySummary.activeSec
        : 0;
    const activeTimeRatio =
      companySummary.totalSec > 0
        ? companySummary.activeSec / companySummary.totalSec
        : 0;
    const distractionRatio =
      companySummary.activeSec > 0
        ? companySummary.distractedSec / companySummary.activeSec
        : 0;

    return {
      date: data.date,
      companySummary: {
        ...companySummary,
        productivityRatio,
        activeTimeRatio,
        productivityIndex: Math.round(
          Math.max(
            0,
            Math.min(
              100,
              (0.65 * productivityRatio +
                0.2 * activeTimeRatio +
                0.15 * (1 - distractionRatio)) *
                100,
            ),
          ),
        ),
      },
      employees: data.employees.map((e) => ({
        employeeId: e.employeeId,
        ...e.summary,
      })),
    };
  }

  getCategoryMap() {
    return {
      productiveKeywords: PRODUCTIVE_KEYWORDS,
      distractingKeywords: DISTRACTING_KEYWORDS,
    };
  }

  async streamTimeline(
    actor: Actor | undefined,
    query: { companyId?: string },
  ): Promise<Observable<{ data: unknown }>> {
    const scope = await this.activityService.resolveActivityReadScope(
      actor,
      query.companyId,
    );
    const visibleEmployeeSet = scope.visibleEmployeeIds
      ? new Set(scope.visibleEmployeeIds)
      : null;

    return this.activityService.getEventStream().pipe(
      filter((event) => {
        if (event?.companyId !== scope.companyId) {
          return false;
        }

        if (!visibleEmployeeSet) {
          return true;
        }

        const employeeId = this.toText(event?.employeeId || event?.entityId);
        return employeeId.length > 0 && visibleEmployeeSet.has(employeeId);
      }),
      map((event) => {
        return {
          data: {
            type: 'activity_event',
            payload: event,
          },
        };
      }),
    );
  }
}
