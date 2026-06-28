# RBAC Enforcement Coverage

Generated: 2026-06-28T12:57:27.589Z

## Coverage Summary

- Service files: 34
- Services extending BaseRbacService: 11
- Protected endpoints (@RequirePermission): 106
- Permission decision audit call sites: 4
- Direct tenantAuditLog.create call sites: 7
- Direct RBAC core call sites: 24

## Lockdown Violations

- None

## Direct Audit Writers

- src/activity/activity.service.ts: 1
- src/auth/rbac-core.service.ts: 1
- src/companies/companies.service.ts: 3
- src/events/event-log.service.ts: 1
- src/tenant-config/tenant-config.service.ts: 1

## Direct Core Call Sites

- src/auth/base-rbac.service.ts: 5
- src/companies/companies.service.ts: 3
- src/departments/departments.service.ts: 5
- src/employees/employees.service.ts: 1
- src/reports/reports.service.ts: 1
- src/tenant-audit-logs/tenant-audit-logs.service.ts: 2
- src/tenant-config/tenant-config.service.ts: 1
- src/users/users.service.ts: 6

## Non-Base RBAC Services

- None
