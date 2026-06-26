import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { ShiftTemplatesService } from './shift-templates.service';

@Controller('shift-templates')
export class ShiftTemplatesController {
  constructor(private readonly shiftTemplatesService: ShiftTemplatesService) {}

  @Get()
  findAll(companyId: string) {
    return this.shiftTemplatesService.findAll(companyId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.shiftTemplatesService.findOne(id);
  }

  @Post()
  create(@Body() body: any) {
    return this.shiftTemplatesService.create(body);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() body: any) {
    return this.shiftTemplatesService.update(id, body);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.shiftTemplatesService.remove(id);
  }
}