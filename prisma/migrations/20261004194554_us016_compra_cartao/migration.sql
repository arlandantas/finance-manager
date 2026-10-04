-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "cardId" UUID,
ADD COLUMN     "invoiceId" UUID,
ALTER COLUMN "accountId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "card_invoices" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "referenceMonth" TEXT NOT NULL,
    "closingDate" DATE NOT NULL,
    "dueDate" DATE NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "card_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "card_invoices_familyId_cardId_closingDate_idx" ON "card_invoices"("familyId", "cardId", "closingDate");

-- CreateIndex
CREATE UNIQUE INDEX "card_invoices_cardId_referenceMonth_key" ON "card_invoices"("cardId", "referenceMonth");

-- CreateIndex
CREATE UNIQUE INDEX "card_invoices_familyId_id_key" ON "card_invoices"("familyId", "id");

-- CreateIndex
CREATE INDEX "transactions_familyId_cardId_occurredOn_idx" ON "transactions"("familyId", "cardId", "occurredOn");

-- CreateIndex
CREATE INDEX "transactions_familyId_invoiceId_idx" ON "transactions"("familyId", "invoiceId");

-- AddForeignKey
ALTER TABLE "card_invoices" ADD CONSTRAINT "card_invoices_familyId_cardId_fkey" FOREIGN KEY ("familyId", "cardId") REFERENCES "credit_cards"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_cardId_fkey" FOREIGN KEY ("familyId", "cardId") REFERENCES "credit_cards"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_invoiceId_fkey" FOREIGN KEY ("familyId", "invoiceId") REFERENCES "card_invoices"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- SQL cru (modelo-de-dados.md §7.3)
ALTER TABLE "card_invoices" ADD CONSTRAINT card_invoices_ref_chk CHECK ("referenceMonth" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "card_invoices" ADD CONSTRAINT card_invoices_dates_chk CHECK ("dueDate" > "closingDate");

-- Substitui tx_kind_shape_chk: despesa em conta OU compra no cartão; pagamento de fatura (uma perna, com conta e cartão)
ALTER TABLE "transactions" DROP CONSTRAINT tx_kind_shape_chk;
ALTER TABLE "transactions" ADD CONSTRAINT tx_kind_shape_chk CHECK (
  ("kind" = 'EXPENSE' AND "direction" = 'DEBIT' AND "categoryId" IS NOT NULL AND "payerMemberId" IS NOT NULL AND "transferGroupId" IS NULL
     AND (("accountId" IS NOT NULL AND "cardId" IS NULL AND "invoiceId" IS NULL)
       OR ("accountId" IS NULL AND "cardId" IS NOT NULL AND "invoiceId" IS NOT NULL)))
  OR ("kind" = 'INCOME'  AND "direction" = 'CREDIT' AND "categoryId" IS NOT NULL AND "payerMemberId" IS NOT NULL AND "isSharedExpense" = false
     AND "transferGroupId" IS NULL AND "accountId" IS NOT NULL AND "cardId" IS NULL AND "invoiceId" IS NULL)
  OR ("kind" = 'OPENING' AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false
     AND "transferGroupId" IS NULL AND "accountId" IS NOT NULL AND "cardId" IS NULL AND "invoiceId" IS NULL)
  OR ("kind" = 'TRANSFER_OUT' AND "direction" = 'DEBIT'  AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false
     AND "transferGroupId" IS NOT NULL AND "accountId" IS NOT NULL AND "cardId" IS NULL AND "invoiceId" IS NULL)
  OR ("kind" = 'TRANSFER_IN'  AND "direction" = 'CREDIT' AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false
     AND "transferGroupId" IS NOT NULL AND "accountId" IS NOT NULL AND "cardId" IS NULL AND "invoiceId" IS NULL)
  OR ("kind" = 'INVOICE_PAYMENT' AND "direction" = 'DEBIT' AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false
     AND "transferGroupId" IS NULL AND "accountId" IS NOT NULL AND "cardId" IS NOT NULL AND "invoiceId" IS NOT NULL));

-- No máximo um pagamento ATIVO por fatura
CREATE UNIQUE INDEX tx_invoice_payment_active_uq ON "transactions" ("invoiceId")
  WHERE "kind" = 'INVOICE_PAYMENT' AND "deletedAt" IS NULL;
-- Consulta de limite/total: compras ativas por fatura
CREATE INDEX tx_card_purchase_active_idx ON "transactions" ("familyId", "cardId", "invoiceId")
  WHERE "kind" = 'EXPENSE' AND "cardId" IS NOT NULL AND "deletedAt" IS NULL;
