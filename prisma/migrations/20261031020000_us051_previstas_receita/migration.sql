-- US-051 (SDD-017 §5, ADR-023): receita prevista na mesma tabela das despesas previstas (kind).
-- Expand: coluna com DEFAULT 'EXPENSE' (linhas existentes e código anterior continuam despesas), índice e CHECKs.
CREATE TYPE "PlannedKind" AS ENUM ('EXPENSE', 'INCOME');

ALTER TABLE "planned_expenses" ADD COLUMN "kind" "PlannedKind" NOT NULL DEFAULT 'EXPENSE';

CREATE INDEX "planned_expenses_familyId_kind_status_dueOn_idx" ON "planned_expenses"("familyId", "kind", "status", "dueOn");

-- Receita nunca é dividida (nem entra no acerto). O CHECK de splitMode (SDD-017 §5) é omitido: a coluna
-- splitMode não existe em planned_expenses (ver DEV-168).
ALTER TABLE "planned_expenses" ADD CONSTRAINT planned_income_not_shared_chk
  CHECK ("kind" = 'EXPENSE' OR "isSharedExpense" = false);
