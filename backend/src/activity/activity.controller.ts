import { Body, Controller, Get, Post, Query, Req, Sse, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { RequirePermission } from '../auth/permissions.decorator';
import { ActivityService } from './activity.service';
import { ActivitySessionService } from './activity-session.service';

@Controller('activity')
export class ActivityController {
  constructor(
    private readonly activityService: ActivityService,
    private readonly activitySessionService: ActivitySessionService,
  ) {}

  @RequirePermission('activity:view')
  @Get('sessions')
  getDailySessions(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.activitySessionService.getDailySessions(req.user, { date, companyId, employeeId });
  }

  @RequirePermission('activity:view')
  @Get('productivity')
  getProductivitySummary(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.activitySessionService.getProductivitySummary(req.user, { date, companyId, employeeId });
  }

  @RequirePermission('activity:view')
  @Get('categories')
  getActivityCategories() {
    return this.activitySessionService.getCategoryMap();
  }

  @RequirePermission('activity:view')
  @Sse('stream')
  streamTimeline(@Req() req: any, @Query('companyId') companyId?: string) {
    return this.activitySessionService.streamTimeline(req.user, { companyId });
  }

  @RequirePermission('activity:view')
  @Get('live')
  getLiveActivity(
    @Req() req: any,
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

  @RequirePermission('activity:view')
  @Get('app-usage')
  getAppUsage(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.activityService.getAppUsage(req.user, { date, companyId });
  }

  @RequirePermission('activity:view')
  @Get('website-tracking')
  getWebsiteTracking(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.activityService.getWebsiteTracking(req.user, { date, companyId });
  }

  @RequirePermission('activity:view')
  @Get('screenshots')
  getScreenshots(
    @Req() req: any,
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

  @RequirePermission('activity:view')
  @Get('input-stats')
  getInputStats(
    @Req() req: any,
    @Query('date') date?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.activityService.getInputStats(req.user, { date, companyId });
  }

  @RequirePermission('activity:manage')
  @Post('ingest/heartbeat')
  ingestHeartbeat(
    @Req() req: any,
    @Query('companyId') companyId: string | undefined,
    @Body() body: any,
  ) {
    return this.activityService.ingestHeartbeat(req.user, companyId, body || {});
  }

  @RequirePermission('activity:manage')
  @Post('ingest/window-event')
  ingestWindowEvent(
    @Req() req: any,
    @Query('companyId') companyId: string | undefined,
    @Body() body: any,
  ) {
    return this.activityService.ingestWindowEvent(req.user, companyId, body || {});
  }

  @RequirePermission('activity:manage')
  @Post('ingest/idle-event')
  ingestIdleEvent(
    @Req() req: any,
    @Query('companyId') companyId: string | undefined,
    @Body() body: any,
  ) {
    return this.activityService.ingestIdleEvent(req.user, companyId, body || {});
  }

  @RequirePermission('activity:manage')
  @Post('ingest/screenshot-file')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 8 * 1024 * 1024,
      },
    }),
  )
  ingestScreenshotFile(
    @Req() req: any,
    @Query('companyId') companyId: string | undefined,
    @Body() body: any,
    @UploadedFile() file: any,
  ) {
    let metadata = body?.metadata;
    if (typeof metadata === 'string') {
      try {
        metadata = JSON.parse(metadata);
      } catch {
        metadata = { raw: metadata };
      }
    }

    return this.activityService.ingestScreenshotFile(
      req.user,
      companyId,
      {
        ...(body || {}),
        metadata: metadata || {},
      },
      file,
    );
  }

  @RequirePermission('activity:manage')
  @Post('ingest/screenshot')
  ingestScreenshot(
    @Req() req: any,
    @Query('companyId') companyId: string | undefined,
    @Body() body: any,
  ) {
    return this.activityService.ingestScreenshot(req.user, companyId, body || {});
  }

  @RequirePermission('activity:manage')
  @Post('screenshots')
  uploadActivityScreenshot(
    @Req() req: any,
    @Query('companyId') companyId: string | undefined,
    @Body() body: any,
  ) {
    return this.activityService.uploadActivityScreenshot(req.user, companyId, body || {});
  }

  @RequirePermission('activity:manage')
  @Post('ingest/input-stats')
  ingestInputStats(
    @Req() req: any,
    @Query('companyId') companyId: string | undefined,
    @Body() body: any,
  ) {
    return this.activityService.ingestInputStats(req.user, companyId, body || {});
  }
}
