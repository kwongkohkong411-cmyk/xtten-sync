import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RosterCreateInput = {
  companyId: string;
  employeeId: string;
  workGroupId: string;
  shiftId: string;
  month: string;
  status?: string;
};

type RosterUpdateInput = {
  companyId?: string;
  employeeId?: string;
  workGroupId?: string;
  shiftId?: string;
  month?: string;
  status?: string;
};

type RosterListQuery = {
  companyId?: string;
  startDate?: string;
  endDate?: string;
  employeeId?: string;
};

@Injectable()
export class RostersService {
  constructor(private prisma: PrismaService) {}

  private toMonthKey(value?: string) {
    if (!value) return undefined;

    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return undefined;
    }

    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    return `${parsed.getFullYear()}-${month}`;
  }

  // =========================
  // GET ALL
  // =========================
  async findAll(query: RosterListQuery = {}) {
    const startMonth = this.toMonthKey(query.startDate);
    const endMonth = this.toMonthKey(query.endDate);

    const where = {
      ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(startMonth || endMonth
        ? {
            month: {
              ...(startMonth ? { gte: startMonth } : {}),
              ...(endMonth ? { lte: endMonth } : {}),
            },
          }
        : {}),
    };

    return this.prisma.roster.findMany({
      where,
      include: {
        company: true,
        workGroup: true,
        shift: true,
        employee: true,
      },
      orderBy: [{ month: 'desc' }, { createdAt: 'desc' }],
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
  // CREATE (FIXED FINAL)
  // =========================
  async create(body: RosterCreateInput) {
    if (!body.companyId) {
      throw new Error('companyId is missing');
    }

    if (!body.employeeId) {
      throw new Error('employeeId is missing');
    }

    if (!body.workGroupId) {
      throw new Error('workGroupId is missing');
    }

    if (!body.shiftId) {
      throw new Error('shiftId is missing');
    }

    return this.prisma.roster.create({
      data: {
        // ✅ MUST use STRING month (NOT date)
        month: body.month, // e.g. "2026-07"

        // ✅ relations MUST use IDs ONLY
        companyId: body.companyId,
        employeeId: body.employeeId,
        workGroupId: body.workGroupId,
        shiftId: body.shiftId,

        status: body.status ?? 'ASSIGNED',
      },
    });
  }

  // =========================
  // UPDATE (FIXED FINAL)
  // =========================
  async update(id: string, body: RosterUpdateInput) {
    await this.findOne(id);

    return this.prisma.roster.update({
      where: { id },
      data: {
        month: body.month ?? undefined,

        companyId: body.companyId ?? undefined,
        employeeId: body.employeeId ?? undefined,
        workGroupId: body.workGroupId ?? undefined,
        shiftId: body.shiftId ?? undefined,

        status: body.status ?? undefined,
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
