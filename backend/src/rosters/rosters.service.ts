import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

type RosterCreateInput = {
  companyId: string;
  employeeId?: string;
  workGroupIds: string[]; // Support multiple teams
  shiftId: string;
  month: string;
  status?: string;
};

type RosterUpdateInput = {
  companyId?: string;
  employeeId?: string;
  workGroupIds?: string[]; // Support multiple teams
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
  // CREATE - Support multiple workGroupIds
  // =========================
  async create(body: RosterCreateInput) {
    if (!body.companyId) {
      throw new Error('companyId is missing');
    }

    if (!body.workGroupIds || body.workGroupIds.length === 0) {
      throw new Error('workGroupIds is missing or empty');
    }

    if (!body.shiftId) {
      throw new Error('shiftId is missing');
    }

    // Create a roster record for each workGroupId
    const createdRosters = await Promise.all(
      body.workGroupIds.map((workGroupId) =>
        this.prisma.roster.create({
          data: {
            month: body.month,
            companyId: body.companyId,
            ...(body.employeeId ? { employeeId: body.employeeId } : {}),
            workGroupId,
            shiftId: body.shiftId,
            status: body.status ?? 'ASSIGNED',
          },
          include: {
            company: true,
            workGroup: true,
            shift: true,
            employee: true,
          },
        })
      )
    );

    // Return array of created rosters
    return createdRosters;
  }

  // =========================
  // UPDATE - Support multiple workGroupIds
  // =========================
  async update(id: string, body: RosterUpdateInput) {
    const existing = await this.findOne(id);

    // If workGroupIds is provided, delete current roster and recreate with new workGroupIds
    if (body.workGroupIds !== undefined) {
      // First, find all rosters for this employee/month combination
      const rosterFamily = await this.prisma.roster.findMany({
        where: {
          employeeId: existing.employeeId,
          month: body.month ?? existing.month,
        },
      });

      // Delete all rosters in this family
      await Promise.all(
        rosterFamily.map((roster) =>
          this.prisma.roster.delete({ where: { id: roster.id } })
        )
      );

      // Create new rosters with updated workGroupIds
      const createdRosters = await Promise.all(
        body.workGroupIds.map((workGroupId) =>
          this.prisma.roster.create({
            data: {
              month: body.month ?? existing.month,
              companyId: body.companyId ?? existing.companyId,
              employeeId: body.employeeId ?? existing.employeeId,
              workGroupId,
              shiftId: body.shiftId ?? existing.shiftId,
              status: body.status ?? existing.status,
            },
            include: {
              company: true,
              workGroup: true,
              shift: true,
              employee: true,
            },
          })
        )
      );

      return createdRosters;
    }

    // If workGroupIds is not provided, update the existing roster
    return this.prisma.roster.update({
      where: { id },
      data: {
        month: body.month ?? undefined,
        companyId: body.companyId ?? undefined,
        employeeId: body.employeeId ?? undefined,
        shiftId: body.shiftId ?? undefined,
        status: body.status ?? undefined,
      },
      include: {
        company: true,
        workGroup: true,
        shift: true,
        employee: true,
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
