-- CreateEnum
CREATE TYPE "AssistantProposalStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'EXPIRED');

-- AlterTable
ALTER TABLE "mcp_grants" ADD COLUMN     "requireConfirmation" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "assistantProposalId" UUID;

-- CreateTable
CREATE TABLE "assistant_proposals" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "grantId" UUID NOT NULL,
    "idempotencyKey" TEXT,
    "contentHash" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amountInCents" BIGINT NOT NULL,
    "categoryId" UUID NOT NULL,
    "accountId" UUID,
    "cardId" UUID,
    "occurredOn" DATE NOT NULL,
    "status" "AssistantProposalStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "decidedAt" TIMESTAMPTZ(3),
    "transactionId" UUID,

    CONSTRAINT "assistant_proposals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_proposals_transactionId_key" ON "assistant_proposals"("transactionId");

-- CreateIndex
CREATE INDEX "assistant_proposals_familyId_memberId_status_idx" ON "assistant_proposals"("familyId", "memberId", "status");

-- CreateIndex
CREATE INDEX "assistant_proposals_grantId_createdAt_idx" ON "assistant_proposals"("grantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_proposals_grantId_idempotencyKey_key" ON "assistant_proposals"("grantId", "idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_assistantProposalId_key" ON "transactions"("assistantProposalId");

-- AddForeignKey
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_familyId_memberId_fkey" FOREIGN KEY ("familyId", "memberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_familyId_grantId_fkey" FOREIGN KEY ("familyId", "grantId") REFERENCES "mcp_grants"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_familyId_categoryId_fkey" FOREIGN KEY ("familyId", "categoryId") REFERENCES "categories"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_familyId_accountId_fkey" FOREIGN KEY ("familyId", "accountId") REFERENCES "bank_accounts"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_familyId_cardId_fkey" FOREIGN KEY ("familyId", "cardId") REFERENCES "credit_cards"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_proposals" ADD CONSTRAINT "assistant_proposals_familyId_transactionId_fkey" FOREIGN KEY ("familyId", "transactionId") REFERENCES "transactions"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECKs (US-076c, ADR-030 §6): forma da proposta e coerência do estado
ALTER TABLE "assistant_proposals"
  ADD CONSTRAINT "ap_description_chk" CHECK (char_length("description") BETWEEN 2 AND 100),
  ADD CONSTRAINT "ap_amount_chk" CHECK ("amountInCents" > 0),
  ADD CONSTRAINT "ap_source_chk" CHECK (("accountId" IS NULL) <> ("cardId" IS NULL)),
  ADD CONSTRAINT "ap_idem_chk" CHECK ("idempotencyKey" IS NULL OR "idempotencyKey" ~ '^[A-Za-z0-9_-]{8,64}$'),
  ADD CONSTRAINT "ap_state_chk" CHECK (
    ("status" = 'CONFIRMED') = ("transactionId" IS NOT NULL)
    AND ("status" = 'PENDING') = ("decidedAt" IS NULL)
  );

-- O lançamento só aponta para proposta se for do assistente
ALTER TABLE "transactions"
  ADD CONSTRAINT "tx_assistant_proposal_chk" CHECK ("assistantProposalId" IS NULL OR "origin" = 'ASSISTANT');

