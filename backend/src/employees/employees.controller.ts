import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Patch,
  Query,
  Req,
} from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { RequirePermission } from '../auth/permissions.decorator';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

type Employee360Query = {
  includeAttendance?: string;
  includeActivity?: string;
  includeDepartmentHistory?: string;
  includeLifecycle?: string;
  includeTimeline?: string;
  attendancePage?: string;
  attendancePageSize?: string;
  activityPage?: string;
  activityPageSize?: string;
  departmentHistoryPage?: string;
  departmentHistoryPageSize?: string;
  timelinePage?: string;
  timelinePageSize?: string;
};

@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @RequirePermission('user:manage')
  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.employeesService.findAll(req.user);
  }

  @RequirePermission('user:manage')
  @Get(':id/overview')
  overview(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.employeesService.getOverview(id, req.user);
  }

  @RequirePermission('user:manage')
  @Get(':id/360')
  readModel360(
    @Param('id') id: string,
    @Query() query: Employee360Query,
    @Req() req: RequestWithUser,
  ) {
    return this.employeesService.get360(id, req.user, query);
  }

  @RequirePermission('user:manage')
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.employeesService.findOne(id, req.user);
  }

  @RequirePermission('user:manage')
  @Post()
  create(@Body() body: Record<string, unknown>, @Req() req: RequestWithUser) {
    return this.employeesService.create(body, req.user);
  }

  @RequirePermission('user:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithUser,
  ) {
    return this.employeesService.update(id, body, req.user);
  }

  @RequirePermission('user:manage')
  @Patch(':id/lifecycle')
  updateLifecycle(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: RequestWithUser,
  ) {
    return this.employeesService.updateLifecycle(id, body, req.user);
  }

  @RequirePermission('user:manage')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.employeesService.remove(id, req.user);
  }
}
