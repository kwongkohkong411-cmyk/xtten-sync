CREATE TABLE IF NOT EXISTS "Holiday" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "country" TEXT NOT NULL,
    "scope" TEXT NOT NULL DEFAULT 'COUNTRY',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Holiday_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Holiday_date_idx" ON "Holiday"("date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Holiday_country_date_idx" ON "Holiday"("country", "date");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Holiday_companyId_date_idx" ON "Holiday"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "Holiday_companyId_country_date_name_key" ON "Holiday"("companyId", "country", "date", "name");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'Holiday_companyId_fkey'
            AND table_name = 'Holiday'
    ) THEN
        ALTER TABLE "Holiday"
        ADD CONSTRAINT "Holiday_companyId_fkey"
        FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
