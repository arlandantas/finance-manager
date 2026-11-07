-- US-100 (ADR-037): transferência prevista. Expand puro (enum + tabela nova, nada lê ainda). Reversão (antes de haver dados):
--   DROP TABLE "planned_transfers"; DROP TYPE "PlannedTransferStatus";
-- CreateEnum
CREATE TYPE "PlannedTransferStatus" AS ENUM ('PREVISTA', 'EFETIVADA');

-- CreateTable
CREATE TABLE "planned_transfers" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "fromAccountId" UUID NOT NULL,
    "toAccountId" UUID NOT NULL,
    "amountInCents" BIGINT NOT NULL,
    "dueOn" DATE NOT NULL,
    "description" TEXT,
    "status" "PlannedTransferStatus" NOT NULL DEFAULT 'PREVISTA',
    "transferGroupId" UUID,
    "authorMemberId" UUID NOT NULL,
    "updatedByMemberId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedByMemberId" UUID,

    CONSTRAINT "planned_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "planned_transfers_familyId_status_dueOn_idx" ON "planned_transfers"("familyId", "status", "dueOn");

-- CreateIndex
CREATE UNIQUE INDEX "planned_transfers_familyId_id_key" ON "planned_transfers"("familyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "planned_transfers_familyId_transferGroupId_key" ON "planned_transfers"("familyId", "transferGroupId");

-- AddForeignKey
ALTER TABLE "planned_transfers" ADD CONSTRAINT "planned_transfers_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_transfers" ADD CONSTRAINT "planned_transfers_familyId_fromAccountId_fkey" FOREIGN KEY ("familyId", "fromAccountId") REFERENCES "bank_accounts"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_transfers" ADD CONSTRAINT "planned_transfers_familyId_toAccountId_fkey" FOREIGN KEY ("familyId", "toAccountId") REFERENCES "bank_accounts"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_transfers" ADD CONSTRAINT "planned_transfers_familyId_transferGroupId_fkey" FOREIGN KEY ("familyId", "transferGroupId") REFERENCES "transfer_groups"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "planned_transfers" ADD CONSTRAINT "planned_transfers_familyId_authorMemberId_fkey" FOREIGN KEY ("familyId", "authorMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- SQL cru (ADR-037 §1)
ALTER TABLE "planned_transfers" ADD CONSTRAINT planned_transfer_amount_chk CHECK ("amountInCents" > 0);
ALTER TABLE "planned_transfers" ADD CONSTRAINT planned_transfer_accounts_chk CHECK ("fromAccountId" <> "toAccountId");
ALTER TABLE "planned_transfers" ADD CONSTRAINT planned_transfer_status_group_chk CHECK (("status" = 'EFETIVADA') = ("transferGroupId" IS NOT NULL));
ALTER TABLE "planned_transfers" ADD CONSTRAINT planned_transfer_deleted_chk CHECK (
  ("deletedAt" IS NULL AND "deletedByMemberId" IS NULL) OR ("deletedAt" IS NOT NULL AND "deletedByMemberId" IS NOT NULL));
ALTER TABLE "planned_transfers" ADD CONSTRAINT planned_transfer_deleted_open_chk CHECK ("deletedAt" IS NULL OR "status" = 'PREVISTA');
