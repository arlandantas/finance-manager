-- SEC-004: recusa de convite. Sem backfill: convites PENDING existentes passam a exigir aceite.
ALTER TABLE "invitations" ADD COLUMN "declinedAt" TIMESTAMPTZ(3), ADD COLUMN "declinedByUserId" UUID;
