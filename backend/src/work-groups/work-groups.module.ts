import { Module } from '@nestjs/common';
import { WorkGroupsService } from './work-groups.service';
import { WorkGroupsController } from './work-groups.controller';

@Module({
  controllers: [WorkGroupsController],
  providers: [WorkGroupsService],
})
export class WorkGroupsModule {}