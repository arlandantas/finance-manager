-- US-032/033 (SDD-012 §5): arquivar e excluir (logicamente) contas e cartões.
-- Excluir é exclusão lógica terminal (o ledger proíbe DELETE e toda conta nasce com OPENING).

ALTER TABLE "bank_accounts"
  ADD COLUMN "archivedAt" TIMESTAMPTZ(3),
  ADD COLUMN "archivedByMemberId" UUID,
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3),
  ADD COLUMN "deletedByMemberId" UUID;

ALTER TABLE "credit_cards"
  ADD COLUMN "archivedAt" TIMESTAMPTZ(3),
  ADD COLUMN "archivedByMemberId" UUID,
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3),
  ADD COLUMN "deletedByMemberId" UUID;

-- O nome de conta/cartão EXCLUÍDO é liberado; o de ARQUIVADO continua ocupado.
DROP INDEX bank_accounts_family_name_uq;
CREATE UNIQUE INDEX bank_accounts_family_name_uq ON "bank_accounts" ("familyId", lower(btrim("name"))) WHERE "deletedAt" IS NULL;
DROP INDEX credit_cards_family_name_uq;
CREATE UNIQUE INDEX credit_cards_family_name_uq ON "credit_cards" ("familyId", lower(btrim("name"))) WHERE "deletedAt" IS NULL;

-- Apoio às listas de ativas
CREATE INDEX bank_accounts_family_active_idx ON "bank_accounts" ("familyId") WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL;
CREATE INDEX credit_cards_family_active_idx ON "credit_cards" ("familyId") WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL;
