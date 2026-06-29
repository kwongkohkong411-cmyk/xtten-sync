-- CreateTable
CREATE TABLE "LeaveType" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveBalanceSetting" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "days" DECIMAL(5,2) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveBalanceSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaveApprover" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaveApprover_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "LeaveType_companyId_name_key" ON "LeaveType"("companyId", "name");

-- CreateIndex
CREATE INDEX "LeaveType_companyId_active_idx" ON "LeaveType"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveBalanceSetting_companyId_leaveTypeId_period_key" ON "LeaveBalanceSetting"("companyId", "leaveTypeId", "period");

-- CreateIndex
CREATE INDEX "LeaveBalanceSetting_companyId_active_idx" ON "LeaveBalanceSetting"("companyId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "LeaveApprover_companyId_employeeId_key" ON "LeaveApprover"("companyId", "employeeId");

-- CreateIndex
CREATE INDEX "LeaveApprover_companyId_active_idx" ON "LeaveApprover"("companyId", "active");

-- AddForeignKey
ALTER TABLE "LeaveType" ADD CONSTRAINT "LeaveType_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceSetting" ADD CONSTRAINT "LeaveBalanceSetting_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveBalanceSetting" ADD CONSTRAINT "LeaveBalanceSetting_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "LeaveType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprover" ADD CONSTRAINT "LeaveApprover_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeaveApprover" ADD CONSTRAINT "LeaveApprover_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
