-- AlterTable
ALTER TABLE "categories" ADD COLUMN     "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedByMemberId" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- SQL cru (modelo-de-dados.md §7.3): nome único por (família, tipo) sem distinguir caixa/espaços nas pontas.
-- Inclui arquivadas. O índice exato (familyId, kind, name) do R1 permanece (redundante e inofensivo).
CREATE UNIQUE INDEX categories_family_kind_name_uq ON "categories" ("familyId", "kind", lower(btrim("name")));
