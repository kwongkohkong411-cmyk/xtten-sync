-- CreateTable
CREATE TABLE "EmployeeEventProcessingLedger" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "eventLogId" TEXT NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectionVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeEventProcessingLedger_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeEventProcessingLedger_eventLogId_key" ON "EmployeeEventProcessingLedger"("eventLogId");

-- CreateIndex
CREATE INDEX "EmployeeEventProcessingLedger_companyId_entityType_entityId_idx" ON "EmployeeEventProcessingLedger"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "EmployeeEventProcessingLedger_processedAt_idx" ON "EmployeeEventProcessingLedger"("processedAt");
