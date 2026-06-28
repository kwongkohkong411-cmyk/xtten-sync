-- CreateTable
CREATE TABLE "EmployeeEventDeadLetter" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "eventLogId" TEXT NOT NULL,
    "payload" JSONB,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "failedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeEventDeadLetter_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeEventDeadLetter_eventLogId_key" ON "EmployeeEventDeadLetter"("eventLogId");

-- CreateIndex
CREATE INDEX "EmployeeEventDeadLetter_companyId_entityType_entityId_idx" ON "EmployeeEventDeadLetter"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "EmployeeEventDeadLetter_failedAt_idx" ON "EmployeeEventDeadLetter"("failedAt");
