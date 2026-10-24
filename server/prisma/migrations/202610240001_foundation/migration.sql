-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('pending', 'processing', 'completed', 'failed');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" UUID NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dataset" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" VARCHAR(100) NOT NULL DEFAULT '',
    "source" VARCHAR(500) NOT NULL DEFAULT '',
    "currency" CHAR(3) NOT NULL,
    "dateFormat" TEXT NOT NULL DEFAULT 'ISO8601',
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Dataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportJob" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "contentHash" CHAR(64) NOT NULL,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "status" "ImportStatus" NOT NULL DEFAULT 'pending',
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "processedRows" INTEGER NOT NULL DEFAULT 0,
    "acceptedRows" INTEGER NOT NULL DEFAULT 0,
    "rejectedRows" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMPTZ(3),

    CONSTRAINT "ImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RawRecord" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "values" JSONB NOT NULL,
    "validationErrors" JSONB,

    CONSTRAINT "RawRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SalesRecord" (
    "id" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "importJobId" UUID NOT NULL,
    "rawRecordId" UUID NOT NULL,
    "invoiceNumber" TEXT NOT NULL,
    "productCode" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(18,4) NOT NULL,
    "invoiceDate" TIMESTAMPTZ(3) NOT NULL,
    "unitPrice" DECIMAL(18,4) NOT NULL,
    "customerId" TEXT,
    "country" TEXT NOT NULL,
    "isCancellation" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "SalesRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dashboard" (
    "id" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "datasetId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "Dashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DashboardShare" (
    "id" UUID NOT NULL,
    "dashboardId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DashboardShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entityType" VARCHAR(50) NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "Dataset_ownerId_idx" ON "Dataset"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Dataset_id_ownerId_key" ON "Dataset"("id", "ownerId");

-- CreateIndex
CREATE INDEX "ImportJob_datasetId_createdAt_idx" ON "ImportJob"("datasetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_id_datasetId_key" ON "ImportJob"("id", "datasetId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportJob_datasetId_contentHash_key" ON "ImportJob"("datasetId", "contentHash");

-- CreateIndex
CREATE UNIQUE INDEX "RawRecord_importJobId_sourceRow_key" ON "RawRecord"("importJobId", "sourceRow");

-- CreateIndex
CREATE UNIQUE INDEX "RawRecord_id_importJobId_datasetId_key" ON "RawRecord"("id", "importJobId", "datasetId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRecord_rawRecordId_key" ON "SalesRecord"("rawRecordId");

-- CreateIndex
CREATE INDEX "SalesRecord_datasetId_invoiceDate_idx" ON "SalesRecord"("datasetId", "invoiceDate");

-- CreateIndex
CREATE INDEX "SalesRecord_datasetId_country_productCode_idx" ON "SalesRecord"("datasetId", "country", "productCode");

-- CreateIndex
CREATE UNIQUE INDEX "SalesRecord_rawRecordId_importJobId_datasetId_key" ON "SalesRecord"("rawRecordId", "importJobId", "datasetId");

-- CreateIndex
CREATE INDEX "Dashboard_ownerId_idx" ON "Dashboard"("ownerId");

-- CreateIndex
CREATE INDEX "Dashboard_datasetId_idx" ON "Dashboard"("datasetId");

-- CreateIndex
CREATE INDEX "DashboardShare_userId_idx" ON "DashboardShare"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DashboardShare_dashboardId_userId_key" ON "DashboardShare"("dashboardId", "userId");

-- CreateIndex
CREATE INDEX "Activity_createdAt_idx" ON "Activity"("createdAt");

-- CreateIndex
CREATE INDEX "Activity_actorId_idx" ON "Activity"("actorId");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRecord" ADD CONSTRAINT "RawRecord_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RawRecord" ADD CONSTRAINT "RawRecord_importJobId_datasetId_fkey" FOREIGN KEY ("importJobId", "datasetId") REFERENCES "ImportJob"("id", "datasetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "Dataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_importJobId_datasetId_fkey" FOREIGN KEY ("importJobId", "datasetId") REFERENCES "ImportJob"("id", "datasetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_rawRecordId_importJobId_datasetId_fkey" FOREIGN KEY ("rawRecordId", "importJobId", "datasetId") REFERENCES "RawRecord"("id", "importJobId", "datasetId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dashboard" ADD CONSTRAINT "Dashboard_datasetId_ownerId_fkey" FOREIGN KEY ("datasetId", "ownerId") REFERENCES "Dataset"("id", "ownerId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "Dashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DashboardShare" ADD CONSTRAINT "DashboardShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Shared invariants beyond Prisma's schema language.
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_row_counts_check" CHECK (
  "totalRows" >= 0 AND "acceptedRows" >= 0 AND "rejectedRows" >= 0 AND "retryCount" >= 0
  AND "processedRows" = "acceptedRows" + "rejectedRows" AND "processedRows" <= "totalRows"
  AND (status <> 'completed' OR "processedRows" = "totalRows")
);
ALTER TABLE "ImportJob" ADD CONSTRAINT "ImportJob_contentHash_check" CHECK ("contentHash" ~ '^[0-9a-f]{64}$');
ALTER TABLE "RawRecord" ADD CONSTRAINT "RawRecord_sourceRow_check" CHECK ("sourceRow" >= 2);
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_unitPrice_check" CHECK ("unitPrice" >= 0);
ALTER TABLE "SalesRecord" ADD CONSTRAINT "SalesRecord_cancellation_check" CHECK (NOT "isCancellation" OR quantity <= 0);
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_currency_check" CHECK (currency IN ('GBP', 'EUR', 'USD', 'MAD'));
ALTER TABLE "Dataset" ADD CONSTRAINT "Dataset_dateFormat_check" CHECK ("dateFormat" IN ('ISO8601', 'DMY_HM'));
