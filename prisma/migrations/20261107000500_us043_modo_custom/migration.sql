-- US-043 (ADR-016, ADR-021 §4, ADR-040): modo CUSTOM por lançamento e rateio guardado na previsão.
-- Expand: colunas com DEFAULT (código anterior segue válido); o CHECK é o "contrato" do ADR-021 §4.
ALTER TABLE "planned_expenses" ADD COLUMN "splitMode" "SplitMode" NOT NULL DEFAULT 'NONE';
ALTER TABLE "planned_expenses" ADD COLUMN "splitShares" JSONB;

-- Previsão dividida já existente é "Pela regra" (legado: true == RULE)
UPDATE "planned_expenses" SET "splitMode" = 'RULE' WHERE "isSharedExpense" = true;

-- `splitShares` só em CUSTOM; modo diferente de NONE exige previsão dividida (ocorrência de série pode ser
-- dividida com modo NONE: é lida como RULE até a baixa).
ALTER TABLE "planned_expenses" ADD CONSTRAINT planned_split_chk
  CHECK (("splitMode" = 'NONE' OR "isSharedExpense" = true)
    AND (("splitMode" = 'CUSTOM') = ("splitShares" IS NOT NULL)));

-- NÃO aplicado aqui: CHECK ("isSharedExpense" = ("splitMode" <> 'NONE')) em `transactions`. A fábrica de testes e a
-- coluna `families.splitEngine` ainda têm LEGACY como padrão (LEGACY grava `isSharedExpense` sem modo); o CHECK
-- entra quando toda família for STORED (ADR-021 §4, pendência registrada na spec 05).
