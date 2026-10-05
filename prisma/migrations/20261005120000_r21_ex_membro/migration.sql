-- US-035 (ADR-019, SDD-012 §5): ex-membro. `Member` nunca é apagado; unicidade só entre ativos.
CREATE TYPE "MemberRemovalKind" AS ENUM ('REMOVED', 'LEFT');

ALTER TABLE "members"
  ADD COLUMN "removedAt" TIMESTAMPTZ(3),
  ADD COLUMN "removedByMemberId" UUID,
  ADD COLUMN "removalKind" "MemberRemovalKind",
  ADD COLUMN "removalNoticeAt" TIMESTAMPTZ(3);

ALTER TABLE "members" ADD CONSTRAINT members_removal_chk CHECK (
  ("removedAt" IS NULL AND "removedByMemberId" IS NULL AND "removalKind" IS NULL)
  OR ("removedAt" IS NOT NULL AND "removalKind" IS NOT NULL));

DROP INDEX "members_userId_key";
DROP INDEX "members_familyId_userId_key";
CREATE UNIQUE INDEX members_user_active_uq ON "members" ("userId") WHERE "removedAt" IS NULL;
CREATE UNIQUE INDEX members_family_user_active_uq ON "members" ("familyId", "userId") WHERE "removedAt" IS NULL;
CREATE INDEX members_family_user_idx ON "members" ("familyId", "userId");
