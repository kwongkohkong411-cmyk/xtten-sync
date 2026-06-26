import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.employee.findMany({
      orderBy: {
        createdAt: 'desc',
      },
      include: {
        company: true,
        department: true,
      },
    });
  }

  create(data: any) {
    return this.prisma.employee.create({
      data: {
        employeeNo: data.employeeNo,
        name: data.name,
        email: data.email,
        phone: data.phone,
        position: data.position,
        status: data.status || 'ACTIVE',
        companyId: data.companyId,
        departmentId: data.departmentId || null,
      },
      include: {
        company: true,
        department: true,
      },
    });
  }

  update(id: string, data: any) {
    return this.prisma.employee.update({
      where: { id },
      data: {
        employeeNo: data.employeeNo,
        name: data.name,
        email: data.email,
        phone: data.phone,
        position: data.position,
        status: data.status,
        companyId: data.companyId,
        departmentId: data.departmentId || null,
      },
      include: {
        company: true,
        department: true,
      },
    });
  }

  remove(id: string) {
    return this.prisma.employee.delete({
      where: { id },
    });
  }
}