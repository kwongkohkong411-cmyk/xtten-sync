import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { RequirePermission } from '../auth/permissions.decorator';
import type { Actor } from '../auth/rbac-core.service';
import { ActivityService } from './activity.service';
import { ActivitySessionService } from './activity-session.service';

type RequestWithUser = {
  user?: Actor;
};

type IngestPayload = Record<string, unknown>;

type UploadFile = {
  buffer?: Buffer;
  mimetype?: string;
  originalname?: string;
};

const toPayload = (body: unknown): IngestPayload => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {};
  }
  return body as IngestPayload;
};

@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly activitySessionService: ActivitySessionService,
  ) {}

  @RequirePermission('screenshot:view')
  @Get('sessions')
  getDailySessions(
    @Req() req: RequestWithUser,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.activitySessionService.getDailySessions(req.user, {
      date,
      companyId,
      employeeId,
    });
  }

  @RequirePermission('screenshot:view')
  @Get('productivity')
  getProductivitySummary(
    @Req() req: RequestWithUser,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.activitySessionService.getProductivitySummary(req.user, {
      date,
      companyId,
      employeeId,
    });
  }

  @RequirePermission('screenshot:view')
  @Get('categories')
  getActivityCategories() {
    return this.activitySessionService.getCategoryMap();
  }

  @RequirePermission('screenshot:view')
  @Sse('stream')
  streamTimeline(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.activitySessionService.streamTimeline(req.user, { companyId });
  }

  @RequirePermission('screenshot:view')
  @Get('live')
  getLiveActivity(
    @Req() req: RequestWithUser,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.activityService.getLiveActivity(req.user, {
      date,
      companyId,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @RequirePermission('screenshot:view')
  @Get('app-usage')
  getAppUsage(
    @Req() req: RequestWithUser,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.activityService.getAppUsage(req.user, { date, companyId });
  }

  @RequirePermission('screenshot:view')
  @Get('website-tracking')
  getWebsiteTracking(
    @Req() req: RequestWithUser,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.activityService.getWebsiteTracking(req.user, {
      date,
      companyId,
    });
  }

  @RequirePermission('screenshot:view')
  @Get('screenshots')
  getScreenshots(
    @Req() req: RequestWithUser,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    return this.activityService.getScreenshots(req.user, {
      date,
      companyId,
      limit: limit ? Number(limit) : undefined,
      cursor,
    });
  }

  @RequirePermission('screenshot:view')
  @Get('input-stats')
  getInputStats(
    @Req() req: RequestWithUser,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.activityService.getInputStats(req.user, { date, companyId });
  }

  @RequirePermission('activity:manage')
  @Post('ingest/heartbeat')
  ingestHeartbeat(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.activityService.ingestHeartbeat(
      req.user,
      companyId,
      toPayload(body),
    );
  }

  @RequirePermission('activity:manage')
  @Post('ingest/window-event')
  ingestWindowEvent(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.activityService.ingestWindowEvent(
      req.user,
      companyId,
      toPayload(body),
    );
  }

  @RequirePermission('activity:manage')
  @Post('ingest/idle-event')
  ingestIdleEvent(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.activityService.ingestIdleEvent(
      req.user,
      companyId,
      toPayload(body),
    );
  }

  @RequirePermission('activity:manage')
  @Post('ingest/screenshot-file')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: {
        fileSize: 8 * 1024 * 1024,
      },
    }),
  )
  ingestScreenshotFile(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId: string | undefined,
    @Body() body: unknown,
    @UploadedFile() file: UploadFile | undefined,
  ) {
    const payload = toPayload(body);
    let metadata: unknown = payload.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = { raw: metadata };
      }
    }

    const normalizedMetadata = toPayload(metadata);

    return this.activityService.ingestScreenshotFile(
      req.user,
      companyId,
      {
        ...payload,
        metadata: normalizedMetadata,
      },
      file,
    );
  }

  @RequirePermission('activity:manage')
  @Post('ingest/screenshot')
  ingestScreenshot(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.activityService.ingestScreenshot(
      req.user,
      companyId,
      toPayload(body),
    );
  }

  @RequirePermission('activity:manage')
  @Post('screenshots')
  uploadActivityScreenshot(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.activityService.uploadActivityScreenshot(
      req.user,
      companyId,
      toPayload(body),
    );
  }

  @RequirePermission('activity:manage')
  @Post('ingest/input-stats')
  ingestInputStats(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId: string | undefined,
    @Body() body: unknown,
  ) {
    return this.activityService.ingestInputStats(
      req.user,
      companyId,
      toPayload(body),
    );
  }
}
