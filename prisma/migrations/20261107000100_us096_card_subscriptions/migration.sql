-- US-096 (ADR-036, spec 12): assinatura mensal no cartão. Expand puro: só tabelas novas, sem lock em tabelas existentes
-- além do ShareRowExclusive das FKs. Reversão (antes de haver dados):
--   DROP TABLE "subscription_charges"; DROP TABLE "card_subscription_amounts"; DROP TABLE "card_subscriptions";
--   DROP TYPE "SubscriptionChargeStatus";
CREATE TYPE "SubscriptionChargeStatus" AS ENUM ('POSTED', 'SKIPPED_INVOICE_PAID', 'SKIPPED_CARD_ARCHIVED');

CREATE TABLE "card_subscriptions" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "cardId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "categoryId" UUID NOT NULL,
    "payerMemberId" UUID NOT NULL,
    "isSharedExpense" BOOLEAN NOT NULL DEFAULT false,
    "dayOfMonth" INTEGER NOT NULL,
    "firstChargeOn" DATE NOT NULL,
    "endMonth" DATE,
    "nextChargeOn" DATE,
    "endedAt" TIMESTAMPTZ(3),
    "endedOn" DATE,
    "endedByMemberId" UUID,
    "authorMemberId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "card_subscriptions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT card_subscriptions_day_chk CHECK ("dayOfMonth" BETWEEN 1 AND 31),
    CONSTRAINT card_subscriptions_ended_chk CHECK (
      ("endedAt" IS NULL AND "endedOn" IS NULL AND "endedByMemberId" IS NULL)
      OR ("endedAt" IS NOT NULL AND "endedOn" IS NOT NULL AND "endedByMemberId" IS NOT NULL))
);

CREATE TABLE "card_subscription_amounts" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "fromMonth" DATE NOT NULL,
    "amountInCents" BIGINT NOT NULL,
    "authorMemberId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "card_subscription_amounts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT card_subscription_amounts_amount_chk CHECK ("amountInCents" > 0)
);

CREATE TABLE "subscription_charges" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "subscriptionId" UUID NOT NULL,
    "chargeMonth" DATE NOT NULL,
    "chargeOn" DATE NOT NULL,
    "status" "SubscriptionChargeStatus" NOT NULL,
    "transactionId" UUID,
    "isAmended" BOOLEAN NOT NULL DEFAULT false,
    "sharedDowngraded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "subscription_charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT subscription_charges_posted_chk CHECK (("status" = 'POSTED') = ("transactionId" IS NOT NULL))
);

CREATE INDEX "card_subscriptions_familyId_endedAt_nextChargeOn_idx" ON "card_subscriptions"("familyId", "endedAt", "nextChargeOn");
CREATE INDEX "card_subscriptions_familyId_cardId_idx" ON "card_subscriptions"("familyId", "cardId");
CREATE UNIQUE INDEX "card_subscriptions_familyId_id_key" ON "card_subscriptions"("familyId", "id");
CREATE INDEX "card_subscription_amounts_familyId_subscriptionId_fromMonth_idx" ON "card_subscription_amounts"("familyId", "subscriptionId", "fromMonth");
CREATE UNIQUE INDEX "subscription_charges_familyId_subscriptionId_chargeMonth_key" ON "subscription_charges"("familyId", "subscriptionId", "chargeMonth");
CREATE UNIQUE INDEX "subscription_charges_familyId_transactionId_key" ON "subscription_charges"("familyId", "transactionId");

ALTER TABLE "card_subscriptions" ADD CONSTRAINT "card_subscriptions_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "card_subscriptions" ADD CONSTRAINT "card_subscriptions_familyId_cardId_fkey" FOREIGN KEY ("familyId", "cardId") REFERENCES "credit_cards"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "card_subscriptions" ADD CONSTRAINT "card_subscriptions_familyId_categoryId_fkey" FOREIGN KEY ("familyId", "categoryId") REFERENCES "categories"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "card_subscriptions" ADD CONSTRAINT "card_subscriptions_familyId_payerMemberId_fkey" FOREIGN KEY ("familyId", "payerMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "card_subscriptions" ADD CONSTRAINT "card_subscriptions_familyId_authorMemberId_fkey" FOREIGN KEY ("familyId", "authorMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "card_subscriptions" ADD CONSTRAINT "card_subscriptions_familyId_endedByMemberId_fkey" FOREIGN KEY ("familyId", "endedByMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "card_subscription_amounts" ADD CONSTRAINT "card_subscription_amounts_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "card_subscription_amounts" ADD CONSTRAINT "card_subscription_amounts_familyId_subscriptionId_fkey" FOREIGN KEY ("familyId", "subscriptionId") REFERENCES "card_subscriptions"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "card_subscription_amounts" ADD CONSTRAINT "card_subscription_amounts_familyId_authorMemberId_fkey" FOREIGN KEY ("familyId", "authorMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_familyId_subscriptionId_fkey" FOREIGN KEY ("familyId", "subscriptionId") REFERENCES "card_subscriptions"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
ALTER TABLE "subscription_charges" ADD CONSTRAINT "subscription_charges_familyId_transactionId_fkey" FOREIGN KEY ("familyId", "transactionId") REFERENCES "transactions"("familyId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT;
