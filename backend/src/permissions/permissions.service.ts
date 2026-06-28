import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';

type PermissionInput = {
  key?: string;
  module?: string;
  action?: string;
  desc?: string;
};

@Injectable()
export class PermissionsService extends BaseRbacService {
  constructor(prisma: PrismaService, rbacCore: RbacCoreService) {
    super(prisma, rbacCore);
  }

  async findAll(actor?: Actor) {
    await this.resolveActorContext(actor);

    return this.prisma.permission.findMany({
      orderBy: [{ key: 'asc' }],
    });
  }

  async create(body: PermissionInput, actor?: Actor) {
    await this.rbacCore.assertPlatformAdmin(actor);

    const key =
      body?.key ||
      (body?.module && body?.action
        ? `${body.module}:${body.action}`
        : undefined);
    if (!key) {
      throw new BadRequestException('Permission key is required');
    }

    const exists = await this.prisma.permission.findUnique({
      where: { key },
    });

    if (exists) {
      throw new BadRequestException('Permission already exists');
    }

    return this.prisma.permission.create({
      data: {
        key,
        desc: body.desc || key,
      },
    });
  }

  async remove(id: string, actor?: Actor) {
    await this.rbacCore.assertPlatformAdmin(actor);

    return this.prisma.permission.delete({
      where: { id },
    });
  }
}
