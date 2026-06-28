import client from "./client";

export const getHolidays = (params?: {
  startDate?: string;
  endDate?: string;
  country?: string;
  companyId?: string;
}) => client.get("/holidays", { params });

export const createHoliday = (data: {
  name: string;
  date: string;
  country: string;
  scope: "COUNTRY" | "COMPANY";
  companyId?: string;
}) => client.post("/holidays", data);

export const updateHoliday = (
  id: string,
  data: Partial<{
    name: string;
    date: string;
    country: string;
    scope: "COUNTRY" | "COMPANY";
    status: "ACTIVE" | "INACTIVE";
    companyId?: string;
  }>,
) => client.patch(`/holidays/${id}`, data);

export const deleteHoliday = (id: string) => client.delete(`/holidays/${id}`);
