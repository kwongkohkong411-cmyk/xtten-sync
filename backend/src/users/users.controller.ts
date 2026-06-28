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
import { UsersService } from './users.service';
import { RequirePermission } from '../auth/permissions.decorator';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

type UserUpsertBody = {
  email?: string;
  username?: string;
  password?: string;
  name?: string;
  roleId?: string;
  status?: string;
  companyId?: string;
};

type UserCreateBody = {
  email: string;
  username: string;
  password: string;
  name: string;
  roleId?: string;
  status?: string;
  companyId?: string;
};

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @RequirePermission('user:manage')
  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.usersService.findAll(req.user);
  }

  @RequirePermission('user:manage')
  @Get('company/:companyId')
  findByCompany(
    @Param('companyId') companyId: string,
    @Req() req: RequestWithUser,
  ) {
    return this.usersService.findByCompany(companyId, req.user);
  }

  @RequirePermission('user:manage')
  @Post()
  create(@Body() body: UserCreateBody, @Req() req: RequestWithUser) {
    return this.usersService.create(body, req.user);
  }

  @RequirePermission('user:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() body: UserUpsertBody,
    @Req() req: RequestWithUser,
  ) {
    return this.usersService.update(id, body, req.user);
  }

  @RequirePermission('user:manage')
  @Patch(':id/status')
  updateStatus(
    @Param('id') id: string,
    @Body() body: { status: string },
    @Req() req: RequestWithUser,
  ) {
    return this.usersService.updateStatus(id, body.status, req.user);
  }

  @RequirePermission('user:manage')
  @Patch(':id/role')
  assignRole(
    @Param('id') id: string,
    @Body() body: { roleId: string },
    @Req() req: RequestWithUser,
  ) {
    return this.usersService.assignRole(id, body.roleId, req.user);
  }

  @RequirePermission('user:manage')
  @Patch(':id/reset-password')
  resetPassword(
    @Param('id') id: string,
    @Body() body: { newPassword: string },
    @Req() req: RequestWithUser,
  ) {
    return this.usersService.resetPassword(id, body.newPassword, req.user);
  }

  @RequirePermission('user:manage')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.usersService.remove(id, req.user);
  }
}
