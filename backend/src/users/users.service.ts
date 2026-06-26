import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.user.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        company: true,
      },
    });
  }

  async create(data: any) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        password: hashedPassword,
        name: data.name,
        role: data.role || 'EMPLOYEE',
        status: data.status || 'ACTIVE',
        companyId: data.companyId || null,
      },
      include: {
        company: true,
      },
    });
  }

  async update(id: string, data: any) {
    const updateData: any = {
      email: data.email,
      username: data.username,
      name: data.name,
      role: data.role,
      status: data.status,
      companyId: data.companyId || null,
    };

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, 10);
    }

    return this.prisma.user.update({
      where: { id },
      data: updateData,
      include: {
        company: true,
      },
    });
  }

  remove(id: string) {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}