import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

type ControlledOptions = {
  adminToken?: string;
};

type ChangeSuperAdminPasswordInput = ControlledOptions & {
  newPassword: string;
};

type RotateSuperAdminInput = ControlledOptions & {
  nextUsername: string;
  nextEmail: string;
  nextName: string;
  nextPassword: string;
  companyId?: string;
};

type EmergencyResetInput = ControlledOptions & {
  fallbackPassword?: string;
};

@Injectable()
export class AdminService {
  private readonly ownerUsername = (
    process.env.SUPER_ADMIN_OWNER_USERNAME || 'sn888xt'
  )
    .trim()
    .toLowerCase();

  constructor(private readonly prisma: PrismaService) {}

  private normalizeUsername(username: string | null | undefined) {
    return (username || '').trim().toLowerCase();
  }

  private assertControlledAccess(adminToken?: string) {
    if (process.env.NODE_ENV !== 'production') {
      return;
    }

    const expected = (process.env.ADMIN_TOKEN || '').trim();
    if (!expected) {
      throw new ForbiddenException('ADMIN_TOKEN is required in production');
    }

    if (!adminToken || adminToken !== expected) {
      throw new ForbiddenException('Invalid ADMIN_TOKEN');
    }
  }

  private async ensureSuperAdminRoleId() {
    const role = await this.prisma.role.findFirst({
      where: { name: 'SUPER_ADMIN', companyId: null },
      select: { id: true },
    });

    if (!role) {
      throw new NotFoundException('SUPER_ADMIN role not found');
    }

    return role.id;
  }

  private async findOwnerUser() {
    const user = await this.prisma.user.findFirst({
      where: { username: this.ownerUsername },
      select: {
        id: true,
        username: true,
        companyId: true,
      },
    });

    if (!user) {
      throw new NotFoundException('SUPER_ADMIN owner account not found');
    }

    return user;
  }

  async changeSuperAdminPassword(input: ChangeSuperAdminPasswordInput) {
    this.assertControlledAccess(input.adminToken);

    const owner = await this.findOwnerUser();
    const hash = await bcrypt.hash(input.newPassword, 10);

    await this.prisma.user.update({
      where: { id: owner.id },
      data: {
        password: hash,
        status: 'ACTIVE',
      },
    });

    return {
      ok: true,
      username: owner.username,
      changed: true,
    };
  }

  async rotateSuperAdmin(input: RotateSuperAdminInput) {
    this.assertControlledAccess(input.adminToken);

    const roleId = await this.ensureSuperAdminRoleId();
    const owner = await this.findOwnerUser();
    const hash = await bcrypt.hash(input.nextPassword, 10);

    const nextUsername = this.normalizeUsername(input.nextUsername);
    if (!nextUsername) {
      throw new ForbiddenException('nextUsername is required');
    }

    if (nextUsername === this.ownerUsername) {
      return this.changeSuperAdminPassword({
        newPassword: input.nextPassword,
        adminToken: input.adminToken,
      });
    }

    const target = await this.prisma.user.upsert({
      where: { username: nextUsername },
      update: {
        email: input.nextEmail,
        name: input.nextName,
        password: hash,
        role: 'SUPER_ADMIN',
        roleId,
        status: 'ACTIVE',
        companyId: input.companyId || owner.companyId || null,
      },
      create: {
        username: nextUsername,
        email: input.nextEmail,
        name: input.nextName,
        password: hash,
        role: 'SUPER_ADMIN',
        roleId,
        status: 'ACTIVE',
        companyId: input.companyId || owner.companyId || null,
      },
      select: {
        id: true,
        username: true,
      },
    });

    await this.prisma.user.update({
      where: { id: owner.id },
      data: {
        role: 'COMPANY_ADMIN',
        roleId: null,
      },
    });

    return {
      ok: true,
      previousOwner: owner.username,
      nextOwner: target.username,
    };
  }

  async emergencyReset(input: EmergencyResetInput = {}) {
    this.assertControlledAccess(input.adminToken);

    const roleId = await this.ensureSuperAdminRoleId();
    const owner = await this.findOwnerUser();
    const fallbackPassword = input.fallbackPassword || '123456';
    const hash = await bcrypt.hash(fallbackPassword, 10);

    await this.prisma.user.update({
      where: { id: owner.id },
      data: {
        password: hash,
        role: 'SUPER_ADMIN',
        roleId,
        status: 'ACTIVE',
      },
    });

    return {
      ok: true,
      username: owner.username,
      reset: true,
    };
  }
}
