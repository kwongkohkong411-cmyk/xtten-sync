import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveTypeDto } from './dto/create-leave-type.dto';
import { UpdateLeaveTypeDto } from './dto/update-leave-type.dto';
import { CreateLeaveBalanceSettingDto } from './dto/create-leave-balance-setting.dto';
import { UpdateLeaveBalanceSettingDto } from './dto/update-leave-balance-setting.dto';
import { CreateLeaveApproverDto } from './dto/create-leave-approver.dto';
import { UpdateLeaveApproverDto } from './dto/update-leave-approver.dto';

type RequestWithUser = {
  user?: {
    id: string;
    role?: string;
    companyId?: string | null;
  };
};

@Injectable()
export class LeaveSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async getEmployee(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
    });

    if (!employee) {
      throw new UnauthorizedException('Employee not found');
    }

    return employee;
  }

  private async resolveCompanyId(req: RequestWithUser, companyId?: string) {
    const user = req.user;
    if (!user?.id) {
      throw new UnauthorizedException('Unauthorized');
    }

    if (user.role === 'SUPER_ADMIN') {
      if (companyId) return companyId;
      if (user.companyId) return user.companyId;
      throw new BadRequestException('companyId is required for SUPER_ADMIN');
    }

    if (user.companyId) return user.companyId;

    const employee = await this.getEmployee(user.id);
    return employee.companyId;
  }

  async getLeaveTypes(req: RequestWithUser, companyId?: string) {
    const targetCompanyId = await this.resolveCompanyId(req, companyId);

    return this.prisma.leaveType.findMany({
      where: { companyId: targetCompanyId },
      orderBy: [{ active: 'desc' }, { name: 'asc' }],
    });
  }

  async createLeaveType(req: RequestWithUser, dto: CreateLeaveTypeDto) {
    const companyId = await this.resolveCompanyId(req, dto.companyId);

    return this.prisma.leaveType.create({
      data: {
        companyId,
        name: dto.name.trim(),
        category: dto.category,
        active: dto.active ?? true,
      },
    });
  }

  async updateLeaveType(req: RequestWithUser, id: string, dto: UpdateLeaveTypeDto) {
    const found = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Leave type not found');
    }

    const companyId = await this.resolveCompanyId(req, found.companyId);
    if (companyId !== found.companyId) {
      throw new UnauthorizedException('Access denied');
    }

    return this.prisma.leaveType.update({
      where: { id },
      data: {
        ...(dto.name ? { name: dto.name.trim() } : {}),
        ...(dto.category ? { category: dto.category } : {}),
        ...(typeof dto.active === 'boolean' ? { active: dto.active } : {}),
      },
    });
  }

  async deleteLeaveType(req: RequestWithUser, id: string) {
    const found = await this.prisma.leaveType.findUnique({ where: { id } });
    if (!found) {
      throw new NotFoundException('Leave type not found');
    }

    const companyId = await this.resolveCompanyId(req, found.companyId);
    if (companyId !== found.companyId) {
      throw new UnauthorizedException('Access denied');
    }

    return this.prisma.leaveType.delete({ where: { id } });
  }

  async getBalanceSettings(req: RequestWithUser, companyId?: string) {
    const targetCompanyId = await this.resolveCompanyId(req, companyId);

    return this.prisma.leaveBalanceSetting.findMany({
      where: { companyId: targetCompanyId },
      include: {
        leaveType: true,
      },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createBalanceSetting(req: RequestWithUser, dto: CreateLeaveBalanceSettingDto) {
    const companyId = await this.resolveCompanyId(req, dto.companyId);

    const leaveType = await this.prisma.leaveType.findUnique({
      where: { id: dto.leaveTypeId },
    });

    if (!leaveType || leaveType.companyId !== companyId) {
      throw new BadRequestException('Invalid leaveTypeId for current company');
    }

    return this.prisma.leaveBalanceSetting.create({
      data: {
        companyId,
        leaveTypeId: dto.leaveTypeId,
        period: dto.period,
        days: dto.days,
        active: dto.active ?? true,
      },
      include: {
        leaveType: true,
      },
    });
  }

  async updateBalanceSetting(req: RequestWithUser, id: string, dto: UpdateLeaveBalanceSettingDto) {
    const found = await this.prisma.leaveBalanceSetting.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException('Leave balance setting not found');
    }

    const companyId = await this.resolveCompanyId(req, found.companyId);
    if (companyId !== found.companyId) {
      throw new UnauthorizedException('Access denied');
    }

    if (dto.leaveTypeId) {
      const leaveType = await this.prisma.leaveType.findUnique({
        where: { id: dto.leaveTypeId },
      });
      if (!leaveType || leaveType.companyId !== companyId) {
        throw new BadRequestException('Invalid leaveTypeId for current company');
      }
    }

    return this.prisma.leaveBalanceSetting.update({
      where: { id },
      data: {
        ...(dto.leaveTypeId ? { leaveTypeId: dto.leaveTypeId } : {}),
        ...(dto.period ? { period: dto.period } : {}),
        ...(typeof dto.days === 'number' ? { days: dto.days } : {}),
        ...(typeof dto.active === 'boolean' ? { active: dto.active } : {}),
      },
      include: {
        leaveType: true,
      },
    });
  }

  async deleteBalanceSetting(req: RequestWithUser, id: string) {
    const found = await this.prisma.leaveBalanceSetting.findUnique({
      where: { id },
    });

    if (!found) {
      throw new NotFoundException('Leave balance setting not found');
    }

    const companyId = await this.resolveCompanyId(req, found.companyId);
    if (companyId !== found.companyId) {
      throw new UnauthorizedException('Access denied');
    }

    return this.prisma.leaveBalanceSetting.delete({ where: { id } });
  }

  async getApprovers(req: RequestWithUser, companyId?: string) {
    const targetCompanyId = await this.resolveCompanyId(req, companyId);

    return this.prisma.leaveApprover.findMany({
      where: { companyId: targetCompanyId },
      include: {
        employee: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
      orderBy: [{ active: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createApprover(req: RequestWithUser, dto: CreateLeaveApproverDto) {
    const companyId = await this.resolveCompanyId(req, dto.companyId);

    const employee = await this.prisma.employee.findUnique({
      where: { id: dto.employeeId },
    });

    if (!employee || employee.companyId !== companyId) {
      throw new BadRequestException('Invalid employeeId for current company');
    }

    return this.prisma.leaveApprover.create({
      data: {
        companyId,
        employeeId: dto.employeeId,
        active: dto.active ?? true,
      },
      include: {
        employee: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });
  }

  async updateApprover(req: RequestWithUser, id: string, dto: UpdateLeaveApproverDto) {
    const found = await this.prisma.leaveApprover.findUnique({ where: { id } });

    if (!found) {
      throw new NotFoundException('Leave approver not found');
    }

    const companyId = await this.resolveCompanyId(req, found.companyId);
    if (companyId !== found.companyId) {
      throw new UnauthorizedException('Access denied');
    }

    if (dto.employeeId) {
      const employee = await this.prisma.employee.findUnique({
        where: { id: dto.employeeId },
      });
      if (!employee || employee.companyId !== companyId) {
        throw new BadRequestException('Invalid employeeId for current company');
      }
    }

    return this.prisma.leaveApprover.update({
      where: { id },
      data: {
        ...(dto.employeeId ? { employeeId: dto.employeeId } : {}),
        ...(typeof dto.active === 'boolean' ? { active: dto.active } : {}),
      },
      include: {
        employee: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
              },
            },
          },
        },
      },
    });
  }

  async deleteApprover(req: RequestWithUser, id: string) {
    const found = await this.prisma.leaveApprover.findUnique({ where: { id } });

    if (!found) {
      throw new NotFoundException('Leave approver not found');
    }

    const companyId = await this.resolveCompanyId(req, found.companyId);
    if (companyId !== found.companyId) {
      throw new UnauthorizedException('Access denied');
    }

    return this.prisma.leaveApprover.delete({ where: { id } });
  }
}
