import { Module } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';

import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { JwtStrategy } from './jwt.strategy';
import { PermissionGuard } from './permission.guard';
import { SuperAdminGuard } from './super-admin.guard';
import { PermissionSeederService } from './permission-seeder.service';
import { PermissionInitializeService } from '../commands/seed.command';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }), // ⭐ 就是这里
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'secret',
      signOptions: { expiresIn: '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    PermissionGuard,
    SuperAdminGuard,
    PermissionSeederService,
    PermissionInitializeService,
  ],
  exports: [
    AuthService,
    PermissionGuard,
    SuperAdminGuard,
    PermissionSeederService,
    PermissionInitializeService,
  ],
})
export class AuthModule {}
