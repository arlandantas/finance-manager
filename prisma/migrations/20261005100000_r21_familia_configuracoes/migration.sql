-- US-028 (SDD-011 §5): acerto opcional por família + trilha de eventos da família.
-- Famílias existentes ficam LIGADAS (settlementEnabled = true). Linhas de planned_expenses não mudam.

-- CreateEnum
CREATE TYPE "FamilyEventType" AS ENUM ('FAMILY_RENAMED', 'ROLE_CHANGED', 'SETTLEMENT_TOGGLED', 'MEMBER_REMOVED', 'MEMBER_LEFT', 'INVITATION_RESENT');

-- AlterTable
ALTER TABLE "families" ADD COLUMN "settlementEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedByMemberId" UUID;

-- Despesa prevista nasce "Só meu" (D-GES-15); linhas existentes inalteradas.
ALTER TABLE "planned_expenses" ALTER COLUMN "isSharedExpense" SET DEFAULT false;

-- CreateTable
CREATE TABLE "family_events" (
    "id" UUID NOT NULL,
    "familyId" UUID NOT NULL,
    "type" "FamilyEventType" NOT NULL,
    "actorMemberId" UUID NOT NULL,
    "targetMemberId" UUID,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "family_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_events_family_at_idx" ON "family_events"("familyId", "at" DESC);

-- AddForeignKey
ALTER TABLE "family_events" ADD CONSTRAINT "family_events_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "family_events" ADD CONSTRAINT "family_events_actor_fkey" FOREIGN KEY ("familyId", "actorMemberId") REFERENCES "members"("familyId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Append-only
CREATE TRIGGER family_events_append_only
  BEFORE UPDATE OR DELETE ON "family_events" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
