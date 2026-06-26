import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { PrismaModule } from './prisma/prisma.module';
import { CompaniesModule } from './companies/companies.module';
import { DepartmentsModule } from './departments/departments.module';
import { EmployeesModule } from './employees/employees.module';
import { RolesModule } from './roles/roles.module';
import { PermissionsModule } from './permissions/permissions.module';
import { WorkGroupsModule } from './work-groups/work-groups.module';
import { ShiftTemplatesModule } from './shift-templates/shift-templates.module';
import { RostersModule } from './rosters/rosters.module';
import { AttendanceModule } from './attendance/attendance.module';

@Module({
  imports: [AuthModule, UsersModule, PrismaModule, CompaniesModule, DepartmentsModule, EmployeesModule, RolesModule, PermissionsModule, WorkGroupsModule, ShiftTemplatesModule, RostersModule, AttendanceModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
