import { Module } from '@nestjs/common';
import { ActivityController } from './activity.controller';
import { ActivityService } from './activity.service';
import { ActivitySessionService } from './activity-session.service';

@Module({
  controllers: [ActivityController],
  providers: [ActivityService, ActivitySessionService],
})
export class ActivityModule {}
