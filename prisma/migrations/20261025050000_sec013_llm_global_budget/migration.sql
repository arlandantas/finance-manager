-- SEC-013 (SDD-028 §5): teto global mensal de LLM (uma linha por mês, reservada/liquidada na mesma transação
-- da linha da família, sempre na ordem família -> global).
CREATE TABLE "llm_global_budget_months" (
  "month" TEXT NOT NULL,
  "spentMicroBrl" BIGINT NOT NULL DEFAULT 0,
  "reservedMicroBrl" BIGINT NOT NULL DEFAULT 0,
  "alertedPct" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT now(),
  CONSTRAINT "llm_global_budget_months_pkey" PRIMARY KEY ("month"),
  CONSTRAINT llm_global_alerted_chk CHECK ("alertedPct" IN (0, 50, 80, 100))
);
-- backfill: o gasto/reserva já registrado por família entra no global do mês
INSERT INTO "llm_global_budget_months" ("month", "spentMicroBrl", "reservedMicroBrl")
SELECT "month", COALESCE(SUM("spentMicroBrl"), 0), COALESCE(SUM("reservedMicroBrl"), 0)
  FROM "llm_budget_months" GROUP BY "month";
