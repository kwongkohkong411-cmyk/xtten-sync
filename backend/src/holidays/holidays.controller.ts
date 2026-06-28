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
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};
import { HolidaysService } from './holidays.service';

@Controller('holidays')
@UseGuards(JwtAuthGuard)
export class HolidaysController {
  constructor(private readonly holidaysService: HolidaysService) {}

  @RequirePermission('holiday:view')
  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('country') country?: string,
    @Query('companyId') companyId?: string,
  ) {
    return this.holidaysService.findAll(req, {
      startDate,
      endDate,
      country,
      companyId,
    });
  }

  @RequirePermission('holiday:manage')
  @Post()
  create(@Req() req: RequestWithUser, @Body() body: Record<string, unknown>) {
    return this.holidaysService.create(req, body);
  }

  @RequirePermission('holiday:manage')
  @Patch(':id')
  update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.holidaysService.update(req, id, body);
  }

  @RequirePermission('holiday:manage')
  @Delete(':id')
  remove(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.holidaysService.remove(req, id);
  }
}
