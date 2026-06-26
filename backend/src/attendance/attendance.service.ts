import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AttendanceService {
  constructor(private prisma: PrismaService) {}

  // =========================
  // CHECK IN（上班打卡）
  // =========================
  async checkIn(body: any) {
    const now = new Date();

    // 防止重复打卡
    const existing = await this.prisma.attendance.findFirst({
      where: {
        employeeId: body.employeeId,
        date: new Date(body.date),
      },
    });

    if (existing && existing.checkIn) {
      throw new Error('Already checked in');
    }

    return this.prisma.attendance.create({
      data: {
        employeeId: body.employeeId,
        companyId: body.companyId,
        departmentId: body.departmentId || null,

        date: new Date(body.date),

        checkIn: now,
        status: 'PRESENT',
      },
    });
  }

  // =========================
  // CHECK OUT（下班打卡）
  // =========================
  async checkOut(attendanceId: string) {
    const record = await this.prisma.attendance.findUnique({
      where: { id: attendanceId },
    });

    if (!record) {
      throw new NotFoundException('Attendance not found');
    }

    if (!record.checkIn) {
      throw new Error('Not checked in yet');
    }

    const now = new Date();

    const hours =
      (now.getTime() - record.checkIn.getTime()) / (1000 * 60 * 60);

    return this.prisma.attendance.update({
      where: { id: attendanceId },
      data: {
        checkOut: now,
        totalHours: Number(hours.toFixed(2)),
      },
    });
  }

  // =========================
  // GET EMPLOYEE ATTENDANCE
  // =========================
  async findByEmployee(employeeId: string) {
    return this.prisma.attendance.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // =========================
  // TODAY RECORD
  // =========================
  async today(employeeId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return this.prisma.attendance.findFirst({
      where: {
        employeeId,
        date: {
          gte: today,
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}