import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type ShiftTemplateCreateInput = {
  companyId: string;
  name: string;
  code?: string | null;
  shiftType?: string;
  startTime: string;
  endTime: string;
  breakMinutes?: number;
  lateAfter?: number;
  earlyLeave?: number;
  overtimeAfter?: number;
  crossDay?: boolean;
  color?: string;
  isActive?: boolean;
};

type ShiftTemplateUpdateInput = Partial<ShiftTemplateCreateInput>;

@Injectable()
export class ShiftTemplatesService {
  constructor(private prisma: PrismaService) {}

  async create(dto: ShiftTemplateCreateInput) {
    if (!dto.companyId) {
      throw new BadRequestException('companyId is required');
    }

    if (!dto.name) {
      throw new BadRequestException('name is required');
    }

    return this.prisma.shiftTemplate.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        code: dto.code,

        shiftType: dto.shiftType ?? 'NORMAL',

        startTime: dto.startTime,
        endTime: dto.endTime,

        breakMinutes: dto.breakMinutes ?? 60,
        lateAfter: dto.lateAfter ?? 10,
        earlyLeave: dto.earlyLeave ?? 10,
        overtimeAfter: dto.overtimeAfter ?? 0,

        crossDay: dto.crossDay ?? false,
        color: dto.color ?? '#722ed1',
        isActive: dto.isActive ?? true,
      },
    });
  }

  async update(id: string, dto: ShiftTemplateUpdateInput) {
    return this.prisma.shiftTemplate.update({
      where: { id },
      data: {
        ...dto,
      },
    });
  }

  async findAll() {
    return this.prisma.shiftTemplate.findMany({
      include: {
        company: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async remove(id: string) {
    return this.prisma.shiftTemplate.delete({
      where: { id },
    });
  }
}
