import client from "./client";

export type ActivityViewType =
  | "live"
  | "timeline"
  | "screenshots"
  | "app-usage"
  | "website-tracking"
  | "input-stats";

export const getDailySessions = (params: {
  date?: string;
  companyId?: string;
  employeeId?: string;
}) => client.get("/activity/sessions", { params });

export const getProductivitySummary = (params: {
  date?: string;
  companyId?: string;
  employeeId?: string;
}) => client.get("/activity/productivity", { params });

export const getLiveActivity = (params: { date?: string; companyId?: string; limit?: number }) =>
  client.get("/activity/live", { params });

export const getAppUsage = (params: { date?: string; companyId?: string }) =>
  client.get("/activity/app-usage", { params });

export const getWebsiteTracking = (params: { date?: string; companyId?: string }) =>
  client.get("/activity/website-tracking", { params });

export const getScreenshots = (params: { date?: string; companyId?: string; limit?: number; cursor?: string }) =>
  client.get("/activity/screenshots", { params });

export const getInputStats = (params: { date?: string; companyId?: string }) =>
  client.get("/activity/input-stats", { params });
