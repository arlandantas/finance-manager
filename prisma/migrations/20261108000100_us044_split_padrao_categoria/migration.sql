-- US-044 (ADR-040): "dividir por padrão" na categoria e dispensa da revisão do mês encerrado.
-- Expand: coluna com DEFAULT (código anterior segue válido) e tabela nova.
ALTER TABLE "categories" ADD COLUMN "defaultSplit" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "settlement_review_dismissals" (
    "familyId" UUID NOT NULL,
    "periodKey" TEXT NOT NULL,
    "byMemberId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_review_dismissals_pkey" PRIMARY KEY ("familyId","periodKey")
);

ALTER TABLE "settlement_review_dismissals" ADD CONSTRAINT "settlement_review_dismissals_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "settlement_review_dismissals" ADD CONSTRAINT "settlement_review_dismissals_familyId_byMemberId_fkey" FOREIGN KEY ("familyId", "byMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
