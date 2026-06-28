import { Module } from '@nestjs/common';
import { ShiftTemplatesService } from './shift-templates.service';
import { ShiftTemplatesController } from './shift-templates.controller';

@Module({
  controllers: [ShiftTemplatesController],
  providers: [ShiftTemplatesService],
})
export class ShiftTemplatesModule {}
