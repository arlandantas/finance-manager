-- CreateTable
CREATE TABLE "credit_cards" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "institution" TEXT NOT NULL DEFAULT 'Outro',
    "ownerMemberId" UUID NOT NULL,
    "limitInCents" BIGINT NOT NULL,
    "closingDay" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedByMemberId" UUID,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credit_cards_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "credit_cards_familyId_id_key" ON "credit_cards"("familyId", "id");

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_familyId_ownerMemberId_fkey" FOREIGN KEY ("familyId", "ownerMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- SQL cru (modelo-de-dados.md §7.3)
ALTER TABLE "credit_cards" ADD CONSTRAINT credit_cards_limit_chk   CHECK ("limitInCents" > 0);
ALTER TABLE "credit_cards" ADD CONSTRAINT credit_cards_closing_chk CHECK ("closingDay" BETWEEN 1 AND 28);
ALTER TABLE "credit_cards" ADD CONSTRAINT credit_cards_due_chk     CHECK ("dueDay" BETWEEN 1 AND 28);
CREATE UNIQUE INDEX credit_cards_family_name_uq ON "credit_cards" ("familyId", lower(btrim("name")));
