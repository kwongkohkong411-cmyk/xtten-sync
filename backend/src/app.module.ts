import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';

import { AuthModule } from './auth/auth.module';
import { RbacCoreModule } from './auth/rbac-core.module';
import { PrismaModule } from './prisma/prisma.module';

import { UsersModule } from './users/users.module';
import { CompaniesModule } from './companies/companies.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeesModule } from './employees/employees.module';

import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';

import { WorkGroupsModule } from './work-groups/work-groups.module';
import { ShiftTemplatesModule } from './shift-templates/shift-templates.module';
import { RostersModule } from './rosters/rosters.module';
import { AttendanceModule } from './attendance/attendance.module';
import { LeavesModule } from './leaves/leaves.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { PermissionGuard } from './auth/permission.guard';
import { TenantConfigModule } from './tenant-config/tenant-config.module';
import { TenantAuditLogsModule } from './tenant-audit-logs/tenant-audit-logs.module';
import { EventsModule } from './events/events.module';
import { ReportsModule } from './reports/reports.module';
import { ActivityModule } from './activity/activity.module';
import { HolidaysModule } from './holidays/holidays.module';
import { AgentModule } from './agent/agent.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    // =====================
    // CORE（必须最先）
    // =====================
    RbacCoreModule,
    AuthModule,
    PrismaModule,

    // =====================
    // BUSINESS MODULES
    // =====================
    UsersModule,
    CompaniesModule,
    DepartmentsModule,
    EmployeesModule,

    RolesModule,
    PermissionsModule,

    WorkGroupsModule,
    ShiftTemplatesModule,
    RostersModule,
    AttendanceModule,
    LeavesModule,
    TenantConfigModule,
    TenantAuditLogsModule,
    EventsModule,
    ReportsModule,
    ActivityModule,
    HolidaysModule,
    AgentModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionGuard,
    },
  ],
})
export class AppModule {}
