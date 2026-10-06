-- AlterTable
ALTER TABLE "planned_expenses" ADD COLUMN     "isException" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "occurrenceMonth" DATE,
ADD COLUMN     "paymentAccountId" UUID,
ADD COLUMN     "seriesId" UUID;

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amountInCents" BIGINT NOT NULL,
    "categoryId" UUID NOT NULL,
    "responsibleMemberId" UUID NOT NULL,
    "isSharedExpense" BOOLEAN NOT NULL DEFAULT false,
    "paymentAccountId" UUID,
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

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_expenses_familyId_endedAt_generatedThroughMonth_idx" ON "recurring_expenses"("familyId", "endedAt", "generatedThroughMonth");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_expenses_familyId_id_key" ON "recurring_expenses"("familyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "planned_expenses_familyId_seriesId_occurrenceMonth_key" ON "planned_expenses"("familyId", "seriesId", "occurrenceMonth");

-- AddForeignKey
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_familyId_seriesId_fkey" FOREIGN KEY ("familyId", "seriesId") REFERENCES "recurring_expenses"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_familyId_paymentAccountId_fkey" FOREIGN KEY ("familyId", "paymentAccountId") REFERENCES "bank_accounts"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_familyId_categoryId_fkey" FOREIGN KEY ("familyId", "categoryId") REFERENCES "categories"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_familyId_responsibleMemberId_fkey" FOREIGN KEY ("familyId", "responsibleMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_familyId_authorMemberId_fkey" FOREIGN KEY ("familyId", "authorMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_familyId_paymentAccountId_fkey" FOREIGN KEY ("familyId", "paymentAccountId") REFERENCES "bank_accounts"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- SQL cru (SDD-019 §3.1)
ALTER TABLE "recurring_expenses" ADD CONSTRAINT recurring_amount_chk CHECK ("amountInCents" > 0);
ALTER TABLE "recurring_expenses" ADD CONSTRAINT recurring_day_chk CHECK ("dayOfMonth" BETWEEN 1 AND 31);
ALTER TABLE "recurring_expenses" ADD CONSTRAINT recurring_months_chk CHECK (
  EXTRACT(DAY FROM "startMonth") = 1
  AND ("endMonth" IS NULL OR (EXTRACT(DAY FROM "endMonth") = 1 AND "endMonth" >= "startMonth")));
ALTER TABLE "recurring_expenses" ADD CONSTRAINT recurring_ended_chk CHECK (
  ("endedAt" IS NULL) = ("endedByMemberId" IS NULL));
ALTER TABLE "planned_expenses" ADD CONSTRAINT planned_series_chk CHECK (
  ("seriesId" IS NULL) = ("occurrenceMonth" IS NULL));
