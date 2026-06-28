import client from "./client";

export const getAttendanceEvents = (params?: {
  startDate?: string;
  endDate?: string;
  employeeId?: string;
}) => client.get("/attendance/events", { params });

export const checkIn = () => client.post("/attendance/check-in", {});

export const breakOut = () => client.post("/attendance/break-out", {});

export const breakIn = () => client.post("/attendance/break-in", {});

export const checkOut = (attendanceId: string) =>
  client.post(`/attendance/check-out/${attendanceId}`);