-- AlterTable
ALTER TABLE "Employee"
ADD COLUMN "hiredAt" TIMESTAMP(3),
ADD COLUMN "terminatedAt" TIMESTAMP(3),
ADD COLUMN "terminationReason" TEXT;
