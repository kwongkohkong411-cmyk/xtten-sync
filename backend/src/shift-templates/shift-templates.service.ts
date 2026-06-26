import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ShiftTemplatesService {
  constructor(private prisma: PrismaService) {}

  async findAll(companyId: string) {
    return this.prisma.shiftTemplate.findMany({
      where: { companyId },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findOne(id: string) {
    const shift = await this.prisma.shiftTemplate.findUnique({
      where: { id },
      include: {
        company: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
      },
    });

    if (!shift) {
      throw new NotFoundException('Shift template not found');
    }

    return shift;
  }

  async create(body: any) {
    return this.prisma.shiftTemplate.create({
      data: {
        name: body.name,
        code: body.code || null,

        shiftType: body.shiftType, // ✔ 必须

        startTime: body.startTime,
        endTime: body.endTime,

        breakMinutes: Number(body.breakMinutes ?? 60),
        crossDay: body.crossDay ?? false,

        lateAfter: Number(body.lateAfter ?? 10),
        earlyLeave: Number(body.earlyLeave ?? 10),
        overtimeAfter: Number(body.overtimeAfter ?? 0),

        color: body.color || null,
        isActive: body.isActive ?? true,

        companyId: body.companyId,
      },
    });
  }

  async update(id: string, body: any) {
    await this.findOne(id);

    return this.prisma.shiftTemplate.update({
      where: { id },
      data: {
        name: body.name,
        code: body.code || null,

        shiftType: body.shiftType,

        startTime: body.startTime,
        endTime: body.endTime,

        breakMinutes: Number(body.breakMinutes ?? 60),
        crossDay: body.crossDay ?? false,

        lateAfter: Number(body.lateAfter ?? 10),
        earlyLeave: Number(body.earlyLeave ?? 10),
        overtimeAfter: Number(body.overtimeAfter ?? 0),

        color: body.color || null,
        isActive: body.isActive ?? true,

        // ❌ 不允许修改 companyId（关键修复）
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.shiftTemplate.delete({
      where: { id },
    });
  }
}