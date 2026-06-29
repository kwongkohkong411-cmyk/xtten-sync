import { Module } from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { LeavesController } from './leaves.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { LeaveSettingsController } from './leave-settings.controller';
import { LeaveSettingsService } from './leave-settings.service';

@Module({
  imports: [PrismaModule],
  providers: [LeavesService, LeaveSettingsService],
  controllers: [LeavesController, LeaveSettingsController],
})
export class LeavesModule {}
