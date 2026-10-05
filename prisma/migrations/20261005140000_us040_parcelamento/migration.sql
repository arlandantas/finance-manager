-- US-040a (SDD-014 §5, ADR-017/020): compra parcelada no cartão e competência derivada no banco.
-- Ordem importa: colunas e tabela ➜ retropreenchimento ANTES do gatilho ➜ CHECKs ➜ gatilho.

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "competenceOn" DATE NOT NULL DEFAULT CURRENT_DATE,
ADD COLUMN     "installmentCount" INTEGER,
ADD COLUMN     "installmentNo" INTEGER,
ADD COLUMN     "installmentPlanId" UUID;

-- CreateTable
CREATE TABLE "installment_plans" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "totalInCents" BIGINT NOT NULL,
    "installmentCount" INTEGER NOT NULL,
    "purchaseOn" DATE NOT NULL,
    "description" TEXT NOT NULL,
    "note" TEXT,
    "categoryId" UUID NOT NULL,
    "payerMemberId" UUID NOT NULL,
    "authorMemberId" UUID NOT NULL,
    "updatedByMemberId" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    "deletedAt" TIMESTAMPTZ(3),
    "deletedByMemberId" UUID,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "installment_plans_familyId_cardId_purchaseOn_idx" ON "installment_plans"("familyId", "cardId", "purchaseOn");

-- CreateIndex
CREATE UNIQUE INDEX "installment_plans_familyId_id_key" ON "installment_plans"("familyId", "id");

-- CreateIndex
CREATE INDEX "tx_family_competence_idx" ON "transactions"("familyId", "competenceOn" DESC, "createdAt" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "tx_family_kind_competence_idx" ON "transactions"("familyId", "kind", "competenceOn");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_installmentPlanId_fkey" FOREIGN KEY ("familyId", "installmentPlanId") REFERENCES "installment_plans"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_familyId_cardId_fkey" FOREIGN KEY ("familyId", "cardId") REFERENCES "credit_cards"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_familyId_categoryId_fkey" FOREIGN KEY ("familyId", "categoryId") REFERENCES "categories"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_familyId_payerMemberId_fkey" FOREIGN KEY ("familyId", "payerMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_familyId_authorMemberId_fkey" FOREIGN KEY ("familyId", "authorMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 1) Retropreenchimento: toda linha existente conta pela própria data (números homologados intactos).
--    UPDATE de SQL não passa por @updatedAt nem altera `version`.
UPDATE "transactions" SET "competenceOn" = "occurredOn";

-- 2) CHECKs (os IS NOT NULL explícitos evitam que NULL em BETWEEN passe no CHECK)
ALTER TABLE "installment_plans" ADD CONSTRAINT installment_plans_count_chk CHECK ("installmentCount" BETWEEN 2 AND 24);
ALTER TABLE "installment_plans" ADD CONSTRAINT installment_plans_total_chk CHECK ("totalInCents" >= "installmentCount");
ALTER TABLE "installment_plans" ADD CONSTRAINT installment_plans_deleted_chk CHECK (
  ("deletedAt" IS NULL AND "deletedByMemberId" IS NULL) OR ("deletedAt" IS NOT NULL AND "deletedByMemberId" IS NOT NULL));
ALTER TABLE "transactions" ADD CONSTRAINT tx_installment_shape_chk CHECK (
  ("installmentPlanId" IS NULL AND "installmentNo" IS NULL AND "installmentCount" IS NULL)
  OR ("installmentPlanId" IS NOT NULL AND "installmentCount" IS NOT NULL AND "installmentNo" IS NOT NULL
      AND "installmentCount" BETWEEN 2 AND 24 AND "installmentNo" BETWEEN 1 AND "installmentCount"
      AND kind = 'EXPENSE' AND "cardId" IS NOT NULL AND "invoiceId" IS NOT NULL));
ALTER TABLE "transactions" ADD CONSTRAINT tx_competence_chk CHECK ("installmentPlanId" IS NOT NULL OR "competenceOn" = "occurredOn");
CREATE UNIQUE INDEX tx_installment_no_uq ON "transactions" ("installmentPlanId", "installmentNo") WHERE "installmentPlanId" IS NOT NULL;

-- 3) Gatilho de competência (ADR-020 §2): em TODA escrita, ninguém grava competência à mão.
CREATE FUNCTION tx_sync_competence() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."installmentPlanId" IS NULL THEN
    NEW."competenceOn" := NEW."occurredOn";
  ELSE
    SELECT "closingDate" INTO STRICT NEW."competenceOn" FROM "card_invoices" WHERE "id" = NEW."invoiceId" AND "familyId" = NEW."familyId";
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transactions_sync_competence BEFORE INSERT OR UPDATE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION tx_sync_competence();
