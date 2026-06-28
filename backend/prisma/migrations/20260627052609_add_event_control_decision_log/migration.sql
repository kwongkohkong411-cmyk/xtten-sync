-- CreateTable
CREATE TABLE "EventControlDecisionLog" (
    "id" TEXT NOT NULL,
    "decisionKey" TEXT NOT NULL,
    "decisionText" TEXT NOT NULL,
    "reason" JSONB,
    "impact" JSONB,
    "metrics" JSONB,
    "stable" BOOLEAN NOT NULL DEFAULT true,
    "stableForMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventControlDecisionLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventControlDecisionLog_createdAt_idx" ON "EventControlDecisionLog"("createdAt");

-- CreateIndex
CREATE INDEX "EventControlDecisionLog_decisionKey_idx" ON "EventControlDecisionLog"("decisionKey");
