import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ShiftTemplatesService } from './shift-templates.service';
import { RequirePermission } from '../auth/permissions.decorator';

type ShiftTemplateCreateBody = {
  companyId: string;
  name: string;
  code?: string | null;
  shiftType?: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  lateAfter?: number;
  earlyLeave?: number;
  overtimeAfter?: number;
  crossDay?: boolean;
  color?: string;
  isActive?: boolean;
};

type ShiftTemplateUpdateBody = Partial<ShiftTemplateCreateBody>;

@Controller('shift-templates')
export class ShiftTemplatesController {
  constructor(private readonly service: ShiftTemplatesService) {}

  @RequirePermission('shift:manage')
  @Post()
  create(@Body() dto: ShiftTemplateCreateBody) {
    return this.service.create(dto);
  }

  @RequirePermission('shift:view')
  @Get()
  findAll() {
    return this.service.findAll();
  }

  @RequirePermission('shift:manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ShiftTemplateUpdateBody) {
    return this.service.update(id, dto);
  }

  @RequirePermission('shift:manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
