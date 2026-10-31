-- US-089 (SDD-030 §3.1): conta pagadora padrão do cartão (anulável; só sugere). Expand, sem backfill.
ALTER TABLE "credit_cards" ADD COLUMN "paymentAccountId" UUID;
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_familyId_paymentAccountId_fkey"
  FOREIGN KEY ("familyId","paymentAccountId") REFERENCES "bank_accounts"("familyId","id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "credit_cards_family_payer_idx" ON "credit_cards" ("familyId","paymentAccountId")
  WHERE "paymentAccountId" IS NOT NULL;
