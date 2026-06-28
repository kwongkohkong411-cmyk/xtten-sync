import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { WorkGroupsService } from './work-groups.service';
import { RequirePermission } from '../auth/permissions.decorator';

type WorkGroupCreateBody = {
  name: string;
  code?: string | null;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  companyId: string;
  departmentId?: string | null;
};

type WorkGroupUpdateBody = Partial<WorkGroupCreateBody>;

@Controller('work-groups')
export class WorkGroupsController {
  constructor(private readonly workGroupsService: WorkGroupsService) {}

  @RequirePermission('shift:view')
  @Get()
  findAll() {
    return this.workGroupsService.findAll();
  }

  @RequirePermission('shift:manage')
  @Post()
  create(@Body() body: WorkGroupCreateBody) {
    return this.workGroupsService.create(body);
  }

  @RequirePermission('shift:manage')
  @Patch(':id')
  update(@Param('id') id: string, @Body() body: WorkGroupUpdateBody) {
    return this.workGroupsService.update(id, body);
  }

  @RequirePermission('shift:manage')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.workGroupsService.remove(id);
  }
}
