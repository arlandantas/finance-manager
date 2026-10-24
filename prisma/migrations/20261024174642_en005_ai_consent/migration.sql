-- CreateEnum
CREATE TYPE "AiConsentAction" AS ENUM ('ENABLED', 'DISABLED');

-- AlterEnum
ALTER TYPE "FamilyEventType" ADD VALUE 'AI_CONSENT_CHANGED';

-- CreateTable
CREATE TABLE "ai_consent_events" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "purpose" "LlmPurpose" NOT NULL,
    "action" "AiConsentAction" NOT NULL,
    "textVersion" INTEGER NOT NULL,
    "memberId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_consent_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_consent_events_familyId_purpose_createdAt_idx" ON "ai_consent_events"("familyId", "purpose", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "ai_consent_events" ADD CONSTRAINT "ai_consent_events_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_consent_events" ADD CONSTRAINT "ai_consent_events_familyId_memberId_fkey" FOREIGN KEY ("familyId", "memberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- EN-005 (SDD-022 §5): prova de consentimento é append-only (LGPD art. 8º §2º).
ALTER TABLE "ai_consent_events" ADD CONSTRAINT ai_consent_text_version_chk CHECK ("textVersion" >= 1);

CREATE FUNCTION ai_consent_append_only() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'ai_consent_events is append-only' USING ERRCODE = 'check_violation';
END $$;

CREATE TRIGGER ai_consent_no_update BEFORE UPDATE OR DELETE ON "ai_consent_events"
  FOR EACH ROW EXECUTE FUNCTION ai_consent_append_only();
