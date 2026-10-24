-- AlterTable
ALTER TABLE "llm_usage_events" ADD COLUMN     "analysisId" UUID;

-- CreateTable
CREATE TABLE "spending_analyses" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "periodKey" TEXT NOT NULL,
    "partial" BOOLEAN NOT NULL,
    "requestedByMemberId" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "refMap" JSONB NOT NULL,
    "usageEventId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "spending_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "spending_analyses_familyId_createdAt_idx" ON "spending_analyses"("familyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "spending_analyses_familyId_periodKey_idx" ON "spending_analyses"("familyId", "periodKey");

-- AddForeignKey
ALTER TABLE "llm_usage_events" ADD CONSTRAINT "llm_usage_events_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "spending_analyses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "spending_analyses" ADD CONSTRAINT "spending_analyses_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- US-070 (SDD-023 §5, ADR-013): o autor da análise pertence à mesma família.
ALTER TABLE "spending_analyses" ADD CONSTRAINT "spending_analyses_familyId_requestedByMemberId_fkey" FOREIGN KEY ("familyId", "requestedByMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "spending_analyses" ADD CONSTRAINT spending_analyses_period_chk CHECK ("periodKey" ~ '^\d{4}-(0[1-9]|1[0-2])$');
