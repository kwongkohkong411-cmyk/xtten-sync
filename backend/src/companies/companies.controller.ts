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
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { RequirePermission } from '../auth/permissions.decorator';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @RequirePermission('user:manage')
  @Post()
  create(@Body() dto: CreateCompanyDto, @Req() req: RequestWithUser) {
    return this.companiesService.create(dto, req.user);
  }

  @RequirePermission('user:manage')
  @Get()
  findAll(@Req() req: RequestWithUser) {
    return this.companiesService.findAll(req.user);
  }

  @RequirePermission('user:manage')
  @Get(':id')
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.companiesService.findOne(id, req.user);
  }

  @RequirePermission('user:manage')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCompanyDto,
    @Req() req: RequestWithUser,
  ) {
    return this.companiesService.update(id, dto, req.user);
  }

  @RequirePermission('user:manage')
  @Delete(':id')
  remove(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.companiesService.remove(id, req.user);
  }
}
