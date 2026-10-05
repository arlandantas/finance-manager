-- EN-002a (SDD-015 §5, ADR-016/021): EXPANSÃO. Nada muda para o usuário: linhas existentes ficam
-- NONE/LEGACY. Prisma cria enums, colunas, tabelas e FKs; abaixo, o SQL cru (CHECKs e gatilhos deferidos).

-- CreateEnum
CREATE TYPE "SplitMode" AS ENUM ('NONE', 'RULE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "SplitEngine" AS ENUM ('LEGACY', 'STORED');

-- AlterTable
ALTER TABLE "families" ADD COLUMN     "splitEngine" "SplitEngine" NOT NULL DEFAULT 'LEGACY';

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "splitMode" "SplitMode" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "splitRuleVersionId" UUID;

-- CreateTable
CREATE TABLE "transaction_splits" (
    "transactionId" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "bps" INTEGER NOT NULL,
    "amountInCents" BIGINT NOT NULL,

    CONSTRAINT "transaction_splits_pkey" PRIMARY KEY ("transactionId","memberId")
);

-- CreateTable
CREATE TABLE "split_migration_snapshots" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "periodKey" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "takenAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "split_migration_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "data_migrations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "familyId" UUID NOT NULL,
    "state" TEXT NOT NULL,
    "finishedAt" TIMESTAMPTZ(3),
    "report" JSONB,

    CONSTRAINT "data_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transaction_splits_familyId_memberId_idx" ON "transaction_splits"("familyId", "memberId");

-- CreateIndex
CREATE UNIQUE INDEX "split_migration_snapshots_familyId_periodKey_key" ON "split_migration_snapshots"("familyId", "periodKey");

-- CreateIndex
CREATE UNIQUE INDEX "data_migrations_name_familyId_key" ON "data_migrations"("name", "familyId");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_splitRuleVersionId_fkey" FOREIGN KEY ("splitRuleVersionId") REFERENCES "split_rule_versions"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_familyId_transactionId_fkey" FOREIGN KEY ("familyId", "transactionId") REFERENCES "transactions"("familyId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction_splits" ADD CONSTRAINT "transaction_splits_familyId_memberId_fkey" FOREIGN KEY ("familyId", "memberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "split_migration_snapshots" ADD CONSTRAINT "split_migration_snapshots_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "data_migrations" ADD CONSTRAINT "data_migrations_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- só despesa pode ter divisão; e quem tem divisão é "comum" (sentido seguro em todas as fases, ADR-021 §4)
ALTER TABLE "transaction_splits" ADD CONSTRAINT transaction_splits_bps_chk CHECK ("bps" BETWEEN 0 AND 10000);
ALTER TABLE "transaction_splits" ADD CONSTRAINT transaction_splits_amount_chk CHECK ("amountInCents" >= 0);
ALTER TABLE "transactions" ADD CONSTRAINT tx_split_kind_chk CHECK ("splitMode" = 'NONE' OR (kind = 'EXPENSE' AND "isSharedExpense" = true));

-- Integridade conferida no COMMIT (deferrable): Σ bps = 10000 e Σ valores = valor do lançamento
CREATE FUNCTION tx_split_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE t_id uuid; mode "SplitMode"; amt bigint; n int; sb bigint; sa bigint;
BEGIN
  IF TG_TABLE_NAME = 'transaction_splits' THEN t_id := COALESCE(NEW."transactionId", OLD."transactionId"); ELSE t_id := NEW."id"; END IF;
  SELECT "splitMode", "amountInCents" INTO mode, amt FROM "transactions" WHERE "id" = t_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT COUNT(*), COALESCE(SUM("bps"), 0), COALESCE(SUM("amountInCents"), 0) INTO n, sb, sa FROM "transaction_splits" WHERE "transactionId" = t_id;
  IF mode = 'NONE' THEN
    IF n > 0 THEN RAISE EXCEPTION 'lançamento % sem divisão não pode ter rateio', t_id; END IF;
  ELSIF n = 0 OR sb <> 10000 OR sa <> amt THEN
    RAISE EXCEPTION 'rateio inválido no lançamento % (bps %, valor % de %)', t_id, sb, sa, amt;
  END IF;
  RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER transactions_split_integrity AFTER INSERT OR UPDATE OF "splitMode", "amountInCents" ON "transactions"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tx_split_integrity();
CREATE CONSTRAINT TRIGGER transaction_splits_integrity AFTER INSERT OR UPDATE OR DELETE ON "transaction_splits"
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION tx_split_integrity();
