import client from "./client";

export const getRosters = (params?: {
  companyId?: string;
  startDate?: string;
  endDate?: string;
  employeeId?: string;
}) => client.get("/rosters", { params });

export const getRoster = (id: string) => client.get(`/rosters/${id}`);

export const createRoster = (data: Record<string, unknown>) =>
  client.post("/rosters", data);

export const updateRoster = (id: string, data: Record<string, unknown>) =>
  client.patch(`/rosters/${id}`, data);

export const deleteRoster = (id: string) =>
  client.delete(`/rosters/${id}`);