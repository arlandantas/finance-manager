-- US-097 (spec 12): quem editou a assinatura por último ("alterada por {nome}" no 409). Expand puro: coluna
-- anulável sem default (sem reescrita de tabela) + FK composta. Reversão (antes de haver dados):
--   ALTER TABLE "card_subscriptions" DROP CONSTRAINT "card_subscriptions_familyId_updatedByMemberId_fkey";
--   ALTER TABLE "card_subscriptions" DROP COLUMN "updatedByMemberId";
ALTER TABLE "card_subscriptions" ADD COLUMN "updatedByMemberId" UUID;
ALTER TABLE "card_subscriptions" ADD CONSTRAINT "card_subscriptions_familyId_updatedByMemberId_fkey" FOREIGN KEY ("familyId", "updatedByMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
