# Release Preflight Checklist (Backup -> Migrate -> Verify)

## 0) Scope and freeze
- Confirm target commit/tag: v0.9.0-beta
- Freeze non-release merges during migration window
- Confirm rollback owner and communication channel

## 1) VPS environment preparation
- Create server env file from template:
  - cp backend/.env.production.example backend/.env.production
- Fill required keys:
  - DATABASE_URL
  - JWT_SECRET
  - CF_R2_BUCKET
  - CF_R2_ENDPOINT
  - CF_R2_ACCESS_KEY_ID
  - CF_R2_SECRET_ACCESS_KEY
  - CF_R2_REGION (default auto)
  - CF_R2_PUBLIC_BASE_URL
  - SCREENSHOT_RETENTION_DAYS (default 30)
  - SCREENSHOT_CLEANUP_BATCH_SIZE (default 500)
  - SUPER_ADMIN_OWNER_USERNAME
  - RBAC_ALLOW_AUDIT_SAMPLE_RATE (default 1)

## 2) Backup before migration
- Backup PostgreSQL before any schema change:
  - pg_dump --format=custom --no-owner --no-privileges --dbname "$DATABASE_URL" --file "backup-pre-v0.9.0-beta.dump"
- Verify backup file size > 0 and archive checksum
- Store backup in two locations (VPS local + remote secure storage)

## 3) Migration deployment
- In backend directory, install dependencies if needed:
  - npm ci
- Generate Prisma client:
  - npm run prisma:generate
- Check migration status:
  - npx prisma migrate status
- Apply migrations in production mode:
  - npx prisma migrate deploy
- Re-check status (must show no pending migrations):
  - npx prisma migrate status

## 4) Service restart and health checks
- Restart backend process manager (pm2/systemd/docker)
- Verify API health/basic route:
  - GET /
  - POST /auth/login
- Confirm frontend can call backend without ERR_CONNECTION_REFUSED

## 5) Functional verification (minimum)
- Login with production admin account
- Verify user context exists after login (no repeated "User context not found")
- Open activity live and screenshot pages
- Verify upload path:
  - If R2 configured: new screenshots have R2-backed URL/object key
  - If fallback local: uploads path is writable and served

## 6) RBAC and tenant checks
- Validate admin account belongs to expected company scope
- Confirm x-company-id is present for protected requests
- Spot-check one endpoint each:
  - /activity/live
  - /activity/screenshots
  - /reports/daily

## 7) Post-deploy evidence
- Record:
  - git commit and tag
  - migration deploy output
  - health check output
  - first successful admin login timestamp
- Save all outputs to release note

## 8) Rollback plan (if verification fails)
- Stop traffic or put system in maintenance mode
- Restore DB from backup-pre-v0.9.0-beta.dump
- Redeploy previous known-good image/commit
- Re-run smoke checks on previous version
