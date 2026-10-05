-- US-039 (SDD-013 §5): reenvio de convite (rotação de token). Limite de 3 reenvios por convite.
ALTER TABLE "invitations" ADD COLUMN "resendCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "lastSentAt" TIMESTAMPTZ(3);
ALTER TABLE "invitations" ADD CONSTRAINT invitations_resend_chk CHECK ("resendCount" BETWEEN 0 AND 3);
