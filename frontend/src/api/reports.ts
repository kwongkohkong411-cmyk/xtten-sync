import client from "./client";

export const getDailyReport = (params: { date: string; companyId?: string }) =>
  client.get("/reports/daily", { params });

export const getDailyDetailReport = (params: {
  date: string;
  companyId?: string;
  status?: "ON_TIME" | "LATE" | "LEAVE" | "HOLIDAY" | "ABSENT" | "MISSING";
  search?: string;
  page?: number;
  pageSize?: number;
  summaryOnly?: boolean;
}) =>
  client.get("/reports/daily/detail", { params });

export const getMonthlyReport = (params: { month: string; companyId?: string }) =>
  client.get("/reports/monthly", { params });

export const downloadDayReport = async (params: { date: string; companyId?: string; format?: "csv" | "xlsx" }) => {
  const res = await client.get("/reports/export/day", {
    params,
    responseType: "blob",
  });
  return res.data as Blob;
};

export const downloadMonthReport = async (params: { month: string; companyId?: string; format?: "csv" | "xlsx" }) => {
  const res = await client.get("/reports/export/month", {
    params,
    responseType: "blob",
  });
  return res.data as Blob;
};
