import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkGroupsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    return this.prisma.workGroup.findMany({
      include: {
        company: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        _count: {
          select: {
            employees: true,
          },
        },
      },
      orderBy: [
        {
          sortOrder: 'asc',
        },
        {
          createdAt: 'desc',
        },
      ],
    });
  }

  async findOne(id: string) {
    const workGroup = await this.prisma.workGroup.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        employees: {
          select: {
            id: true,
            employeeNo: true,
            name: true,
            email: true,
            position: true,
            status: true,
          },
        },
      },
    });

    if (!workGroup) {
      throw new NotFoundException('Work group not found');
    }

    return workGroup;
  }

  async create(body: any) {
    return this.prisma.workGroup.create({
      data: {
        name: body.name,
        code: body.code || null,
        description: body.description || null,
        color: body.color || null,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
        companyId: body.companyId,
      },
    });
  }

  async update(id: string, body: any) {
    await this.findOne(id);

    return this.prisma.workGroup.update({
      where: { id },
      data: {
        name: body.name,
        code: body.code || null,
        description: body.description || null,
        color: body.color || null,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
        companyId: body.companyId,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.workGroup.delete({
      where: { id },
    });
  }
}