-- US-092b (revisão do TL a73c88e): vínculo registrado (linkedAt) exige conta. Nenhuma linha atual tem linkedAt
-- (o primeiro vínculo é da 094b), então a CHECK nasce válida. Reversão: ALTER TABLE members DROP CONSTRAINT members_linked_has_user_chk;
ALTER TABLE members ADD CONSTRAINT members_linked_has_user_chk
  CHECK ("linkedAt" IS NULL OR "userId" IS NOT NULL) NOT VALID;
ALTER TABLE members VALIDATE CONSTRAINT members_linked_has_user_chk;
