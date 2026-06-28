-- RBAC key-based permission model migration

ALTER TABLE "Permission"
ADD COLUMN IF NOT EXISTS "key" TEXT,
ADD COLUMN IF NOT EXISTS "desc" TEXT;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Permission'
      AND column_name = 'module'
  )
  AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'Permission'
      AND column_name = 'action'
  ) THEN
    EXECUTE 'UPDATE "Permission" SET "key" = CONCAT("module", '':'', "action") WHERE "key" IS NULL';
  ELSE
    UPDATE "Permission"
    SET "key" = COALESCE("key", "id")
    WHERE "key" IS NULL;
  END IF;
END $$;

ALTER TABLE "Permission"
ALTER COLUMN "key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "Permission_key_key" ON "Permission"("key");

ALTER TABLE "Permission"
DROP COLUMN IF EXISTS "module",
DROP COLUMN IF EXISTS "action",
DROP COLUMN IF EXISTS "label";

ALTER TABLE "RolePermission"
ADD COLUMN IF NOT EXISTS "id" UUID DEFAULT (md5(random()::text || clock_timestamp()::text)::uuid);

ALTER TABLE "RolePermission"
ALTER COLUMN "id" SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'RolePermission_pkey'
      AND table_name = 'RolePermission'
  ) THEN
    ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id");
  END IF;
END $$;

ALTER TABLE "RolePermission"
DROP CONSTRAINT IF EXISTS "RolePermission_roleId_permissionId_pkey";

CREATE UNIQUE INDEX IF NOT EXISTS "RolePermission_roleId_permissionId_key"
ON "RolePermission"("roleId", "permissionId");
