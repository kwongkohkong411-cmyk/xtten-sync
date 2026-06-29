import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { LeavesService } from './leaves.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission } from '../auth/permissions.decorator';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

@Controller('leaves')
@UseGuards(JwtAuthGuard)
export class LeavesController {
  constructor(private readonly leavesService: LeavesService) {}

  @RequirePermission(['leave:apply', 'leave:submit'])
  @Post()
  create(@Req() req: RequestWithUser, @Body() createLeaveDto: CreateLeaveDto) {
    return this.leavesService.create(req, createLeaveDto);
  }

  @RequirePermission('leave:view')
  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.leavesService.findAll(req);
  }

  @RequirePermission('leave:view')
  @Get(':id')
  findOne(@Req() req: RequestWithUser, @Param('id') id: string) {
    return this.leavesService.findOne(req, id);
  }

  @RequirePermission('leave:manage')
  @Put(':id')
  update(
    @Req() req: RequestWithUser,
    @Param('id') id: string,
    @Body() updateLeaveDto: UpdateLeaveDto,
  ) {
    return this.leavesService.update(req, id, updateLeaveDto);
  }
}
