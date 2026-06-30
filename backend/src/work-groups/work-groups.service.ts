import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type WorkGroupCreateInput = {
  name: string;
  code?: string | null;
  description?: string | null;
  color?: string | null;
  sortOrder?: number;
  isActive?: boolean;
  companyId: string;
  departmentId?: string | null;
};

type WorkGroupUpdateInput = Partial<WorkGroupCreateInput>;

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
        department: {
          select: {
            id: true,
            name: true,
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
        department: {
          select: {
            id: true,
            name: true,
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

  async create(body: WorkGroupCreateInput) {
    return this.prisma.workGroup.create({
      data: {
        name: body.name,
        code: body.code || null,
        description: body.description || null,
        color: body.color || null,
        sortOrder: body.sortOrder ?? 0,
        isActive: body.isActive ?? true,
        companyId: body.companyId,
        departmentId: body.departmentId || null,
      },
    });
  }

  async update(id: string, body: WorkGroupUpdateInput) {
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
        departmentId: body.departmentId || null,
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.workGroup.delete({
      where: { id },
    });
  }

  async getCompanyEmployees(companyId: string) {
    return this.prisma.employee.findMany({
      where: { companyId },
      select: {
        id: true,
        employeeNo: true,
        name: true,
        email: true,
        position: true,
        status: true,
        workGroupId: true,
      },
      orderBy: { name: 'asc' },
    });
  }

  async addMembers(id: string, employeeIds: string[]) {
    const workGroup = await this.findOne(id);
    // Only allow employees from the same company
    await this.prisma.employee.updateMany({
      where: {
        id: { in: employeeIds },
        companyId: workGroup.companyId,
      },
      data: { workGroupId: id },
    });
    return this.findOne(id);
  }

  async removeMember(id: string, employeeId: string) {
    const workGroup = await this.findOne(id);
    await this.prisma.employee.updateMany({
      where: {
        id: employeeId,
        companyId: workGroup.companyId,
        workGroupId: id,
      },
      data: { workGroupId: null },
    });
    return this.findOne(id);
  }
}
