import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { RequirePermission } from '../auth/permissions.decorator';
import { EventDlqLifecycleService } from './event-dlq-lifecycle.service';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

@Controller('events/dlq')
export class EventDlqController {
  constructor(private readonly dlqLifecycleService: EventDlqLifecycleService) {}

  @RequirePermission('system:admin')
  @Get()
  list(@Query('companyId') companyId?: string, @Query('limit') limit?: string) {
    return this.dlqLifecycleService.list(companyId, Number(limit || 50));
  }

  @RequirePermission('system:admin')
  @Patch(':eventLogId/replay')
  replay(@Param('eventLogId') eventLogId: string, @Req() req: RequestWithUser) {
    return this.dlqLifecycleService.replay(eventLogId, req?.user?.id);
  }

  @RequirePermission('system:admin')
  @Post('replay-batch')
  replayBatch(
    @Body() body: { eventLogIds: string[] },
    @Req() req: RequestWithUser,
  ) {
    return this.dlqLifecycleService.replayBatch(
      body?.eventLogIds || [],
      req?.user?.id,
    );
  }
}
