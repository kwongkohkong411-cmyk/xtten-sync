/*
  Warnings:

  - The primary key for the `RolePermission` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - A unique constraint covering the columns `[name,companyId]` on the table `Role` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[employeeId,month]` on the table `Roster` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "Role_name_key";

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "autoRenewal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "employeesLimit" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "subscriptionStatus" TEXT NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ALTER COLUMN "plan" SET DEFAULT 'TRIAL';

-- AlterTable
ALTER TABLE "Role" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "isCustom" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RolePermission" DROP CONSTRAINT "RolePermission_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE TEXT,
ADD CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id");

-- CreateTable
CREATE TABLE "ActivityScreenshot" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "teamId" TEXT,
    "deviceId" TEXT,
    "agentVersion" TEXT,
    "captureSource" TEXT NOT NULL DEFAULT 'SCREENSHOT',
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "appName" TEXT,
    "windowTitle" TEXT,
    "keyboardCount" INTEGER NOT NULL DEFAULT 0,
    "mouseCount" INTEGER NOT NULL DEFAULT 0,
    "idleSec" INTEGER NOT NULL DEFAULT 0,
    "hash" TEXT,
    "sha256" TEXT,
    "perceptualHash" TEXT,
    "objectKey" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL DEFAULT 'LOCAL',
    "url" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "width" INTEGER,
    "height" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ActivityScreenshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Plan" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayName" TEXT,
    "maxEmployees" INTEGER,
    "maxTeams" INTEGER,
    "maxCompanies" INTEGER,
    "screenshotRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "features" JSONB NOT NULL DEFAULT '{}',
    "priceMonthly" DECIMAL(10,2),
    "priceYearly" DECIMAL(10,2),
    "trialDays" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "billingCycle" TEXT,
    "currentPeriodStart" TIMESTAMP(3),
    "currentPeriodEnd" TIMESTAMP(3),
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "seatCount" INTEGER,
    "usedSeatCount" INTEGER NOT NULL DEFAULT 0,
    "autoRenewal" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USDT',
    "billingPeriodStart" TIMESTAMP(3),
    "billingPeriodEnd" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "paymentMethod" TEXT,
    "walletAddress" TEXT,
    "paidAt" TIMESTAMP(3),
    "paymentTxHash" TEXT,
    "nextRenewalDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionHistory" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "fromPlanId" TEXT,
    "eventType" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterDetail" (
    "id" TEXT NOT NULL,
    "rosterId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "shiftTemplateId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ASSIGNED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RosterDetail_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyFeatureAccess" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "hasExport" BOOLEAN NOT NULL DEFAULT false,
    "hasApi" BOOLEAN NOT NULL DEFAULT false,
    "hasSso" BOOLEAN NOT NULL DEFAULT false,
    "hasAuditLog" BOOLEAN NOT NULL DEFAULT false,
    "hasAdvancedReport" BOOLEAN NOT NULL DEFAULT false,
    "hasWebhook" BOOLEAN NOT NULL DEFAULT false,
    "hasDeviceManagement" BOOLEAN NOT NULL DEFAULT false,
    "hasAutoUpdatePolicy" BOOLEAN NOT NULL DEFAULT false,
    "hasMultiTenant" BOOLEAN NOT NULL DEFAULT false,
    "hasLdapAd" BOOLEAN NOT NULL DEFAULT false,
    "hasIpWhitelist" BOOLEAN NOT NULL DEFAULT false,
    "hasMfa" BOOLEAN NOT NULL DEFAULT false,
    "hasCustomBranding" BOOLEAN NOT NULL DEFAULT false,
    "hasCustomDomain" BOOLEAN NOT NULL DEFAULT false,
    "screenshotRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "expirationStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "remindedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyFeatureAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ActivityScreenshot_companyId_capturedAt_idx" ON "ActivityScreenshot"("companyId", "capturedAt");

-- CreateIndex
CREATE INDEX "ActivityScreenshot_companyId_employeeId_capturedAt_idx" ON "ActivityScreenshot"("companyId", "employeeId", "capturedAt");

-- CreateIndex
CREATE INDEX "ActivityScreenshot_companyId_deviceId_capturedAt_idx" ON "ActivityScreenshot"("companyId", "deviceId", "capturedAt");

-- CreateIndex
CREATE INDEX "ActivityScreenshot_companyId_captureSource_capturedAt_idx" ON "ActivityScreenshot"("companyId", "captureSource", "capturedAt");

-- CreateIndex
CREATE INDEX "ActivityScreenshot_employeeId_capturedAt_idx" ON "ActivityScreenshot"("employeeId", "capturedAt");

-- CreateIndex
CREATE INDEX "ActivityScreenshot_capturedAt_idx" ON "ActivityScreenshot"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Plan_name_key" ON "Plan"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_companyId_key" ON "Subscription"("companyId");

-- CreateIndex
CREATE INDEX "Subscription_status_idx" ON "Subscription"("status");

-- CreateIndex
CREATE INDEX "Subscription_currentPeriodEnd_idx" ON "Subscription"("currentPeriodEnd");

-- CreateIndex
CREATE INDEX "Invoice_companyId_status_idx" ON "Invoice"("companyId", "status");

-- CreateIndex
CREATE INDEX "Invoice_billingPeriodStart_billingPeriodEnd_idx" ON "Invoice"("billingPeriodStart", "billingPeriodEnd");

-- CreateIndex
CREATE INDEX "Invoice_status_idx" ON "Invoice"("status");

-- CreateIndex
CREATE INDEX "SubscriptionHistory_subscriptionId_createdAt_idx" ON "SubscriptionHistory"("subscriptionId", "createdAt");

-- CreateIndex
CREATE INDEX "RosterDetail_companyId_date_idx" ON "RosterDetail"("companyId", "date");

-- CreateIndex
CREATE INDEX "RosterDetail_date_shiftTemplateId_idx" ON "RosterDetail"("date", "shiftTemplateId");

-- CreateIndex
CREATE UNIQUE INDEX "RosterDetail_rosterId_date_key" ON "RosterDetail"("rosterId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyFeatureAccess_companyId_key" ON "CompanyFeatureAccess"("companyId");

-- CreateIndex
CREATE INDEX "Company_subscriptionStatus_idx" ON "Company"("subscriptionStatus");

-- CreateIndex
CREATE INDEX "Role_companyId_idx" ON "Role"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_companyId_key" ON "Role"("name", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "Roster_employeeId_month_key" ON "Roster"("employeeId", "month");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_planId_fkey" FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubscriptionHistory" ADD CONSTRAINT "SubscriptionHistory_fromPlanId_fkey" FOREIGN KEY ("fromPlanId") REFERENCES "Plan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterDetail" ADD CONSTRAINT "RosterDetail_rosterId_fkey" FOREIGN KEY ("rosterId") REFERENCES "Roster"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterDetail" ADD CONSTRAINT "RosterDetail_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterDetail" ADD CONSTRAINT "RosterDetail_shiftTemplateId_fkey" FOREIGN KEY ("shiftTemplateId") REFERENCES "ShiftTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyFeatureAccess" ADD CONSTRAINT "CompanyFeatureAccess_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "TenantAuditLog_company_scope_entity_action_createdAt_idx" RENAME TO "TenantAuditLog_companyId_scope_entityType_action_createdAt_idx";

-- RenameIndex
ALTER INDEX "TenantAuditLog_scope_entity_createdAt_idx" RENAME TO "TenantAuditLog_scope_entityType_createdAt_idx";
