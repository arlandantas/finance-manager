-- AlterTable
ALTER TABLE "bank_accounts" ADD COLUMN     "excludeFromAvailable" BOOLEAN NOT NULL DEFAULT false;

-- RenameForeignKey
ALTER TABLE "family_events" RENAME CONSTRAINT "family_events_actor_fkey" TO "family_events_familyId_actorMemberId_fkey";

-- RenameIndex
ALTER INDEX "family_events_family_at_idx" RENAME TO "family_events_familyId_at_idx";

-- RenameIndex
ALTER INDEX "members_family_user_idx" RENAME TO "members_familyId_userId_idx";
