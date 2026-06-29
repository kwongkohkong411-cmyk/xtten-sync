-- Guard against duplicate user-role relations in legacy join tables.
-- Current Prisma model uses User.roleId, but older deployments may still have user_roles/UserRole.

DO $$
BEGIN
  IF to_regclass('public.user_roles') IS NOT NULL THEN
    -- Remove duplicated rows before enforcing uniqueness.
    DELETE FROM public.user_roles ur
    USING (
      SELECT ctid
      FROM (
        SELECT
          ctid,
          ROW_NUMBER() OVER (
            PARTITION BY "userId", "roleId"
            ORDER BY ctid
          ) AS rn
        FROM public.user_roles
      ) ranked
      WHERE ranked.rn > 1
    ) duplicates
    WHERE ur.ctid = duplicates.ctid;

    CREATE UNIQUE INDEX IF NOT EXISTS "user_roles_userId_roleId_key"
      ON public.user_roles ("userId", "roleId");
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public."UserRole"') IS NOT NULL THEN
    -- Remove duplicated rows before enforcing uniqueness.
    DELETE FROM public."UserRole" ur
    USING (
      SELECT ctid
      FROM (
        SELECT
          ctid,
          ROW_NUMBER() OVER (
            PARTITION BY "userId", "roleId"
            ORDER BY ctid
          ) AS rn
        FROM public."UserRole"
      ) ranked
      WHERE ranked.rn > 1
    ) duplicates
    WHERE ur.ctid = duplicates.ctid;

    CREATE UNIQUE INDEX IF NOT EXISTS "UserRole_userId_roleId_key"
      ON public."UserRole" ("userId", "roleId");
  END IF;
END $$;
