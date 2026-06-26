import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RolesService {
  constructor(private prisma: PrismaService) {}

  async init() {
    const roles = [
      { name: 'SUPER_ADMIN', description: 'Full platform access', isSystem: true },
      { name: 'COMPANY_ADMIN', description: 'Manage one company', isSystem: true },
      { name: 'HR', description: 'Manage employees and attendance', isSystem: true },
      { name: 'MANAGER', description: 'Department manager', isSystem: true },
      { name: 'TEAM_LEADER', description: 'Team leader', isSystem: true },
      { name: 'FINANCE', description: 'Finance management', isSystem: true },
      { name: 'EMPLOYEE', description: 'Basic employee', isSystem: true },
    ];

    for (const role of roles) {
      await this.prisma.role.upsert({
        where: { name: role.name },
        update: role,
        create: role,
      });
    }

    return { message: 'Default roles initialized' };
  }

  findAll() {
    return this.prisma.role.findMany({
      include: {
        users: true,
        permissions: {
          include: {
            permission: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
  }

  create(body: any) {
    return this.prisma.role.create({
      data: {
        name: body.name,
        description: body.description,
        isSystem: false,
      },
    });
  }

  update(id: string, body: any) {
    return this.prisma.role.update({
      where: { id },
      data: {
        name: body.name,
        description: body.description,
      },
    });
  }

  async remove(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
    });

    if (!role) {
      throw new BadRequestException('Role not found');
    }

    if (role.isSystem) {
      throw new BadRequestException('System role cannot be deleted');
    }

    return this.prisma.role.delete({
      where: { id },
    });
  }
}