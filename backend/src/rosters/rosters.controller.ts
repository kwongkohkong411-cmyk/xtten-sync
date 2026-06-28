import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { RostersService } from './rosters.service';
import { RequirePermission } from '../auth/permissions.decorator';

type RosterCreateBody = {
  companyId: string;
  employeeId: string;
  workGroupId: string;
  shiftId: string;
  month: string;
  status?: string;
};

type RosterUpdateBody = {
  companyId?: string;
  employeeId?: string;
  workGroupId?: string;
  shiftId?: string;
  month?: string;
  status?: string;
};

@Controller('rosters')
export class RostersController {
  constructor(private readonly rostersService: RostersService) {}

  @RequirePermission('shift:view')
  @Get()
  findAll() {
    return this.rostersService.findAll();
  }

  @RequirePermission('shift:view')
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.rostersService.findOne(id);
  }

  @RequirePermission('shift:manage')
  @Post()
  create(@Body() body: RosterCreateBody) {
    return this.rostersService.create(body);
  }

  @RequirePermission('shift:manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: RosterUpdateBody) {
    return this.rostersService.update(id, body);
  }

  @RequirePermission('shift:manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.rostersService.remove(id);
  }
}
