import client from "./client";

export const getControlPlaneDashboard = (params?: { companyId?: string; limit?: number }) =>
  client.get("/events/control-plane", { params });

export const replayDlqEvent = (eventLogId: string) =>
  client.patch(`/events/dlq/${eventLogId}/replay`);

export const getGovernancePolicy = (params?: { companyId?: string }) =>
  client.get("/events/control-plane/policy", { params });

export const setGlobalGovernancePolicy = (patch: Record<string, unknown>) =>
  client.patch("/events/control-plane/policy/global", { patch });

export const setCompanyGovernancePolicy = (companyId: string, patch: Record<string, unknown>) =>
  client.patch("/events/control-plane/policy/company", { companyId, patch });

export const clearCompanyGovernancePolicy = (companyId: string) =>
  client.post("/events/control-plane/policy/company/clear", { companyId });

export const getDryRunState = () => client.get("/events/control-plane/dry-run");

export const setDryRunState = (enabled: boolean, reason?: string) =>
  client.patch("/events/control-plane/dry-run", { enabled, reason });

export const simulateGovernanceDecision = (payload: {
  companyId?: string;
  metrics?: Record<string, unknown>;
  policyOverride?: Record<string, unknown>;
  previousDecision?: Record<string, unknown>;
}) => client.post("/events/control-plane/simulate", payload);

export const replayGovernanceDecisionTimeline = (payload?: {
  companyId?: string;
  limit?: number;
  policyOverride?: Record<string, unknown>;
}) => client.post("/events/control-plane/replay", payload || {});