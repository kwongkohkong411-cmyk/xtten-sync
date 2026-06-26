import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RostersService {
  constructor(private prisma: PrismaService) {}

  // =========================
  // GET ALL (SaaS safe)
  // =========================
  async findAll(companyId?: string) {
    return this.prisma.roster.findMany({
      where: companyId ? { companyId } : undefined,
      include: {
        company: {
          select: {
            id: true,
            name: true,
            code: true,
          },
        },
        workGroup: {
          select: {
            id: true,
            name: true,
            code: true,
            color: true,
          },
        },
        shift: {
          select: {
            id: true,
            name: true,
            code: true,
            startTime: true,
            endTime: true,
            crossDay: true,
            color: true,
            breakMinutes: true,
          },
        },
        employee: {
          select: {
            id: true,
            name: true,
            employeeNo: true,
            position: true,
          },
        },
      },
      orderBy: [
        { month: 'desc' },
        { createdAt: 'desc' },
      ],
    });
  }

  // =========================
  // GET ONE
  // =========================
  async findOne(id: string) {
    const roster = await this.prisma.roster.findUnique({
      where: { id },
      include: {
        company: true,
        workGroup: true,
        shift: true,
        employee: true,
      },
    });

    if (!roster) {
      throw new NotFoundException('Roster not found');
    }

    return roster;
  }

  // =========================
  // CREATE (FIXED + SAFE)
  // =========================
  async create(body: any) {
    return this.prisma.roster.create({
      data: {
        date: new Date(body.date),   // ❗必须
        month: body.month,

        companyId: body.companyId,

        employeeId: body.employeeId, // ❗必须
        workGroupId: body.workGroupId,
        shiftId: body.shiftId,

        status: body.status ?? 'ASSIGNED',
      },
    });
  }

  // =========================
  // UPDATE
  // =========================
  async update(id: string, body: any) {
    await this.findOne(id);

    return this.prisma.roster.update({
      where: { id },
      data: {
        date: body.date ? new Date(body.date) : undefined,
        month: body.month,

        companyId: body.companyId,
        employeeId: body.employeeId,
        workGroupId: body.workGroupId,
        shiftId: body.shiftId,

        status: body.status,
      },
    });
  }

  // =========================
  // DELETE
  // =========================
  async remove(id: string) {
    await this.findOne(id);

    return this.prisma.roster.delete({
      where: { id },
    });
  }
}