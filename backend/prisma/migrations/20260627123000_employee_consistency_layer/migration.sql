-- CreateTable
CREATE TABLE "EmployeeEventQueue" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "eventLogId" TEXT NOT NULL,
    "payload" JSONB,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmployeeEventQueue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Employee360Projection" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "lastEventLogId" TEXT,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Employee360Projection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EmployeeEventQueue_eventLogId_key" ON "EmployeeEventQueue"("eventLogId");

-- CreateIndex
CREATE INDEX "EmployeeEventQueue_status_availableAt_idx" ON "EmployeeEventQueue"("status", "availableAt");

-- CreateIndex
CREATE INDEX "EmployeeEventQueue_companyId_entityType_entityId_idx" ON "EmployeeEventQueue"("companyId", "entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "Employee360Projection_employeeId_key" ON "Employee360Projection"("employeeId");

-- CreateIndex
CREATE INDEX "Employee360Projection_companyId_employeeId_idx" ON "Employee360Projection"("companyId", "employeeId");
