import {
  Controller,
  Post,
  Get,
  Req,
  UseGuards,
  Param,
  Query,
  Body,
} from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  // =====================
  // CHECK IN
  // =====================
  @UseGuards(JwtAuthGuard)
  @RequirePermission('attendance:manage')
  @Post('check-in')
  checkIn(
    @Req() req: RequestWithUser,
    @Body() body?: { clockInAt?: string },
  ) {
    return this.service.checkIn(req, body?.clockInAt);
  }

  // =====================
  // CHECK OUT (FIXED)
  // =====================
  @UseGuards(JwtAuthGuard)
  @RequirePermission('attendance:manage')
  @Post('check-out/:id')
  checkOut(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body?: { checkOutAt?: string },
  ) {
    return this.service.checkOut(req, id, body?.checkOutAt);
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermission('attendance:manage')
  @Post('break-out')
  breakOut(@Req() req: RequestWithUser) {
    return this.service.breakOut(req);
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermission('attendance:manage')
  @Post('break-in')
  breakIn(@Req() req: RequestWithUser) {
    return this.service.breakIn(req);
  }

  // =====================
  // TODAY
  // =====================
  @UseGuards(JwtAuthGuard)
  @RequirePermission('attendance:view')
  @Get('today')
  today(@Req() req: RequestWithUser) {
    return this.service.today(req);
  }

  // =====================
  // HISTORY
  // =====================
  @UseGuards(JwtAuthGuard)
  @RequirePermission('attendance:view')
  @Get('history')
  history(@Req() req: RequestWithUser) {
    return this.service.history(req);
  }

  @UseGuards(JwtAuthGuard)
  @RequirePermission('attendance:view')
  @Get('events')
  events(
    @Req() req: RequestWithUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('employeeId') employeeId?: string,
  ) {
    return this.service.events(req, { startDate, endDate, employeeId });
  }

  // =====================
  // DETECT ABSENTS
  // =====================
  @UseGuards(JwtAuthGuard)
  @RequirePermission('attendance:manage')
  @Post('detect-absents')
  detectAbsents(
    @Req() req: RequestWithUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.detectAbsents(req, { startDate, endDate });
  }
}
