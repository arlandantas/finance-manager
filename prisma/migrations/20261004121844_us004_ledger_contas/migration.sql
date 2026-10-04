-- CreateEnum
CREATE TYPE "BankAccountType" AS ENUM ('CHECKING', 'SAVINGS', 'CASH');

-- CreateEnum
CREATE TYPE "TransactionKind" AS ENUM ('EXPENSE', 'INCOME', 'OPENING', 'TRANSFER_OUT', 'TRANSFER_IN');

-- CreateEnum
CREATE TYPE "Direction" AS ENUM ('CREDIT', 'DEBIT');

-- CreateEnum
CREATE TYPE "DeletionReason" AS ENUM ('DELETED', 'UNDONE');

-- CreateEnum
CREATE TYPE "TransferGroupKind" AS ENUM ('TRANSFER', 'SETTLEMENT');

-- CreateEnum
CREATE TYPE "RevisionAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'RESTORE', 'UNDO');

-- CreateTable
CREATE TABLE "bank_accounts" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL,
    "type" "BankAccountType" NOT NULL,
    "ownerMemberId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfer_groups" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "kind" "TransferGroupKind" NOT NULL,
    "occurredOn" DATE NOT NULL,
    "settlementPeriod" TEXT,
    "settlementFromMemberId" UUID,
    "settlementToMemberId" UUID,
    "authorMemberId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedByMemberId" UUID,

    CONSTRAINT "transfer_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "kind" "TransactionKind" NOT NULL,
    "direction" "Direction" NOT NULL,
    "accountId" UUID NOT NULL,
    "amountInCents" BIGINT NOT NULL,
    "occurredOn" DATE NOT NULL,
    "categoryId" UUID,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "payerMemberId" UUID,
    "isSharedExpense" BOOLEAN NOT NULL DEFAULT false,
    "authorMemberId" UUID NOT NULL,
    "updatedByMemberId" UUID,
    "transferGroupId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedByMemberId" UUID,
    "deletionReason" "DeletionReason",

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_revisions" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "transactionId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "action" "RevisionAction" NOT NULL,
    "actorMemberId" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changes" JSONB NOT NULL,

    CONSTRAINT "transaction_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bank_accounts_familyId_id_key" ON "bank_accounts"("familyId", "id");

-- CreateIndex
CREATE INDEX "transfer_groups_familyId_kind_settlementPeriod_idx" ON "transfer_groups"("familyId", "kind", "settlementPeriod");

-- CreateIndex
CREATE UNIQUE INDEX "transfer_groups_familyId_id_key" ON "transfer_groups"("familyId", "id");

-- CreateIndex
CREATE INDEX "transactions_familyId_occurredOn_createdAt_id_idx" ON "transactions"("familyId", "occurredOn" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "transactions_familyId_accountId_idx" ON "transactions"("familyId", "accountId");

-- CreateIndex
CREATE INDEX "transactions_familyId_payerMemberId_occurredOn_idx" ON "transactions"("familyId", "payerMemberId", "occurredOn");

-- CreateIndex
CREATE INDEX "transactions_familyId_kind_occurredOn_idx" ON "transactions"("familyId", "kind", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_familyId_id_key" ON "transactions"("familyId", "id");

-- CreateIndex
CREATE INDEX "transaction_revisions_familyId_transactionId_at_idx" ON "transaction_revisions"("familyId", "transactionId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_revisions_transactionId_revision_action_key" ON "transaction_revisions"("transactionId", "revision", "action");

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_familyId_ownerMemberId_fkey" FOREIGN KEY ("familyId", "ownerMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transfer_groups" ADD CONSTRAINT "transfer_groups_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_accountId_fkey" FOREIGN KEY ("familyId", "accountId") REFERENCES "bank_accounts"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_categoryId_fkey" FOREIGN KEY ("familyId", "categoryId") REFERENCES "categories"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_payerMemberId_fkey" FOREIGN KEY ("familyId", "payerMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_authorMemberId_fkey" FOREIGN KEY ("familyId", "authorMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_transferGroupId_fkey" FOREIGN KEY ("familyId", "transferGroupId") REFERENCES "transfer_groups"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction_revisions" ADD CONSTRAINT "transaction_revisions_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL cru (modelo-de-dados.md §4)
-- Conta: nome único por família, sem distinguir caixa nem espaços nas pontas
CREATE UNIQUE INDEX bank_accounts_family_name_uq ON "bank_accounts" ("familyId", lower(btrim("name")));

-- Transação: invariantes do ledger (ADR-007)
ALTER TABLE "transactions" ADD CONSTRAINT tx_amount_chk CHECK (
  ("amountInCents" > 0) OR ("kind" = 'OPENING' AND "amountInCents" >= 0));
ALTER TABLE "transactions" ADD CONSTRAINT tx_kind_shape_chk CHECK (
  ("kind" = 'EXPENSE'      AND "direction" = 'DEBIT'  AND "categoryId" IS NOT NULL AND "payerMemberId" IS NOT NULL AND "transferGroupId" IS NULL)
  OR ("kind" = 'INCOME'    AND "direction" = 'CREDIT' AND "categoryId" IS NOT NULL AND "payerMemberId" IS NOT NULL AND "isSharedExpense" = false AND "transferGroupId" IS NULL)
  OR ("kind" = 'OPENING'   AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false AND "transferGroupId" IS NULL)
  OR ("kind" = 'TRANSFER_OUT' AND "direction" = 'DEBIT'  AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false AND "transferGroupId" IS NOT NULL)
  OR ("kind" = 'TRANSFER_IN'  AND "direction" = 'CREDIT' AND "categoryId" IS NULL AND "payerMemberId" IS NULL AND "isSharedExpense" = false AND "transferGroupId" IS NOT NULL));
ALTER TABLE "transactions" ADD CONSTRAINT tx_deleted_chk CHECK (
  ("deletedAt" IS NULL AND "deletedByMemberId" IS NULL AND "deletionReason" IS NULL)
  OR ("deletedAt" IS NOT NULL AND "deletedByMemberId" IS NOT NULL AND "deletionReason" IS NOT NULL));

-- Exatamente uma perna de cada tipo por transferência
CREATE UNIQUE INDEX tx_transfer_leg_uq ON "transactions" ("transferGroupId", "kind") WHERE "transferGroupId" IS NOT NULL;

-- Auditoria append-only e proibição de hard delete de movimentação
CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN RAISE EXCEPTION 'tabela % é append-only', TG_TABLE_NAME; END $$;
CREATE TRIGGER transaction_revisions_append_only
  BEFORE UPDATE OR DELETE ON "transaction_revisions" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER transactions_no_delete
  BEFORE DELETE ON "transactions" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
