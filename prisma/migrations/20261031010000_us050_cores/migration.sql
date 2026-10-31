-- US-050 (SDD-017 §5): cor por conta e cartão. Expand: enum + coluna anulável, backfill determinístico,
-- depois NOT NULL com DEFAULT 'BLUE' (o código anterior, que não conhece a coluna, continua inserindo).
CREATE TYPE "AccountColor" AS ENUM ('BLUE','GREEN','PURPLE','ORANGE','PINK','TEAL','RED','YELLOW','GRAY','BROWN');

ALTER TABLE "bank_accounts" ADD COLUMN "color" "AccountColor";
ALTER TABLE "credit_cards"  ADD COLUMN "color" "AccountColor";

-- Por família, contas e cartões (inclusive arquivados/excluídos) por (createdAt, id): paleta em ciclo.
WITH src AS (
  SELECT 'A'::text AS t, "id", "familyId", "createdAt" FROM "bank_accounts"
  UNION ALL SELECT 'C', "id", "familyId", "createdAt" FROM "credit_cards"
), ranked AS (
  SELECT t, "id", row_number() OVER (PARTITION BY "familyId" ORDER BY "createdAt", "id") AS rn FROM src
)
UPDATE "bank_accounts" a
SET "color" = (ARRAY['BLUE','GREEN','PURPLE','ORANGE','PINK','TEAL','RED','YELLOW','GRAY','BROWN'])[((r.rn - 1) % 10) + 1]::"AccountColor"
FROM ranked r WHERE r.t = 'A' AND r."id" = a."id";

WITH src AS (
  SELECT 'A'::text AS t, "id", "familyId", "createdAt" FROM "bank_accounts"
  UNION ALL SELECT 'C', "id", "familyId", "createdAt" FROM "credit_cards"
), ranked AS (
  SELECT t, "id", row_number() OVER (PARTITION BY "familyId" ORDER BY "createdAt", "id") AS rn FROM src
)
UPDATE "credit_cards" c
SET "color" = (ARRAY['BLUE','GREEN','PURPLE','ORANGE','PINK','TEAL','RED','YELLOW','GRAY','BROWN'])[((r.rn - 1) % 10) + 1]::"AccountColor"
FROM ranked r WHERE r.t = 'C' AND r."id" = c."id";

ALTER TABLE "bank_accounts" ALTER COLUMN "color" SET DEFAULT 'BLUE', ALTER COLUMN "color" SET NOT NULL;
ALTER TABLE "credit_cards"  ALTER COLUMN "color" SET DEFAULT 'BLUE', ALTER COLUMN "color" SET NOT NULL;
