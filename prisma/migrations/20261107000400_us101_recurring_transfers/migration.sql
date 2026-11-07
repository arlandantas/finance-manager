-- US-101 (ADR-037 §5): série de transferência prevista. Expand puro (tabela nova + colunas nulas/default em planned_transfers).
-- Reversão (antes de haver dados):
--   ALTER TABLE "planned_transfers" DROP COLUMN "seriesId", DROP COLUMN "occurrenceMonth", DROP COLUMN "isException"; DROP TABLE "recurring_transfers";
-- AlterTable
ALTER TABLE "planned_transfers" ADD COLUMN     "isException" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "occurrenceMonth" DATE,
ADD COLUMN     "seriesId" UUID;

-- CreateTable
CREATE TABLE "recurring_transfers" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "fromAccountId" UUID NOT NULL,
    "toAccountId" UUID NOT NULL,
    "amountInCents" BIGINT NOT NULL,
    "description" TEXT,
    "dayOfMonth" INTEGER NOT NULL,
    "startMonth" DATE NOT NULL,
    "endMonth" DATE,
    "generatedThroughMonth" DATE,
    "endedAt" TIMESTAMPTZ(3),
    "endedByMemberId" UUID,
    "authorMemberId" UUID NOT NULL,
    "updatedByMemberId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "recurring_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_transfers_familyId_endedAt_generatedThroughMonth_idx" ON "recurring_transfers"("familyId", "endedAt", "generatedThroughMonth");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_transfers_familyId_id_key" ON "recurring_transfers"("familyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "planned_transfers_familyId_seriesId_occurrenceMonth_key" ON "planned_transfers"("familyId", "seriesId", "occurrenceMonth");

-- AddForeignKey
ALTER TABLE "planned_transfers" ADD CONSTRAINT "planned_transfers_familyId_seriesId_fkey" FOREIGN KEY ("familyId", "seriesId") REFERENCES "recurring_transfers"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transfers" ADD CONSTRAINT "recurring_transfers_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transfers" ADD CONSTRAINT "recurring_transfers_familyId_fromAccountId_fkey" FOREIGN KEY ("familyId", "fromAccountId") REFERENCES "bank_accounts"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transfers" ADD CONSTRAINT "recurring_transfers_familyId_toAccountId_fkey" FOREIGN KEY ("familyId", "toAccountId") REFERENCES "bank_accounts"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_transfers" ADD CONSTRAINT "recurring_transfers_familyId_authorMemberId_fkey" FOREIGN KEY ("familyId", "authorMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- SQL cru (ADR-037 §5)
ALTER TABLE "recurring_transfers" ADD CONSTRAINT recurring_transfer_amount_chk CHECK ("amountInCents" > 0);
ALTER TABLE "recurring_transfers" ADD CONSTRAINT recurring_transfer_accounts_chk CHECK ("fromAccountId" <> "toAccountId");
ALTER TABLE "recurring_transfers" ADD CONSTRAINT recurring_transfer_day_chk CHECK ("dayOfMonth" BETWEEN 1 AND 31);
ALTER TABLE "recurring_transfers" ADD CONSTRAINT recurring_transfer_months_chk CHECK (
  EXTRACT(DAY FROM "startMonth") = 1
  AND ("endMonth" IS NULL OR (EXTRACT(DAY FROM "endMonth") = 1 AND "endMonth" >= "startMonth")));
ALTER TABLE "recurring_transfers" ADD CONSTRAINT recurring_transfer_ended_chk CHECK (
  ("endedAt" IS NULL) = ("endedByMemberId" IS NULL));
ALTER TABLE "planned_transfers" ADD CONSTRAINT planned_transfer_series_chk CHECK (
  ("seriesId" IS NULL) = ("occurrenceMonth" IS NULL));
