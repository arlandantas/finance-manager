-- CreateEnum
CREATE TYPE "PlannedExpenseStatus" AS ENUM ('PREVISTO', 'PAGO');

-- CreateTable
CREATE TABLE "planned_expenses" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "amountInCents" BIGINT NOT NULL,
    "dueOn" DATE NOT NULL,
    "categoryId" UUID NOT NULL,
    "responsibleMemberId" UUID NOT NULL,
    "isSharedExpense" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "status" "PlannedExpenseStatus" NOT NULL DEFAULT 'PREVISTO',
    "paidTransactionId" UUID,
    "authorMemberId" UUID NOT NULL,
    "updatedByMemberId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedByMemberId" UUID,

    CONSTRAINT "planned_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "planned_expenses_paidTransactionId_key" ON "planned_expenses"("paidTransactionId");

-- CreateIndex
CREATE INDEX "planned_expenses_familyId_status_dueOn_idx" ON "planned_expenses"("familyId", "status", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "planned_expenses_familyId_id_key" ON "planned_expenses"("familyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "planned_expenses_familyId_paidTransactionId_key" ON "planned_expenses"("familyId", "paidTransactionId");

-- AddForeignKey
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_familyId_categoryId_fkey" FOREIGN KEY ("familyId", "categoryId") REFERENCES "categories"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_familyId_responsibleMemberId_fkey" FOREIGN KEY ("familyId", "responsibleMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_familyId_authorMemberId_fkey" FOREIGN KEY ("familyId", "authorMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_expenses" ADD CONSTRAINT "planned_expenses_familyId_paidTransactionId_fkey" FOREIGN KEY ("familyId", "paidTransactionId") REFERENCES "transactions"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL cru (modelo-de-dados.md §7.3)
ALTER TABLE "planned_expenses" ADD CONSTRAINT planned_amount_chk CHECK ("amountInCents" > 0);
ALTER TABLE "planned_expenses" ADD CONSTRAINT planned_status_paid_chk CHECK (("status" = 'PAGO') = ("paidTransactionId" IS NOT NULL));
ALTER TABLE "planned_expenses" ADD CONSTRAINT planned_deleted_chk CHECK (
  ("deletedAt" IS NULL AND "deletedByMemberId" IS NULL) OR ("deletedAt" IS NOT NULL AND "deletedByMemberId" IS NOT NULL));
-- Previsão excluída não pode estar paga (desfazer antes)
ALTER TABLE "planned_expenses" ADD CONSTRAINT planned_deleted_unpaid_chk CHECK ("deletedAt" IS NULL OR "status" = 'PREVISTO');
