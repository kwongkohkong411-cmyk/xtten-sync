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
import { RequirePermission } from '../auth/permissions.decorator';
import { RolesService } from './roles.service';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

type RoleBody = {
  name?: string;
  description?: string;
  permissionIds?: string[];
};

type RoleCreateBody = {
  name: string;
  description?: string;
  permissionIds?: string[];
};

@Controller('roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @RequirePermission('user:manage')
  @Post('init')
  init(@Req() req: RequestWithUser) {
    return this.rolesService.init(req.user);
  }

  @RequirePermission('user:manage')
  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.rolesService.findAll(req.user);
  }

  @RequirePermission('user:manage')
  @Post()
  create(@Body() body: RoleCreateBody, @Req() req: RequestWithUser) {
    return this.rolesService.create(body, req.user);
  }

  @RequirePermission('user:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: RoleBody,
    @Req() req: RequestWithUser,
  ) {
    return this.rolesService.update(id, body, req.user);
  }

  @RequirePermission('user:manage')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.rolesService.remove(id, req.user);
  }
}
