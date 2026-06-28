import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { RequirePermission } from '../auth/permissions.decorator';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

@Controller('departments')
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @RequirePermission('user:manage')
  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.departmentsService.findAll(req.user);
  }

  @RequirePermission('user:manage')
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.departmentsService.findOne(id, req.user);
  }

  @RequirePermission('user:manage')
  @Post()
  create(@Body() dto: CreateDepartmentDto, @Req() req: RequestWithUser) {
    return this.departmentsService.create(dto, req.user);
  }

  @RequirePermission('user:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateDepartmentDto,
    @Req() req: RequestWithUser,
  ) {
    return this.departmentsService.update(id, dto, req.user);
  }

  @RequirePermission('user:manage')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.departmentsService.remove(id, req.user);
  }
}
