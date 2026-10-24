-- CreateTable
CREATE TABLE "category_suggestion_dismissals" (
    "familyId" UUID NOT NULL,
    "descriptionKey" TEXT NOT NULL,
    "toCategoryId" UUID NOT NULL,
    "byMemberId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_suggestion_dismissals_pkey" PRIMARY KEY ("familyId","descriptionKey","toCategoryId")
);

-- AddForeignKey
ALTER TABLE "category_suggestion_dismissals" ADD CONSTRAINT "category_suggestion_dismissals_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_suggestion_dismissals" ADD CONSTRAINT "category_suggestion_dismissals_familyId_toCategoryId_fkey" FOREIGN KEY ("familyId", "toCategoryId") REFERENCES "categories"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "category_suggestion_dismissals" ADD CONSTRAINT "category_suggestion_dismissals_familyId_byMemberId_fkey" FOREIGN KEY ("familyId", "byMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
