import client from "./client";

export const getEmployees = () =>
  client.get("/employees");

export const getEmployeeById = (id: string) =>
  client.get(`/employees/${id}`);

export const getEmployeeOverview = (id: string) =>
  client.get(`/employees/${id}/overview`);

export const getEmployee360 = (
  id: string,
  params?: {
    includeAttendance?: boolean;
    includeActivity?: boolean;
    includeDepartmentHistory?: boolean;
    includeLifecycle?: boolean;
    includeTimeline?: boolean;
    attendancePage?: number;
    attendancePageSize?: number;
    activityPage?: number;
    activityPageSize?: number;
    departmentHistoryPage?: number;
    departmentHistoryPageSize?: number;
    timelinePage?: number;
    timelinePageSize?: number;
  },
) => client.get(`/employees/${id}/360`, { params });

export const updateEmployeeLifecycle = (
  id: string,
  data: {
    status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED' | 'LEFT';
    hiredAt?: string | null;
    terminatedAt?: string | null;
    terminationReason?: string | null;
    roleId?: string;
  },
) => client.patch(`/employees/${id}/lifecycle`, data);

export const createEmployee = (data: any) =>
  client.post("/employees", data);

export const updateEmployee = (
  id: string,
  data: any
) =>
  client.patch(`/employees/${id}`, data);

export const deleteEmployee = (
  id: string
) =>
  client.delete(`/employees/${id}`);