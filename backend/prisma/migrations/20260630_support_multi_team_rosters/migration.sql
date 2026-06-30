-- Support multi-team roster assignments
-- Change: employeeId becomes optional (nullable) to allow team-only rosters
-- Change: unique constraint from [employeeId, month] to [employeeId, month, workGroupId]

-- Drop existing unique constraint if it exists
DO $$ 
BEGIN
  ALTER TABLE "Roster" DROP CONSTRAINT IF EXISTS "Roster_employeeId_month_key";
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

-- Make employeeId nullable
ALTER TABLE "Roster" ALTER COLUMN "employeeId" DROP NOT NULL;

-- Add new unique constraint that allows multiple teams per employee per month
DO $$ 
BEGIN
  ALTER TABLE "Roster" ADD CONSTRAINT "Roster_employeeId_month_workGroupId_key" UNIQUE ("employeeId", "month", "workGroupId");
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;
