import client from "./client";

export const getWorkGroups = () =>
  client.get("/work-groups");

export const getWorkGroup = (id: string) =>
  client.get(`/work-groups/${id}`);

export const createWorkGroup = (data: any) =>
  client.post("/work-groups", data);

export const updateWorkGroup = (id: string, data: any) =>
  client.patch(`/work-groups/${id}`, data);

export const deleteWorkGroup = (id: string) =>
  client.delete(`/work-groups/${id}`);

export const getWorkGroupAvailableEmployees = (id: string) =>
  client.get(`/work-groups/${id}/available-employees`);

export const addWorkGroupMembers = (id: string, employeeIds: string[]) =>
  client.post(`/work-groups/${id}/members`, { employeeIds });

export const removeWorkGroupMember = (id: string, employeeId: string) =>
  client.delete(`/work-groups/${id}/members/${employeeId}`);