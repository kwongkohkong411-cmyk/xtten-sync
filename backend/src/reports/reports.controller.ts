import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { RequirePermission } from '../auth/permissions.decorator';
import { ReportsService } from './reports.service';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @RequirePermission('report:view')
  @Get('daily')
  getDailyReport(
    @Req() req: RequestWithUser,
    @Query('date') date: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.reportsService.getDailyReport(req, { date, companyId });
  }

  @RequirePermission('report:view')
  @Get('daily/detail')
  getDailyDetailReport(
    @Req() req: RequestWithUser,
    @Query('date') date: string,
    @Query('companyId') companyId?: string,
    @Query('status')
    status?: 'ON_TIME' | 'LATE' | 'LEAVE' | 'HOLIDAY' | 'ABSENT' | 'MISSING',
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('summaryOnly') summaryOnly?: string,
  ) {
    return this.reportsService.getDailyDetailReport(req, {
      date,
      companyId,
      status,
      search,
      page,
      pageSize,
      summaryOnly,
    });
  }

  @RequirePermission('report:view')
  @Get('monthly')
  getMonthlyReport(
    @Req() req: RequestWithUser,
    @Query('month') month: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.reportsService.getMonthlyReport(req, { month, companyId });
  }

  @RequirePermission('report:view')
  @Get('summary')
  getAttendanceSummary(
    @Req() req: RequestWithUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.reportsService.getAttendanceSummary(req, {
      startDate,
      endDate,
      companyId,
    });
  }

  @RequirePermission('report:export')
  @Get('export/day')
  async exportDay(
    @Req() req: RequestWithUser,
    @Res() res: Response,
    @Query('date') date: string,
    @Query('companyId') companyId?: string,
    @Query('format') format?: 'csv' | 'xlsx',
  ) {
    const file = await this.reportsService.exportDaily(req, {
      date,
      companyId,
      format,
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    res.send(file.data);
  }

  @RequirePermission('report:export')
  @Get('export/month')
  async exportMonth(
    @Req() req: RequestWithUser,
    @Res() res: Response,
    @Query('month') month: string,
    @Query('companyId') companyId?: string,
    @Query('format') format?: 'csv' | 'xlsx',
  ) {
    const file = await this.reportsService.exportMonthly(req, {
      month,
      companyId,
      format,
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    res.send(file.data);
  }

  @RequirePermission('report:export')
  @Get('export')
  async exportByType(
    @Req() req: RequestWithUser,
    @Res() res: Response,
    @Query('type') type: 'day' | 'daily' | 'month' | 'monthly',
    @Query('date') date?: string,
    @Query('month') month?: string,
    @Query('companyId') companyId?: string,
    @Query('format') format?: 'csv' | 'xlsx',
  ) {
    if (type === 'day' || type === 'daily') {
      const file = await this.reportsService.exportDaily(req, {
        date: date || new Date().toISOString().slice(0, 10),
        companyId,
        format,
      });
      res.setHeader('Content-Type', file.contentType);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${file.fileName}"`,
      );
      res.send(file.data);
      return;
    }

    const file = await this.reportsService.exportMonthly(req, {
      month: month || new Date().toISOString().slice(0, 7),
      companyId,
      format,
    });
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName}"`,
    );
    res.send(file.data);
  }
}
