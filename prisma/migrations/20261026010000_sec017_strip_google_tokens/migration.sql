-- SEC-017a (SDD-028 §7.1): o app não usa os tokens do Google depois do login (estratégia de sessão em banco,
-- escopo openid email profile). Zera o que já foi guardado; o adaptador novo deixa de gravá-los.
UPDATE "accounts"
SET "access_token" = NULL, "refresh_token" = NULL, "id_token" = NULL, "session_state" = NULL
WHERE "access_token" IS NOT NULL OR "refresh_token" IS NOT NULL OR "id_token" IS NOT NULL OR "session_state" IS NOT NULL;
