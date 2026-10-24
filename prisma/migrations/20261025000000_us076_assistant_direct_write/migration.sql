-- CreateEnum
CREATE TYPE "TransactionOrigin" AS ENUM ('APP', 'ASSISTANT');

-- AlterTable
ALTER TABLE "members" ADD COLUMN     "assistantReviewedAt" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "assistantGrantId" UUID,
ADD COLUMN     "assistantIdemKey" TEXT,
ADD COLUMN     "origin" "TransactionOrigin" NOT NULL DEFAULT 'APP';

-- CreateTable
CREATE TABLE "member_assistant_limits" (
    "familyId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "maxAmountPerTxCents" BIGINT,
    "maxTxPerDay" INTEGER,
    "maxTxPerHour" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "member_assistant_limits_pkey" PRIMARY KEY ("familyId","memberId")
);

-- CreateIndex
CREATE INDEX "transactions_familyId_origin_occurredOn_idx" ON "transactions"("familyId", "origin", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_assistantGrantId_assistantIdemKey_key" ON "transactions"("assistantGrantId", "assistantIdemKey");

-- AddForeignKey
ALTER TABLE "member_assistant_limits" ADD CONSTRAINT "member_assistant_limits_familyId_memberId_fkey" FOREIGN KEY ("familyId", "memberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- CHECKs (SDD-027 §R2.2)
ALTER TABLE "member_assistant_limits"
  ADD CONSTRAINT "mal_amount_chk" CHECK ("maxAmountPerTxCents" IS NULL OR "maxAmountPerTxCents" > 0),
  ADD CONSTRAINT "mal_day_chk" CHECK ("maxTxPerDay" IS NULL OR "maxTxPerDay" BETWEEN 1 AND 200),
  ADD CONSTRAINT "mal_hour_chk" CHECK ("maxTxPerHour" IS NULL OR "maxTxPerHour" BETWEEN 1 AND 60);

-- Só lançamento do assistente carrega conexão e chave de idempotência (formato da chave: SDD-027 §R2.4)
ALTER TABLE "transactions"
  ADD CONSTRAINT "tx_assistant_origin_chk" CHECK (
    "origin" = 'ASSISTANT' OR ("assistantGrantId" IS NULL AND "assistantIdemKey" IS NULL)
  ),
  ADD CONSTRAINT "tx_assistant_idem_chk" CHECK (
    "assistantIdemKey" IS NULL OR "assistantIdemKey" ~ '^[A-Za-z0-9_-]{8,64}$'
  );
