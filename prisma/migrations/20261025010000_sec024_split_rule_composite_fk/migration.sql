-- SEC-024: FK composta (familyId, splitRuleVersionId) -> split_rule_versions (familyId, id).
-- Segura: pré-checagem falha com mensagem clara se houver lançamento apontando para regra de OUTRA família;
-- a FK nova entra NOT VALID e é validada em seguida (sem reescrever a tabela).
DO $$
DECLARE bad integer;
BEGIN
  SELECT count(*) INTO bad
    FROM "transactions" t
    JOIN "split_rule_versions" v ON v."id" = t."splitRuleVersionId"
   WHERE v."familyId" <> t."familyId";
  IF bad > 0 THEN
    RAISE EXCEPTION 'SEC-024: % lançamento(s) referenciam regra de divisão de outra família; corrija antes de migrar', bad;
  END IF;
END $$;

CREATE UNIQUE INDEX "split_rule_versions_familyId_id_key" ON "split_rule_versions"("familyId", "id");

ALTER TABLE "transactions" DROP CONSTRAINT "transactions_splitRuleVersionId_fkey";

ALTER TABLE "transactions" ADD CONSTRAINT "transactions_familyId_splitRuleVersionId_fkey" FOREIGN KEY ("familyId", "splitRuleVersionId") REFERENCES "split_rule_versions"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT NOT VALID;

ALTER TABLE "transactions" VALIDATE CONSTRAINT "transactions_familyId_splitRuleVersionId_fkey";
