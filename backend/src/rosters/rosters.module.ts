import { Module } from '@nestjs/common';
import { RostersService } from './rosters.service';
import { RostersController } from './rosters.controller';

@Module({
  controllers: [RostersController],
  providers: [RostersService],
})
export class RostersModule {}