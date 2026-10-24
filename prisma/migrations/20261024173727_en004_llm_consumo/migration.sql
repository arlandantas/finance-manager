-- CreateEnum
CREATE TYPE "LlmPurpose" AS ENUM ('SPENDING_ANALYSIS', 'INVOICE_IMPORT');

-- CreateEnum
CREATE TYPE "LlmUsageStatus" AS ENUM ('RESERVED', 'SETTLED', 'FAILED', 'ABANDONED');

-- AlterTable
ALTER TABLE "families" ADD COLUMN     "aiMonthlyCapCents" INTEGER;

-- CreateTable
CREATE TABLE "llm_budget_months" (
    "familyId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "spentMicroBrl" BIGINT NOT NULL DEFAULT 0,
    "reservedMicroBrl" BIGINT NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "llm_budget_months_pkey" PRIMARY KEY ("familyId","month")
);

-- CreateTable
CREATE TABLE "llm_usage_events" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "month" TEXT NOT NULL,
    "purpose" "LlmPurpose" NOT NULL,
    "memberId" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "status" "LlmUsageStatus" NOT NULL,
    "outcome" TEXT,
    "reservedMicroBrl" BIGINT NOT NULL,
    "costMicroBrl" BIGINT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "latencyMs" INTEGER,
    "attempts" INTEGER,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMPTZ(3),

    CONSTRAINT "llm_usage_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "llm_usage_events_familyId_month_status_idx" ON "llm_usage_events"("familyId", "month", "status");

-- AddForeignKey
ALTER TABLE "llm_budget_months" ADD CONSTRAINT "llm_budget_months_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_usage_events" ADD CONSTRAINT "llm_usage_events_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EN-004 (SDD-021 §5): invariantes do contador e do registro de consumo.
ALTER TABLE "llm_budget_months" ADD CONSTRAINT llm_budget_nonneg_chk
  CHECK ("spentMicroBrl" >= 0 AND "reservedMicroBrl" >= 0);
ALTER TABLE "llm_usage_events" ADD CONSTRAINT llm_usage_settled_chk
  CHECK (("status" = 'RESERVED' AND "settledAt" IS NULL) OR ("status" <> 'RESERVED' AND "settledAt" IS NOT NULL));
ALTER TABLE "families" ADD CONSTRAINT families_ai_cap_chk
  CHECK ("aiMonthlyCapCents" IS NULL OR "aiMonthlyCapCents" >= 0);
