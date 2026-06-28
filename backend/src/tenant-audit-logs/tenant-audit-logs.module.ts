import { Module } from '@nestjs/common';
import { TenantAuditLogsController } from './tenant-audit-logs.controller';
import { TenantAuditLogsService } from './tenant-audit-logs.service';

@Module({
  controllers: [TenantAuditLogsController],
  providers: [TenantAuditLogsService],
})
export class TenantAuditLogsModule {}
