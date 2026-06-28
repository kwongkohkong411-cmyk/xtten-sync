import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Actor } from '../auth/rbac-core.service';

type RequestWithUser = {
  user?: Actor;
};

type HolidayQuery = {
  startDate?: string;
  endDate?: string;
  country?: string;
  companyId?: string;
};

type HolidayCreateInput = {
  name?: string;
  country?: string;
  date?: string;
  scope?: string;
  companyId?: string | null;
};

type HolidayUpdateInput = HolidayCreateInput & {
  status?: string;
};

@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  private parseDate(value: string, field: string) {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException(`${field} is invalid`);
    }
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }

  private async resolveUserCompanyId(req: RequestWithUser) {
    if (req?.user?.companyId) return req.user.companyId;

    const employee = await this.prisma.employee.findFirst({
      where: { userId: req?.user?.id },
      select: { companyId: true },
    });

    return employee?.companyId;
  }

  private async canAccessCompany(
    req: RequestWithUser,
    companyId?: string | null,
  ) {
    if (!companyId) return req?.user?.role === 'SUPER_ADMIN';
    if (req?.user?.role === 'SUPER_ADMIN') return true;
    const userCompanyId = await this.resolveUserCompanyId(req);
    return userCompanyId === companyId;
  }

  async findAll(req: RequestWithUser, query: HolidayQuery) {
    const now = new Date();
    const startDate = query.startDate
      ? this.parseDate(query.startDate, 'startDate')
      : new Date(now.getFullYear(), now.getMonth(), 1);
    const endDate = query.endDate
      ? this.parseDate(query.endDate, 'endDate')
      : new Date(now.getFullYear(), now.getMonth() + 1, 0);

    if (endDate.getTime() < startDate.getTime()) {
      throw new BadRequestException(
        'endDate must be greater than or equal to startDate',
      );
    }

    const requestedCompanyId = query.companyId;
    if (
      requestedCompanyId &&
      !(await this.canAccessCompany(req, requestedCompanyId))
    ) {
      throw new UnauthorizedException('Access denied for company');
    }

    const companyScopeId =
      req?.user?.role === 'SUPER_ADMIN'
        ? requestedCompanyId
        : (await this.resolveUserCompanyId(req)) || requestedCompanyId;

    const where: {
      date: { gte: Date; lte: Date };
      status: 'ACTIVE';
      country?: string;
      OR?: Array<{
        companyId: string | null | { in: string[] };
        country?: string | undefined | { in: string[] };
      }>;
    } = {
      date: {
        gte: startDate,
        lte: endDate,
      },
      status: 'ACTIVE',
      ...(query.country ? { country: query.country } : {}),
      ...(companyScopeId
        ? {
            OR: [
              { companyId: companyScopeId },
              { companyId: null, country: query.country || undefined },
              { companyId: null },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.holiday.findMany({
      where,
      orderBy: [{ date: 'asc' }, { createdAt: 'asc' }],
    });

    return rows;
  }

  async create(req: RequestWithUser, body: HolidayCreateInput) {
    const input = body;
    const name = String(input.name || '').trim();
    const country = String(input.country || '').trim();
    if (!name) throw new BadRequestException('name is required');
    if (!country) throw new BadRequestException('country is required');
    if (!input.date) throw new BadRequestException('date is required');

    const date = this.parseDate(input.date, 'date');
    const scope = String(
      input.scope || (input.companyId ? 'COMPANY' : 'COUNTRY'),
    ).toUpperCase();

    let companyId: string | null = input.companyId || null;
    if (scope === 'COMPANY') {
      companyId = companyId || (await this.resolveUserCompanyId(req)) || null;
      if (!companyId) {
        throw new BadRequestException(
          'companyId is required for COMPANY scope',
        );
      }
    } else {
      companyId = null;
    }

    if (!(await this.canAccessCompany(req, companyId))) {
      throw new UnauthorizedException('Access denied for company');
    }

    return this.prisma.holiday.create({
      data: {
        name,
        date,
        country,
        scope,
        status: 'ACTIVE',
        companyId,
      },
    });
  }

  async update(req: RequestWithUser, id: string, body: HolidayUpdateInput) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException('Holiday not found');

    const input = body;

    if (!(await this.canAccessCompany(req, holiday.companyId))) {
      throw new UnauthorizedException('Access denied for company');
    }

    let nextCompanyId = input.companyId ?? holiday.companyId;
    const nextScope = input.scope
      ? String(input.scope).toUpperCase()
      : holiday.scope;
    if (nextScope === 'COUNTRY') {
      nextCompanyId = null;
    }

    if (!(await this.canAccessCompany(req, nextCompanyId))) {
      throw new UnauthorizedException('Access denied for company');
    }

    return this.prisma.holiday.update({
      where: { id },
      data: {
        ...(input.name ? { name: String(input.name).trim() } : {}),
        ...(input.date ? { date: this.parseDate(input.date, 'date') } : {}),
        ...(input.country ? { country: String(input.country).trim() } : {}),
        ...(input.scope ? { scope: nextScope } : {}),
        ...(input.status ? { status: String(input.status).toUpperCase() } : {}),
        companyId: nextCompanyId,
      },
    });
  }

  async remove(req: RequestWithUser, id: string) {
    const holiday = await this.prisma.holiday.findUnique({ where: { id } });
    if (!holiday) throw new NotFoundException('Holiday not found');

    if (!(await this.canAccessCompany(req, holiday.companyId))) {
      throw new UnauthorizedException('Access denied for company');
    }

    await this.prisma.holiday.delete({ where: { id } });
    return { ok: true };
  }
}
