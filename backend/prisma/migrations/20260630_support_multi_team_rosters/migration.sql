-- Support multi-team roster assignments
-- Change: employeeId becomes optional (nullable) to allow team-only rosters
-- Change: unique constraint from [employeeId, month] to [employeeId, month, workGroupId]

-- Drop existing unique constraint
ALTER TABLE "Roster" DROP CONSTRAINT "Roster_employeeId_month_key";

-- Make employeeId nullable
ALTER TABLE "Roster" ALTER COLUMN "employeeId" DROP NOT NULL;

-- Add new unique constraint that allows multiple teams per employee per month
ALTER TABLE "Roster" ADD CONSTRAINT "Roster_employeeId_month_workGroupId_key" UNIQUE ("employeeId", "month", "workGroupId");
