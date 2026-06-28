import { Controller, Get, Query, Req } from '@nestjs/common';
import { RequirePermission } from '../auth/permissions.decorator';
import { TenantAuditLogsService } from './tenant-audit-logs.service';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

@Controller('tenant-audit-logs')
export class TenantAuditLogsController {
  constructor(
    private readonly tenantAuditLogsService: TenantAuditLogsService,
  ) {}

  @RequirePermission('user:manage')
  @Get()
  findAll(
    @Req() req: RequestWithUser,
    @Query('companyId') companyId?: string,
    @Query('limit') limit?: string,
    @Query('scope') scope?: string,
  ) {
    return this.tenantAuditLogsService.findAll(
      req.user,
      companyId,
      limit ? Number(limit) : 50,
      scope,
    );
  }
}
