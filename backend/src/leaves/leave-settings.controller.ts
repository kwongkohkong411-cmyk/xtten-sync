import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { RequirePermission } from '../auth/permissions.decorator';
import type { Actor } from '../auth/rbac-core.service';
import { LeaveSettingsService } from './leave-settings.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { CreateLeaveBalanceSettingDto } from './dto/create-leave-balance-setting.dto';
import { UpdateLeaveBalanceSettingDto } from './dto/update-leave-balance-setting.dto';
import { CreateLeaveApproverDto } from './dto/create-leave-approver.dto';
import { UpdateLeaveApproverDto } from './dto/update-leave-approver.dto';

type RequestWithUser = {
  user?: Actor;
};

@Controller('leave-settings')
export class LeaveSettingsController {
  constructor(private readonly leaveSettingsService: LeaveSettingsService) {}

  @RequirePermission('leave:view_settings')
  @Get('types')
  getLeaveTypes(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.leaveSettingsService.getLeaveTypes(req, companyId);
  }

  @RequirePermission('leave:edit_settings')
  @Post('types')
  createLeaveType(
    @Req() req: RequestWithUser,
    @Body() dto: CreateLeaveTypeDto,
  ) {
    return this.leaveSettingsService.createLeaveType(req, dto);
  }

  @RequirePermission('leave:edit_settings')
  @Patch('types/:id')
  updateLeaveType(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveTypeDto,
  ) {
    return this.leaveSettingsService.updateLeaveType(req, id, dto);
  }

  @RequirePermission('leave:edit_settings')
  @Delete('types/:id')
  deleteLeaveType(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.leaveSettingsService.deleteLeaveType(req, id);
  }

  @RequirePermission('leave:view_settings')
  @Get('balances')
  getBalanceSettings(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.leaveSettingsService.getBalanceSettings(req, companyId);
  }

  @RequirePermission('leave:edit_settings')
  @Post('balances')
  createBalanceSetting(
    @Req() req: RequestWithUser,
    @Body() dto: CreateLeaveBalanceSettingDto,
  ) {
    return this.leaveSettingsService.createBalanceSetting(req, dto);
  }

  @RequirePermission('leave:edit_settings')
  @Patch('balances/:id')
  updateBalanceSetting(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveBalanceSettingDto,
  ) {
    return this.leaveSettingsService.updateBalanceSetting(req, id, dto);
  }

  @RequirePermission('leave:edit_settings')
  @Delete('balances/:id')
  deleteBalanceSetting(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.leaveSettingsService.deleteBalanceSetting(req, id);
  }

  @RequirePermission('leave:view_settings')
  @Get('approvers')
  getApprovers(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.leaveSettingsService.getApprovers(req, companyId);
  }

  @RequirePermission('leave:edit_settings')
  @Post('approvers')
  createApprover(
    @Req() req: RequestWithUser,
    @Body() dto: CreateLeaveApproverDto,
  ) {
    return this.leaveSettingsService.createApprover(req, dto);
  }

  @RequirePermission('leave:edit_settings')
  @Patch('approvers/:id')
  updateApprover(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() dto: UpdateLeaveApproverDto,
  ) {
    return this.leaveSettingsService.updateApprover(req, id, dto);
  }

  @RequirePermission('leave:edit_settings')
  @Delete('approvers/:id')
  deleteApprover(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.leaveSettingsService.deleteApprover(req, id);
  }
}
