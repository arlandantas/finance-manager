-- CreateTable
CREATE TABLE "avoidable_dismissals" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "descriptionKey" TEXT,
    "recurringExpenseId" UUID,
    "displayName" TEXT NOT NULL,
    "reason" TEXT,
    "byMemberId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avoidable_dismissals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "avoidable_dismissals_familyId_createdAt_idx" ON "avoidable_dismissals"("familyId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "avoidable_dismissals" ADD CONSTRAINT "avoidable_dismissals_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avoidable_dismissals" ADD CONSTRAINT "avoidable_dismissals_familyId_categoryId_fkey" FOREIGN KEY ("familyId", "categoryId") REFERENCES "categories"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avoidable_dismissals" ADD CONSTRAINT "avoidable_dismissals_familyId_byMemberId_fkey" FOREIGN KEY ("familyId", "byMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avoidable_dismissals" ADD CONSTRAINT "avoidable_dismissals_familyId_recurringExpenseId_fkey" FOREIGN KEY ("familyId", "recurringExpenseId") REFERENCES "recurring_expenses"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- US-071 (SDD-023 §5): chave natural do descarte (idempotência) e limites.
CREATE UNIQUE INDEX avoidable_dismissals_uq ON avoidable_dismissals ("familyId", kind, "categoryId",
  COALESCE("descriptionKey", ''), COALESCE("recurringExpenseId"::text, ''));
ALTER TABLE "avoidable_dismissals" ADD CONSTRAINT avoidable_kind_chk CHECK (kind IN ('RECURRING', 'CATEGORY'));
ALTER TABLE "avoidable_dismissals" ADD CONSTRAINT avoidable_reason_chk CHECK ("reason" IS NULL OR char_length("reason") <= 140);
