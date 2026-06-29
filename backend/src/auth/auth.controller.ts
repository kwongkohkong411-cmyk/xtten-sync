import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { Public } from './public.decorator';
import { SuperAdminGuard } from './super-admin.guard';
import { PermissionInitializeService } from '../commands/seed.command';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly permissionInitialize: PermissionInitializeService,
  ) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /**
   * 初始化权限系统（仅 SuperAdmin 可调用）
   * POST /auth/init-permissions
   */
  @UseGuards(SuperAdminGuard)
  @Post('init-permissions')
  async initPermissions() {
    return this.permissionInitialize.initialize();
  }
}
