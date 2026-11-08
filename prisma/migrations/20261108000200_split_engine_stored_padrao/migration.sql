-- ADR-041: motor STORED por padrão. Expand: só muda o default da coluna (código anterior segue válido)
-- e vira STORED as famílias LEGACY sem rateio a preencher (nenhuma despesa/previsão comum).
ALTER TABLE "families" ALTER COLUMN "splitEngine" SET DEFAULT 'STORED';

WITH eligible AS (
  SELECT f.id FROM "families" f
  WHERE f."splitEngine" = 'LEGACY'
    AND NOT EXISTS (SELECT 1 FROM "transactions" t WHERE t."familyId" = f.id AND t."isSharedExpense" = true)
    AND NOT EXISTS (SELECT 1 FROM "planned_expenses" p WHERE p."familyId" = f.id AND p."isSharedExpense" = true)
    AND NOT EXISTS (SELECT 1 FROM "recurring_expenses" r WHERE r."familyId" = f.id AND r."isSharedExpense" = true)
), flipped AS (
  UPDATE "families" f SET "splitEngine" = 'STORED' FROM eligible e WHERE f.id = e.id RETURNING f.id
)
INSERT INTO "data_migrations" ("id", "name", "familyId", "state", "finishedAt", "report")
SELECT gen_random_uuid(), 'en002_split_stored', fl.id, 'DONE', CURRENT_TIMESTAMP, '{"native": true}'::jsonb
FROM flipped fl
ON CONFLICT ("name", "familyId") DO UPDATE SET "state" = 'DONE', "finishedAt" = CURRENT_TIMESTAMP, "report" = '{"native": true}'::jsonb;
