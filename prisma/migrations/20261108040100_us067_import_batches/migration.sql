-- US-067 (ADR-042 §10, §12): lote de importação de fatura. Expand (só aditiva; nenhuma linha existente muda).
CREATE TYPE "ImportSource" AS ENUM ('CSV', 'PDF');

ALTER TABLE "installment_plans" ADD COLUMN "importBatchId" UUID;
ALTER TABLE "transactions" ADD COLUMN "importBatchId" UUID, ADD COLUMN "importKey" TEXT;

CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "fileHash" TEXT NOT NULL,
    "source" "ImportSource" NOT NULL,
    "itemCount" INTEGER NOT NULL,
    "totalInCents" BIGINT NOT NULL,
    "importedByMemberId" UUID NOT NULL,
    "importedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revertedAt" TIMESTAMPTZ(3),
    "revertedByMemberId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "import_batches_counts_chk" CHECK ("itemCount" > 0 AND "totalInCents" >= 0 AND "version" >= 1)
);

CREATE INDEX "import_batches_familyId_cardId_importedAt_idx" ON "import_batches"("familyId", "cardId", "importedAt");
CREATE UNIQUE INDEX "import_batches_familyId_id_key" ON "import_batches"("familyId", "id");

-- Um lote ativo por (família, cartão, arquivo); reverter libera reimportar.
CREATE UNIQUE INDEX "import_batches_active_file_uq" ON "import_batches"("familyId", "cardId", "fileHash") WHERE "revertedAt" IS NULL;
-- Um lançamento ativo por (família, importKey).
CREATE UNIQUE INDEX "transactions_active_import_key_uq" ON "transactions"("familyId", "importKey") WHERE "deletedAt" IS NULL AND "importKey" IS NOT NULL;

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_importBatchId_fkey" FOREIGN KEY ("familyId", "importBatchId") REFERENCES "import_batches"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_familyId_importBatchId_fkey" FOREIGN KEY ("familyId", "importBatchId") REFERENCES "import_batches"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_familyId_cardId_fkey" FOREIGN KEY ("familyId", "cardId") REFERENCES "credit_cards"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_familyId_invoiceId_fkey" FOREIGN KEY ("familyId", "invoiceId") REFERENCES "card_invoices"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_familyId_importedByMemberId_fkey" FOREIGN KEY ("familyId", "importedByMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_familyId_revertedByMemberId_fkey" FOREIGN KEY ("familyId", "revertedByMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
