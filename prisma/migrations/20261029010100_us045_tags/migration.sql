-- US-045 (SDD-016 §5, ADR-022): tags livres da família (N:N com lançamentos). Tabelas FORA do ledger:
-- permitem DELETE (a gestão fica em family_events). Só despesa e receita recebem tags (gatilho).

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByMemberId" UUID NOT NULL,
    "updatedByMemberId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transaction_tags" (
    "transactionId" UUID NOT NULL,
    "tagId" UUID NOT NULL,
    "familyId" UUID NOT NULL,

    CONSTRAINT "transaction_tags_pkey" PRIMARY KEY ("transactionId","tagId")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_familyId_id_key" ON "tags"("familyId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "tags_familyId_nameKey_key" ON "tags"("familyId", "nameKey");

-- CreateIndex
CREATE INDEX "transaction_tags_tagId_transactionId_idx" ON "transaction_tags"("tagId", "transactionId");

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_familyId_createdByMemberId_fkey" FOREIGN KEY ("familyId", "createdByMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_familyId_updatedByMemberId_fkey" FOREIGN KEY ("familyId", "updatedByMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_familyId_transactionId_fkey" FOREIGN KEY ("familyId", "transactionId") REFERENCES "transactions"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction_tags" ADD CONSTRAINT "transaction_tags_familyId_tagId_fkey" FOREIGN KEY ("familyId", "tagId") REFERENCES "tags"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- Regras no banco (SQL cru)
ALTER TABLE "tags" ADD CONSTRAINT tags_name_len_chk CHECK (char_length("name") BETWEEN 2 AND 30);
ALTER TABLE "tags" ADD CONSTRAINT tags_key_chk CHECK ("nameKey" <> '' AND char_length("nameKey") <= 60);

CREATE FUNCTION transaction_tags_kind_chk() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE k "TransactionKind";
BEGIN
  SELECT kind INTO k FROM "transactions" WHERE "id" = NEW."transactionId" AND "familyId" = NEW."familyId";
  IF k IS NULL OR k NOT IN ('EXPENSE', 'INCOME') THEN
    RAISE EXCEPTION 'tags só valem para despesa e receita';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transaction_tags_kind BEFORE INSERT ON "transaction_tags"
  FOR EACH ROW EXECUTE FUNCTION transaction_tags_kind_chk();
