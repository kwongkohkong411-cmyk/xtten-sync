import client from './client';

export const getTenantAuditLogs = (params?: {
  companyId?: string;
  limit?: number;
  scope?: string;
}) => client.get('/tenant-audit-logs', { params });
