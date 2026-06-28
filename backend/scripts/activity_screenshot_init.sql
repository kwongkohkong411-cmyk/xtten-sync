CREATE TABLE IF NOT EXISTS "ActivityScreenshot" (
  "id" TEXT PRIMARY KEY,
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
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "ActivityScreenshot" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "ActivityScreenshot" ADD COLUMN IF NOT EXISTS "deviceId" TEXT;
ALTER TABLE "ActivityScreenshot" ADD COLUMN IF NOT EXISTS "agentVersion" TEXT;
ALTER TABLE "ActivityScreenshot" ADD COLUMN IF NOT EXISTS "captureSource" TEXT NOT NULL DEFAULT 'SCREENSHOT';
ALTER TABLE "ActivityScreenshot" ADD COLUMN IF NOT EXISTS "sha256" TEXT;
ALTER TABLE "ActivityScreenshot" ADD COLUMN IF NOT EXISTS "perceptualHash" TEXT;

CREATE INDEX IF NOT EXISTS "ActivityScreenshot_companyId_capturedAt_idx" ON "ActivityScreenshot" ("companyId", "capturedAt");
CREATE INDEX IF NOT EXISTS "ActivityScreenshot_companyId_employeeId_capturedAt_idx" ON "ActivityScreenshot" ("companyId", "employeeId", "capturedAt");
CREATE INDEX IF NOT EXISTS "ActivityScreenshot_companyId_deviceId_capturedAt_idx" ON "ActivityScreenshot" ("companyId", "deviceId", "capturedAt");
CREATE INDEX IF NOT EXISTS "ActivityScreenshot_companyId_captureSource_capturedAt_idx" ON "ActivityScreenshot" ("companyId", "captureSource", "capturedAt");
CREATE INDEX IF NOT EXISTS "ActivityScreenshot_employeeId_capturedAt_idx" ON "ActivityScreenshot" ("employeeId", "capturedAt");
CREATE INDEX IF NOT EXISTS "ActivityScreenshot_capturedAt_idx" ON "ActivityScreenshot" ("capturedAt");
