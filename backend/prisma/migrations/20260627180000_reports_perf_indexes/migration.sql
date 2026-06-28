-- Reports performance indexes for high-volume EVENT scans
CREATE INDEX IF NOT EXISTS "TenantAuditLog_company_scope_entity_action_createdAt_idx"
ON "TenantAuditLog" ("companyId", "scope", "entityType", "action", "createdAt");

CREATE INDEX IF NOT EXISTS "TenantAuditLog_scope_entity_createdAt_idx"
ON "TenantAuditLog" ("scope", "entityType", "createdAt");
