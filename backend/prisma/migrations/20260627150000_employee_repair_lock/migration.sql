-- CreateTable
CREATE TABLE "EmployeeRepairLock" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "reason" TEXT,
    "lockedUntil" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeRepairLock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeRepairLock_companyId_entityType_entityId_key" ON "EmployeeRepairLock"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "EmployeeRepairLock_lockedUntil_idx" ON "EmployeeRepairLock"("lockedUntil");
