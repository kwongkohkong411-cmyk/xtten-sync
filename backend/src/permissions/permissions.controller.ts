import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { RequirePermission } from '../auth/permissions.decorator';
import { PermissionsService } from './permissions.service';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

type PermissionBody = {
  key?: string;
  module?: string;
  action?: string;
  desc?: string;
};

@Controller('permissions')
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @RequirePermission('roles:view')
  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.permissionsService.findAll(req.user);
  }

  @RequirePermission('permissions:manage')
  @Post()
  create(@Body() body: PermissionBody, @Req() req: RequestWithUser) {
    return this.permissionsService.create(body, req.user);
  }

  @RequirePermission('permissions:manage')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.permissionsService.remove(id, req.user);
  }
}
