import client from "./client";

export type AttendanceTodayResponse = {
  id: string;
  employeeId: string;
  checkIn: string | null;
  checkOut: string | null;
  breakStart: string | null;
  breakEnd: string | null;
  date: string;
};

export const getAttendanceEvents = (params?: {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
}) => client.get("/attendance/events", { params });

export const getAttendanceToday = () => client.get<AttendanceTodayResponse | null>("/attendance/today");

export const checkIn = () => client.post("/attendance/check-in", {});

export const breakOut = () => client.post("/attendance/break-out", {});

export const breakIn = () => client.post("/attendance/break-in", {});

export const checkOut = (attendanceId: string) =>
  client.post(`/attendance/check-out/${attendanceId}`);