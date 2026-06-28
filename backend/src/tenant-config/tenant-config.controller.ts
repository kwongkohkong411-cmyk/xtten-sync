import { Body, Controller, Get, Patch, Query, Req } from '@nestjs/common';
import { RequirePermission } from '../auth/permissions.decorator';
import { UpsertTenantConfigDto } from './dto/upsert-tenant-config.dto';
import { TenantConfigService } from './tenant-config.service';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

@Controller('tenant-config')
export class TenantConfigController {
  constructor(private readonly tenantConfigService: TenantConfigService) {}

  @RequirePermission('user:manage')
  @Get()
  getConfig(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId?: string,
  ) {
    return this.tenantConfigService.getConfig(req.user, companyId);
  }

  @RequirePermission('user:manage')
  @Patch()
  upsertConfig(
    @Req() req: RequestWithUser,
    @Body() dto: UpsertTenantConfigDto,
  ) {
    return this.tenantConfigService.upsertConfig(req.user, dto);
  }
}
