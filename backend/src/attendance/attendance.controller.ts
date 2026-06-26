import { Controller, Post, Body, Param, Get, Query } from '@nestjs/common';
import { AttendanceService } from './attendance.service';

@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  // 上班打卡
  @Post('check-in')
  checkIn(@Body() body: any) {
    return this.service.checkIn(body);
  }

  // 下班打卡
  @Post('check-out/:id')
  checkOut(@Param('id') id: string) {
    return this.service.checkOut(id);
  }

  // 今日记录
  @Get('today')
  today(@Query('employeeId') employeeId: string) {
    return this.service.today(employeeId);
  }

  // 历史记录
  @Get()
  findByEmployee(@Query('employeeId') employeeId: string) {
    return this.service.findByEmployee(employeeId);
  }
}