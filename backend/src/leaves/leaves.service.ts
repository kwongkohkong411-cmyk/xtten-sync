import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLeaveDto } from './dto/create-leave.dto';
import { UpdateLeaveDto } from './dto/update-leave.dto';
type RequestWithUser = {
  user?: {
    id: string;
    role?: string;
    permissions?: string[];
  };
};

type LeaveUpdateData = {
  startDate?: Date;
  endDate?: Date;
  type?: string;
  reason?: string;
  status?: string;
};

@Injectable()
export class LeavesService {
  constructor(private readonly prisma: PrismaService) {}

  private hasPermission(req: RequestWithUser, permission: string) {
    const perms: string[] = Array.isArray(req?.user?.permissions)
      ? req.user.permissions
      : [];
    if (perms.includes(permission)) return true;
    const alias = permission.includes(':')
      ? permission.replace(':', '.')
      : permission.replace('.', ':');
    return perms.includes(alias);
  }

  private canManageLeave(req: RequestWithUser) {
    return (
      req?.user?.role === 'SUPER_ADMIN' ||
      this.hasPermission(req, 'leave:manage')
    );
  }

  private async getEmployee(userId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { userId },
    });

    if (!employee) {
      throw new UnauthorizedException('Employee not found');
    }

    return employee;
  }

  async create(req: RequestWithUser, createLeaveDto: CreateLeaveDto) {
    const employee = await this.getEmployee(req.user!.id);
    const { startDate, endDate, type, reason } = createLeaveDto;

    if (new Date(endDate) < new Date(startDate)) {
      throw new BadRequestException('End date must be after start date');
    }

    return this.prisma.leave.create({
      data: {
        employeeId: employee.id,
        companyId: employee.companyId,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        type,
        reason,
        status: 'PENDING',
      },
    });
  }

  async findAll(req: RequestWithUser) {
    if (req.user?.role === 'SUPER_ADMIN') {
      return this.prisma.leave.findMany({ orderBy: { startDate: 'desc' } });
    }

    if (this.canManageLeave(req)) {
      const employee = await this.getEmployee(req.user!.id);
      return this.prisma.leave.findMany({
        where: { companyId: employee.companyId },
        orderBy: { startDate: 'desc' },
      });
    }

    const employee = await this.getEmployee(req.user!.id);

    return this.prisma.leave.findMany({
      where: { employeeId: employee.id },
      orderBy: { startDate: 'desc' },
    });
  }

  async findOne(req: RequestWithUser, id: string) {
    const leave = await this.prisma.leave.findUnique({ where: { id } });

    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    if (req.user?.role !== 'SUPER_ADMIN' && !this.canManageLeave(req)) {
      const employee = await this.getEmployee(req.user!.id);
      if (leave.employeeId !== employee.id) {
        throw new UnauthorizedException('Access denied');
      }
    } else if (req.user?.role !== 'SUPER_ADMIN') {
      const managerEmployee = await this.getEmployee(req.user!.id);
      if (leave.companyId !== managerEmployee.companyId) {
        throw new UnauthorizedException('Access denied');
      }
    }

    return leave;
  }

  async update(
    req: RequestWithUser,
    id: string,
    updateLeaveDto: UpdateLeaveDto,
  ) {
    const leave = await this.prisma.leave.findUnique({ where: { id } });

    if (!leave) {
      throw new NotFoundException('Leave request not found');
    }

    const canManage = this.canManageLeave(req);

    if (req.user?.role !== 'SUPER_ADMIN' && !canManage) {
      const employee = await this.getEmployee(req.user!.id);
      if (leave.employeeId !== employee.id) {
        throw new UnauthorizedException('Access denied');
      }

      if (updateLeaveDto.status && updateLeaveDto.status !== leave.status) {
        throw new UnauthorizedException(
          'Only manager/HR can update leave status',
        );
      }
    }

    if (canManage && req.user?.role !== 'SUPER_ADMIN') {
      const managerEmployee = await this.getEmployee(req.user!.id);
      if (leave.companyId !== managerEmployee.companyId) {
        throw new UnauthorizedException('Access denied');
      }
    }

    const data: LeaveUpdateData = {};
    if (updateLeaveDto.startDate)
      data.startDate = new Date(updateLeaveDto.startDate);
    if (updateLeaveDto.endDate) data.endDate = new Date(updateLeaveDto.endDate);
    if (updateLeaveDto.type) data.type = updateLeaveDto.type;
    if (updateLeaveDto.reason) data.reason = updateLeaveDto.reason;
    if (updateLeaveDto.status) data.status = updateLeaveDto.status;

    return this.prisma.leave.update({
      where: { id },
      data,
    });
  }
}
