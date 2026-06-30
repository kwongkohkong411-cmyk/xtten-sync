-- Add lateMinutes and earlyLeaveMinutes to Attendance table
-- These fields store the calculated late/early-leave duration in minutes
-- directly on each attendance record, so Reports can read them without
-- reprocessing audit-log events.

ALTER TABLE "Attendance"
  ADD COLUMN IF NOT EXISTS "lateMinutes"       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "earlyLeaveMinutes" INTEGER NOT NULL DEFAULT 0;
