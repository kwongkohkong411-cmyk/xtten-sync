import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { BaseRbacService } from '../auth/base-rbac.service';
import { Actor, RbacCoreService } from '../auth/rbac-core.service';

@Injectable()
export class DepartmentsService extends BaseRbacService {
  constructor(prisma: PrismaService, rbacCore: RbacCoreService) {
    super(prisma, rbacCore);
  }

  private async getScopedCompanyId(actor?: Actor) {
    return this.rbacCore.resolveCompanyScope(actor);
  }

  private async assertDepartmentInScope(id: string, actor?: Actor) {
    const dept = await this.prisma.department.findUnique({
      where: { id },
      select: { companyId: true },
    });

    if (!dept) {
      throw new NotFoundException('Department not found');
    }

    await this.rbacCore.assertTenantAccess(actor, dept.companyId);
  }

  async findAll(actor?: Actor) {
    const where = await this.rbacCore.applyScopeToQuery(actor, {});

    return this.prisma.department.findMany({
      where,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        workGroups: {
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            _count: {
              select: {
                employees: true,
              },
            },
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        _count: {
          select: {
            employees: true,
            workGroups: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string, actor?: Actor) {
    await this.assertDepartmentInScope(id, actor);

    return this.prisma.department.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        manager: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        workGroups: {
          select: {
            id: true,
            name: true,
            code: true,
            isActive: true,
            _count: {
              select: {
                employees: true,
              },
            },
          },
          orderBy: {
            sortOrder: 'asc',
          },
        },
        employees: {
          select: {
            id: true,
            name: true,
            email: true,
            status: true,
          },
        },
      },
    });
  }

  async create(dto: CreateDepartmentDto, actor?: Actor) {
    const { companyId } = await this.rbacCore.assertCompanyScope(
      actor,
      dto.companyId,
    );
    dto.companyId = companyId as string;

    if (dto.managerId) {
      const manager = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
        select: { companyId: true },
      });

      if (!manager || manager.companyId !== dto.companyId) {
        throw new ForbiddenException(
          'Department manager must belong to same company',
        );
      }
    }

    return this.prisma.department.create({
      data: {
        name: dto.name,
        code: dto.code,
        companyId: dto.companyId,
        managerId: dto.managerId || null,
        status: dto.status || 'ACTIVE',
      },
    });
  }

  async update(id: string, dto: UpdateDepartmentDto, actor?: Actor) {
    await this.assertDepartmentInScope(id, actor);

    if (dto.companyId) {
      const { companyId } = await this.rbacCore.assertCompanyScope(
        actor,
        dto.companyId,
      );
      dto.companyId = companyId;
    }

    if (dto.managerId) {
      const current = await this.prisma.department.findUnique({
        where: { id },
        select: { companyId: true },
      });

      if (!current) {
        throw new NotFoundException('Department not found');
      }

      const targetCompanyId = dto.companyId || current.companyId;
      const manager = await this.prisma.user.findUnique({
        where: { id: dto.managerId },
        select: { companyId: true },
      });

      if (!manager || manager.companyId !== targetCompanyId) {
        throw new ForbiddenException(
          'Department manager must belong to same company',
        );
      }
    }

    return this.prisma.department.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string, actor?: Actor) {
    await this.assertDepartmentInScope(id, actor);

    return this.prisma.department.delete({
      where: { id },
    });
  }
}
