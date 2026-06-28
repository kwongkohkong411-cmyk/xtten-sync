import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  // =========================
  // REGISTER
  // =========================
  async register(dto: RegisterDto) {
    const hash = await bcrypt.hash(dto.password, 10);

    const company = await this.prisma.company.findUnique({
      where: { id: dto.companyId },
    });

    if (!company) {
      throw new UnauthorizedException('Company not found');
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        username: dto.username,
        name: dto.name,
        password: hash,
        role: 'EMPLOYEE',
        companyId: dto.companyId,
      },
    });

    const employee = await this.prisma.employee.create({
      data: {
        name: dto.name,
        userId: user.id,
        companyId: dto.companyId,
        departmentId: dto.departmentId || null,
      },
    });

    return {
      userId: user.id,
      employeeId: employee.id,
    };
  }

  // =========================
  // LOGIN（企业级统一）
  // =========================
  async login(dto: LoginDto) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ email: dto.account }, { username: dto.account }],
      },
      include: {
        roleRelation: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException('Account not found');
    }

    const valid = await bcrypt.compare(dto.password, user.password);

    if (!valid) {
      throw new UnauthorizedException('Wrong password');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { userId: user.id },
    });

    const roleName = user.roleRelation?.name || user.role;

    const token = this.jwt.sign({
      sub: user.id,
      role: roleName,
      email: user.email,
      companyId: user.companyId,
    });

    const permissions =
      user.roleRelation?.permissions?.map((rp) => rp.permission.key) || [];

    return {
      access_token: token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: roleName,
        roleId: user.roleId,
        roleRelation: user.roleRelation
          ? { id: user.roleRelation.id, name: user.roleRelation.name }
          : undefined,
        permissions,
        companyId: user.companyId,
        employeeId: employee?.id ?? null,
      },
    };
  }
}
