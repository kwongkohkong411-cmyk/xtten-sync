import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, join, normalize, resolve } from 'node:path';
import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Prisma } from '@prisma/client';
import { Observable, Subject } from 'rxjs';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';
import { PrismaService } from '../prisma/prisma.service';

type IngestPayload = {
  employeeId?: string;
  appName?: string;
  windowTitle?: string;
  processName?: string;
  url?: string;
  domain?: string;
  durationSec?: number;
  idleSec?: number;
  keyboardCount?: number;
  mouseCount?: number;
  screenshotUrl?: string;
  screenshotBase64?: string;
  heartbeatSec?: number;
  isAfk?: boolean;
  capturedAt?: string;
  metadata?: Record<string, unknown>;
};

type ActivityScreenshotUploadPayload = {
  employeeId?: string;
  teamId?: string;
  deviceId?: string;
  agentVersion?: string;
  captureSource?: string;
  capturedAt?: string;
  imageBase64?: string;
  appName?: string;
  windowTitle?: string;
  keyboardCount?: number;
  mouseCount?: number;
  idleSec?: number;
  hash?: string;
  sha256?: string;
  perceptualHash?: string;
  width?: number;
  height?: number;
  metadata?: Record<string, unknown>;
};

@Injectable()
export class ActivityService
  extends BaseRbacService
  implements OnModuleInit, OnModuleDestroy
{
  private readonly eventStream = new Subject<Record<string, unknown>>();
  private readonly logger = new Logger(ActivityService.name);
  private cleanupTimer: NodeJS.Timeout | null = null;
  private cleanupKickoffTimer: NodeJS.Timeout | null = null;
  private r2Client: S3Client | null = null;

  constructor(prisma: PrismaService, rbacCore: RbacCoreService) {
    super(prisma, rbacCore);
  }

  private errorMessage(err: unknown) {
    if (err instanceof Error) return err.message;
    if (typeof err === 'string') return err;
    return 'unknown error';
  }

  private toText(input: unknown, fallback = '') {
    if (typeof input === 'string') return input;
    if (typeof input === 'number' || typeof input === 'boolean') {
      return String(input);
    }
    return fallback;
  }

  private toRecord(input: unknown): Record<string, unknown> {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return {};
    }
    return input as Record<string, unknown>;
  }

  onModuleInit() {
    this.cleanupKickoffTimer = setTimeout(() => {
      this.cleanupExpiredScreenshots().catch((err) => {
        this.logger.warn(
          `initial screenshot cleanup failed: ${this.errorMessage(err)}`,
        );
      });
    }, 15_000);

    this.scheduleMidnightCleanup();
  }

  onModuleDestroy() {
    if (this.cleanupKickoffTimer) {
      clearTimeout(this.cleanupKickoffTimer);
      this.cleanupKickoffTimer = null;
    }
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  getEventStream(): Observable<Record<string, unknown>> {
    return this.eventStream.asObservable();
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

  private encodeScreenshotCursor(createdAt: Date, id: string) {
    return Buffer.from(`${createdAt.toISOString()}|${id}`, 'utf8').toString(
      'base64url',
    );
  }

  private decodeScreenshotCursor(
    cursor?: string,
  ): { createdAt: Date; id: string } | null {
    if (!cursor) return null;
    try {
      const raw = Buffer.from(String(cursor), 'base64url').toString('utf8');
      const [createdAtText, id] = raw.split('|');
      if (!createdAtText || !id) return null;
      const createdAt = new Date(createdAtText);
      if (Number.isNaN(createdAt.getTime())) return null;
      return { createdAt, id };
    } catch {
      return null;
    }
  }

  private resolveLocalScreenshotPath(screenshotUrl: string) {
    if (!String(screenshotUrl || '').startsWith('/uploads/')) return null;
    const normalizedUrl = normalize(
      String(screenshotUrl || '').replace(/^\/+/, ''),
    );
    const uploadsRoot = resolve(join(process.cwd(), 'uploads'));
    const absolutePath = resolve(join(process.cwd(), normalizedUrl));
    if (!absolutePath.startsWith(uploadsRoot)) return null;
    return absolutePath;
  }

  private isR2Enabled() {
    return Boolean(
      process.env.CF_R2_BUCKET &&
      process.env.CF_R2_ENDPOINT &&
      process.env.CF_R2_ACCESS_KEY_ID &&
      process.env.CF_R2_SECRET_ACCESS_KEY,
    );
  }

  private getR2Client() {
    if (this.r2Client) return this.r2Client;
    if (!this.isR2Enabled()) return null;

    this.r2Client = new S3Client({
      region: process.env.CF_R2_REGION || 'auto',
      endpoint: process.env.CF_R2_ENDPOINT,
      forcePathStyle: true,
      credentials: {
        accessKeyId: process.env.CF_R2_ACCESS_KEY_ID as string,
        secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY as string,
      },
    });

    return this.r2Client;
  }

  private getR2BucketName() {
    return String(process.env.CF_R2_BUCKET || '');
  }

  private makeScreenshotObjectKey(
    companyId: string,
    employeeId: string,
    capturedAt: Date,
    extension: string,
  ) {
    const yyyy = String(capturedAt.getFullYear());
    const mm = String(capturedAt.getMonth() + 1).padStart(2, '0');
    const dd = String(capturedAt.getDate()).padStart(2, '0');
    const hh = String(capturedAt.getHours()).padStart(2, '0');
    const min = String(capturedAt.getMinutes()).padStart(2, '0');
    const ss = String(capturedAt.getSeconds()).padStart(2, '0');
    const safeExt = extension.startsWith('.') ? extension : `.${extension}`;
    return `${companyId}/${yyyy}/${mm}/${dd}/${employeeId}/${hh}-${min}-${ss}${safeExt}`;
  }

  private async uploadScreenshotToR2(params: {
    companyId: string;
    employeeId: string;
    capturedAt: Date;
    mimeType: string;
    extension: string;
    buffer: Buffer;
  }) {
    const client = this.getR2Client();
    if (!client) return null;

    const bucket = this.getR2BucketName();
    const objectKey = this.makeScreenshotObjectKey(
      params.companyId,
      params.employeeId,
      params.capturedAt,
      params.extension,
    );

    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: objectKey,
        Body: params.buffer,
        ContentType: params.mimeType,
      }),
    );

    const publicBase = String(process.env.CF_R2_PUBLIC_BASE_URL || '').replace(
      /\/$/,
      '',
    );
    const screenshotUrl = publicBase ? `${publicBase}/${objectKey}` : objectKey;
    return {
      screenshotUrl,
      objectKey,
      storageProvider: 'r2',
    } as const;
  }

  private async saveScreenshotToLocal(params: {
    companyId: string;
    employeeId: string;
    capturedAt: Date;
    extension: string;
    buffer: Buffer;
  }) {
    const objectKey = this.makeScreenshotObjectKey(
      params.companyId,
      params.employeeId,
      params.capturedAt,
      params.extension,
    );

    const relativePath = normalize(objectKey);
    const absolutePath = resolve(join(process.cwd(), 'uploads', relativePath));
    await fs.mkdir(resolve(join(absolutePath, '..')), { recursive: true });
    await fs.writeFile(absolutePath, params.buffer);

    return {
      screenshotUrl: `/${relativePath.replace(/\\/g, '/')}`,
      objectKey: relativePath.replace(/\\/g, '/'),
      storageProvider: 'local',
    } as const;
  }

  private async persistScreenshotBinary(params: {
    companyId: string;
    employeeId: string;
    capturedAt: Date;
    mimeType: string;
    originalName?: string;
    buffer: Buffer;
  }) {
    const originalExt = extname(
      String(params.originalName || ''),
    ).toLowerCase();
    const extension =
      originalExt ||
      (params.mimeType.includes('webp')
        ? '.webp'
        : params.mimeType.includes('png')
          ? '.png'
          : '.jpg');

    if (this.isR2Enabled()) {
      try {
        const r2 = await this.uploadScreenshotToR2({
          companyId: params.companyId,
          employeeId: params.employeeId,
          capturedAt: params.capturedAt,
          mimeType: params.mimeType,
          extension,
          buffer: params.buffer,
        });
        if (r2) return r2;
      } catch (err) {
        this.logger.warn(
          `R2 upload failed, fallback to local storage: ${this.errorMessage(err)}`,
        );
      }
    }

    return this.saveScreenshotToLocal({
      companyId: params.companyId,
      employeeId: params.employeeId,
      capturedAt: params.capturedAt,
      extension,
      buffer: params.buffer,
    });
  }

  private decodeImageBase64(input: string | undefined) {
    const raw = String(input || '').trim();
    if (!raw) {
      throw new Error('imageBase64 is required');
    }

    const m = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    const mimeType = m?.[1] || 'image/webp';
    const base64 = m?.[2] || raw;
    const buffer = Buffer.from(base64, 'base64');
    if (!buffer.length) {
      throw new Error('imageBase64 is invalid');
    }
    return {
      buffer,
      mimeType,
    };
  }

  async uploadActivityScreenshot(
    actor: Actor | undefined,
    requestedCompanyId: string | undefined,
    payload: ActivityScreenshotUploadPayload,
  ) {
    const { companyId } = await this.assertCompanyScope(
      actor,
      requestedCompanyId,
      true,
    );

    const employeeId = String(payload.employeeId || '').trim();
    if (!employeeId) {
      throw new Error('employeeId is required');
    }

    const capturedAt = payload.capturedAt
      ? new Date(payload.capturedAt)
      : new Date();
    if (Number.isNaN(capturedAt.getTime())) {
      throw new Error('capturedAt is invalid');
    }

    const { buffer, mimeType } = this.decodeImageBase64(payload.imageBase64);
    const saved = await this.persistScreenshotBinary({
      companyId: String(companyId),
      employeeId,
      capturedAt,
      mimeType,
      originalName: mimeType.includes('webp')
        ? 'screenshot.webp'
        : 'screenshot.jpg',
      buffer,
    });

    const sha256 = String(
      payload.sha256 || createHash('sha256').update(buffer).digest('hex'),
    );
    const perceptualHash = String(payload.perceptualHash || payload.hash || '');
    const hash = String(payload.hash || perceptualHash || sha256);

    const record = await this.prisma.activityScreenshot.create({
      data: {
        companyId: String(companyId),
        employeeId,
        teamId: payload.teamId ? String(payload.teamId) : null,
        deviceId: payload.deviceId ? String(payload.deviceId) : null,
        agentVersion: payload.agentVersion
          ? String(payload.agentVersion)
          : null,
        captureSource: String(payload.captureSource || 'SCREENSHOT'),
        capturedAt,
        appName: payload.appName || null,
        windowTitle: payload.windowTitle || null,
        keyboardCount: Number(payload.keyboardCount || 0),
        mouseCount: Number(payload.mouseCount || 0),
        idleSec: Number(payload.idleSec || 0),
        hash,
        sha256,
        perceptualHash: perceptualHash || null,
        objectKey: saved.objectKey,
        storageProvider: String(saved.storageProvider || 'local').toUpperCase(),
        url: saved.screenshotUrl,
        sizeBytes: buffer.length,
        width: payload.width ? Number(payload.width) : null,
        height: payload.height ? Number(payload.height) : null,
        metadata: (payload.metadata || {}) as Prisma.InputJsonObject,
      },
      select: {
        id: true,
        companyId: true,
        employeeId: true,
        teamId: true,
        deviceId: true,
        agentVersion: true,
        captureSource: true,
        capturedAt: true,
        objectKey: true,
        storageProvider: true,
        url: true,
        hash: true,
        sha256: true,
        perceptualHash: true,
        sizeBytes: true,
        width: true,
        height: true,
        createdAt: true,
      },
    });

    // Write audit log so getScreenshots() (which reads tenantAuditLog) can find this record
    await this.prisma.tenantAuditLog.create({
      data: {
        companyId: String(companyId),
        actorId: actor?.id ?? null,
        action: 'ACTIVITY_SCREENSHOT',
        scope: 'ACTIVITY',
        entityType: 'EmployeeActivity',
        entityId: employeeId,
        afterData: {
          employeeId,
          appName: payload.appName || null,
          windowTitle: payload.windowTitle || null,
          screenshotUrl: saved.screenshotUrl,
          objectKey: saved.objectKey,
          storageProvider: saved.storageProvider,
          capturedAt: capturedAt.toISOString(),
          keyboardCount: Number(payload.keyboardCount || 0),
          mouseCount: Number(payload.mouseCount || 0),
          idleSec: Number(payload.idleSec || 0),
          metadata: {
            objectKey: saved.objectKey,
            storageProvider: saved.storageProvider,
            screenshotId: record.id,
          },
        },
      },
      select: { id: true },
    });

    return {
      ...record,
      screenshotUrl: record.url,
    };
  }

  private async deleteScreenshotObject(params: {
    screenshotUrl?: string;
    objectKey?: string;
    storageProvider?: string;
  }) {
    const provider = String(params.storageProvider || '');
    const objectKey = String(params.objectKey || '');
    const screenshotUrl = String(params.screenshotUrl || '');

    if (provider === 'r2' && objectKey && this.getR2Client()) {
      try {
        await this.getR2Client()!.send(
          new DeleteObjectCommand({
            Bucket: this.getR2BucketName(),
            Key: objectKey,
          }),
        );
        return true;
      } catch {
        return false;
      }
    }

    const absolutePath = this.resolveLocalScreenshotPath(screenshotUrl);
    if (!absolutePath) return true;
    try {
      await fs.unlink(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  private scheduleMidnightCleanup() {
    const now = new Date();
    const next = new Date(now);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 5, 0, 0);
    const firstDelay = Math.max(1_000, next.getTime() - now.getTime());

    setTimeout(() => {
      this.cleanupExpiredScreenshots().catch((err) => {
        this.logger.warn(
          `midnight screenshot cleanup failed: ${this.errorMessage(err)}`,
        );
      });

      const dailyMs = 24 * 60 * 60 * 1000;
      this.cleanupTimer = setInterval(() => {
        this.cleanupExpiredScreenshots().catch((err) => {
          this.logger.warn(
            `daily screenshot cleanup failed: ${this.errorMessage(err)}`,
          );
        });
      }, dailyMs);
    }, firstDelay);
  }

  private async cleanupExpiredScreenshots() {
    const retentionDays = Math.max(
      1,
      Number(process.env.SCREENSHOT_RETENTION_DAYS || 30),
    );
    const batchSize = Math.max(
      50,
      Number(process.env.SCREENSHOT_CLEANUP_BATCH_SIZE || 500),
    );
    const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);

    let removedRecords = 0;
    let removedFiles = 0;

    while (true) {
      const rows = await this.prisma.activityScreenshot.findMany({
        where: {
          capturedAt: {
            lt: cutoff,
          },
        },
        orderBy: {
          capturedAt: 'asc',
        },
        take: batchSize,
        select: {
          id: true,
          url: true,
          objectKey: true,
          storageProvider: true,
        },
      });

      if (!rows.length) break;

      const deletableIds: string[] = [];
      for (const row of rows) {
        const removed = await this.deleteScreenshotObject({
          screenshotUrl: row.url,
          objectKey: row.objectKey,
          storageProvider: row.storageProvider,
        });
        if (removed) {
          removedFiles += 1;
          deletableIds.push(row.id);
        }
      }

      if (!deletableIds.length) break;

      const deleted = await this.prisma.activityScreenshot.deleteMany({
        where: {
          id: {
            in: deletableIds,
          },
        },
      });

      removedRecords += deleted.count;
      if (rows.length < batchSize) break;
    }

    while (true) {
      const rows = await this.prisma.tenantAuditLog.findMany({
        where: {
          scope: 'ACTIVITY',
          action: 'ACTIVITY_SCREENSHOT',
          createdAt: {
            lt: cutoff,
          },
        },
        orderBy: {
          createdAt: 'asc',
        },
        take: batchSize,
        select: {
          id: true,
          afterData: true,
        },
      });

      if (!rows.length) break;

      const deletableAuditIds: string[] = [];
      for (const row of rows) {
        const data = this.toRecord(row.afterData);
        const metadata = this.toRecord(data.metadata);
        const screenshotUrl = this.toText(data.screenshotUrl);
        const objectKey = this.toText(metadata.objectKey || data.objectKey);
        const storageProvider = this.toText(
          metadata.storageProvider || data.storageProvider,
          'local',
        );

        const removed = await this.deleteScreenshotObject({
          screenshotUrl,
          objectKey,
          storageProvider,
        });
        if (removed) {
          removedFiles += 1;
          deletableAuditIds.push(row.id);
        }
      }

      if (!deletableAuditIds.length) break;

      const deleted = await this.prisma.tenantAuditLog.deleteMany({
        where: {
          id: {
            in: deletableAuditIds,
          },
        },
      });
      removedRecords += deleted.count;

      if (rows.length < batchSize) break;
    }

    if (removedRecords > 0 || removedFiles > 0) {
      this.logger.log(
        `screenshot retention cleanup completed: records=${removedRecords}, files=${removedFiles}, retentionDays=${retentionDays}`,
      );
    }
  }

  private async ingestEvent(
    actor: Actor | undefined,
    requestedCompanyId: string | undefined,
    action: string,
    payload: IngestPayload,
  ) {
    const { companyId } = await this.assertCompanyScope(
      actor,
      requestedCompanyId,
      true,
    );

    const log = await this.prisma.tenantAuditLog.create({
      data: {
        companyId: companyId as string,
        actorId: actor?.id,
        action,
        scope: 'ACTIVITY',
        entityType: 'EmployeeActivity',
        entityId: payload.employeeId || actor?.id || null,
        afterData: {
          employeeId: payload.employeeId || null,
          appName: payload.appName || null,
          windowTitle: payload.windowTitle || null,
          processName: payload.processName || null,
          url: payload.url || null,
          domain: payload.domain || null,
          durationSec: Number(payload.durationSec || 0),
          idleSec: Number(payload.idleSec || 0),
          keyboardCount: Number(payload.keyboardCount || 0),
          mouseCount: Number(payload.mouseCount || 0),
          heartbeatSec: Number(payload.heartbeatSec || 0),
          isAfk: Boolean(payload.isAfk || false),
          screenshotUrl: payload.screenshotUrl || null,
          screenshotBase64: payload.screenshotBase64 || null,
          objectKey: this.toText(payload.metadata?.objectKey),
          storageProvider: this.toText(payload.metadata?.storageProvider),
          screenshotHash: this.toText(
            payload.metadata?.dhash || payload.metadata?.phash,
          ),
          capturedAt: payload.capturedAt || new Date().toISOString(),
          metadata: (payload.metadata || {}) as Prisma.InputJsonObject,
        },
      },
      select: {
        id: true,
        companyId: true,
        action: true,
        createdAt: true,
      },
    });

    this.eventStream.next({
      id: log.id,
      companyId,
      action,
      employeeId: payload.employeeId || actor?.id || null,
      capturedAt: payload.capturedAt || new Date().toISOString(),
      payload,
    });

    return log;
  }

  ingestWindowEvent(
    actor: Actor | undefined,
    requestedCompanyId: string | undefined,
    payload: IngestPayload,
  ) {
    return this.ingestEvent(
      actor,
      requestedCompanyId,
      'ACTIVITY_WINDOW',
      payload,
    );
  }

  ingestIdleEvent(
    actor: Actor | undefined,
    requestedCompanyId: string | undefined,
    payload: IngestPayload,
  ) {
    return this.ingestEvent(
      actor,
      requestedCompanyId,
      'ACTIVITY_IDLE',
      payload,
    );
  }

  ingestScreenshot(
    actor: Actor | undefined,
    requestedCompanyId: string | undefined,
    payload: IngestPayload,
  ) {
    return this.ingestEvent(
      actor,
      requestedCompanyId,
      'ACTIVITY_SCREENSHOT',
      payload,
    );
  }

  ingestHeartbeat(
    actor: Actor | undefined,
    requestedCompanyId: string | undefined,
    payload: IngestPayload,
  ) {
    return this.ingestEvent(
      actor,
      requestedCompanyId,
      'ACTIVITY_HEARTBEAT',
      payload,
    );
  }

  ingestScreenshotFile(
    actor: Actor | undefined,
    requestedCompanyId: string | undefined,
    payload: IngestPayload,
    file:
      | { buffer?: Buffer; mimetype?: string; originalname?: string }
      | undefined,
  ) {
    return this.assertCompanyScope(actor, requestedCompanyId, true).then(
      async ({ companyId }) => {
        const employeeId = String(payload.employeeId || actor?.id || 'unknown');
        const capturedAt = payload.capturedAt
          ? new Date(payload.capturedAt)
          : new Date();

        let screenshotUrl = payload.screenshotUrl;
        let storageProvider = 'none';
        let objectKey = '';

        if (file?.buffer && file.buffer.length > 0) {
          const saved = await this.persistScreenshotBinary({
            companyId: String(companyId),
            employeeId,
            capturedAt,
            mimeType: String(file.mimetype || 'image/jpeg'),
            originalName: file.originalname,
            buffer: file.buffer,
          });

          screenshotUrl = saved.screenshotUrl;
          storageProvider = saved.storageProvider;
          objectKey = saved.objectKey;
        }

        return this.ingestEvent(
          actor,
          requestedCompanyId,
          'ACTIVITY_SCREENSHOT',
          {
            ...payload,
            screenshotUrl,
            metadata: {
              ...(payload.metadata || {}),
              objectKey,
              storageProvider,
            },
          },
        );
      },
    );
  }

  ingestInputStats(
    actor: Actor | undefined,
    requestedCompanyId: string | undefined,
    payload: IngestPayload,
  ) {
    return this.ingestEvent(
      actor,
      requestedCompanyId,
      'ACTIVITY_INPUT',
      payload,
    );
  }

  async getLiveActivity(
    actor: Actor | undefined,
    query: { date?: string; companyId?: string; limit?: number },
  ) {
    const { companyId } = await this.assertCompanyScope(
      actor,
      query.companyId,
      true,
    );
    const { start, end, date } = this.dayRange(query.date);

    const rows = await this.prisma.tenantAuditLog.findMany({
      where: {
        companyId: companyId as string,
        scope: 'ACTIVITY',
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(Number(query.limit || 50), 1), 200),
      select: {
        id: true,
        action: true,
        entityId: true,
        createdAt: true,
        afterData: true,
      },
    });

    return {
      date,
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        employeeId: row.entityId,
        at: row.createdAt,
        data: row.afterData,
      })),
    };
  }

  async getAppUsage(
    actor: Actor | undefined,
    query: { date?: string; companyId?: string },
  ) {
    const { companyId } = await this.assertCompanyScope(
      actor,
      query.companyId,
      true,
    );
    const { start, end, date } = this.dayRange(query.date);

    const rows = await this.prisma.tenantAuditLog.findMany({
      where: {
        companyId: companyId as string,
        scope: 'ACTIVITY',
        action: 'ACTIVITY_WINDOW',
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: { afterData: true },
    });

    const usage = new Map<string, number>();
    for (const row of rows) {
      const data = this.toRecord(row.afterData);
      const appName = this.toText(data.appName, 'Unknown');
      const duration = Number(data.durationSec || 0);
      usage.set(appName, (usage.get(appName) || 0) + duration);
    }

    return {
      date,
      apps: Array.from(usage.entries())
        .map(([appName, durationSec]) => ({
          appName,
          durationSec,
        }))
        .sort((a, b) => b.durationSec - a.durationSec),
    };
  }

  async getWebsiteTracking(
    actor: Actor | undefined,
    query: { date?: string; companyId?: string },
  ) {
    const { companyId } = await this.assertCompanyScope(
      actor,
      query.companyId,
      true,
    );
    const { start, end, date } = this.dayRange(query.date);

    const rows = await this.prisma.tenantAuditLog.findMany({
      where: {
        companyId: companyId as string,
        scope: 'ACTIVITY',
        action: 'ACTIVITY_WINDOW',
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: { afterData: true },
    });

    const domainMap = new Map<string, number>();
    for (const row of rows) {
      const data = this.toRecord(row.afterData);
      const rawUrl = this.toText(data.url);
      let domain = this.toText(data.domain);
      if (!domain && rawUrl) {
        try {
          domain = new URL(rawUrl).hostname;
        } catch {
          domain = '';
        }
      }
      if (!domain) continue;
      const duration = Number(data.durationSec || 0);
      domainMap.set(domain, (domainMap.get(domain) || 0) + duration);
    }

    return {
      date,
      websites: Array.from(domainMap.entries())
        .map(([domain, durationSec]) => ({ domain, durationSec }))
        .sort((a, b) => b.durationSec - a.durationSec),
    };
  }

  async getScreenshots(
    actor: Actor | undefined,
    query: {
      date?: string;
      companyId?: string;
      limit?: number;
      cursor?: string;
    },
  ) {
    const { companyId } = await this.assertCompanyScope(
      actor,
      query.companyId,
      true,
    );
    const { start, end, date } = this.dayRange(query.date);
    const limit = Math.min(Math.max(Number(query.limit || 60), 1), 120);
    const parsedCursor = this.decodeScreenshotCursor(query.cursor);

    const cursorWhere = parsedCursor
      ? {
          OR: [
            { createdAt: { lt: parsedCursor.createdAt } },
            {
              createdAt: parsedCursor.createdAt,
              id: { lt: parsedCursor.id },
            },
          ],
        }
      : {};

    const rows = await this.prisma.tenantAuditLog.findMany({
      where: {
        companyId: companyId as string,
        scope: 'ACTIVITY',
        action: 'ACTIVITY_SCREENSHOT',
        createdAt: {
          gte: start,
          lte: end,
        },
        ...cursorWhere,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      select: {
        id: true,
        entityId: true,
        createdAt: true,
        afterData: true,
      },
    });

    const hasMore = rows.length > limit;
    const currentRows = hasMore ? rows.slice(0, limit) : rows;

    const employeeIds = Array.from(
      new Set(
        rows
          .map((row) => String(row.entityId || '').trim())
          .filter((id) => Boolean(id)),
      ),
    );

    const employees = employeeIds.length
      ? await this.prisma.employee.findMany({
          where: {
            companyId: companyId as string,
            id: {
              in: employeeIds,
            },
          },
          select: {
            id: true,
            name: true,
            department: {
              select: {
                name: true,
              },
            },
          },
        })
      : [];

    const employeeMap = new Map(
      employees.map((employee) => [employee.id, employee]),
    );

    return {
      date,
      screenshots: currentRows.map((row) => {
        const data = this.toRecord(row.afterData);
        const employeeId = String(row.entityId || '');
        const employee = employeeMap.get(employeeId);
        const metadata = this.toRecord(data.metadata);

        const keyboardCount = Number(
          data.keyboardCount || metadata.keyboardCount || 0,
        );
        const mouseCount = Number(data.mouseCount || metadata.mouseCount || 0);
        const idleSec = Number(data.idleSec || metadata.idleSec || 0);

        return {
          id: row.id,
          employeeId: employeeId || row.entityId,
          employeeName: employee?.name || this.toText(metadata.employeeName),
          departmentName:
            employee?.department?.name || this.toText(metadata.departmentName),
          capturedAt: data.capturedAt || row.createdAt,
          screenshotUrl: data.screenshotUrl || null,
          screenshotBase64: data.screenshotBase64 || null,
          appName:
            data.appName ||
            metadata.appName ||
            data.processName ||
            metadata.processName ||
            null,
          windowTitle: data.windowTitle || metadata.windowTitle || null,
          keyboardCount,
          mouseCount,
          idleSec,
          isAfk: Boolean(data.isAfk || metadata.isAfk || false),
          url: data.url || metadata.url || null,
          metadata,
        };
      }),
      nextCursor: hasMore
        ? this.encodeScreenshotCursor(
            currentRows[currentRows.length - 1].createdAt,
            currentRows[currentRows.length - 1].id,
          )
        : null,
      hasMore,
    };
  }

  async getInputStats(
    actor: Actor | undefined,
    query: { date?: string; companyId?: string },
  ) {
    const { companyId } = await this.assertCompanyScope(
      actor,
      query.companyId,
      true,
    );
    const { start, end, date } = this.dayRange(query.date);

    const rows = await this.prisma.tenantAuditLog.findMany({
      where: {
        companyId: companyId as string,
        scope: 'ACTIVITY',
        action: 'ACTIVITY_INPUT',
        createdAt: {
          gte: start,
          lte: end,
        },
      },
      select: {
        entityId: true,
        afterData: true,
      },
    });

    const byEmployee = new Map<
      string,
      { keyboardCount: number; mouseCount: number }
    >();
    for (const row of rows) {
      const employeeId = row.entityId || 'unknown';
      const data = (row.afterData || {}) as Record<string, unknown>;
      const keyboardCount = Number(data.keyboardCount || 0);
      const mouseCount = Number(data.mouseCount || 0);
      const current = byEmployee.get(employeeId) || {
        keyboardCount: 0,
        mouseCount: 0,
      };
      current.keyboardCount += keyboardCount;
      current.mouseCount += mouseCount;
      byEmployee.set(employeeId, current);
    }

    return {
      date,
      totalKeyboardCount: Array.from(byEmployee.values()).reduce(
        (sum, row) => sum + row.keyboardCount,
        0,
      ),
      totalMouseCount: Array.from(byEmployee.values()).reduce(
        (sum, row) => sum + row.mouseCount,
        0,
      ),
      employees: Array.from(byEmployee.entries()).map(
        ([employeeId, stats]) => ({
          employeeId,
          ...stats,
        }),
      ),
    };
  }
}
