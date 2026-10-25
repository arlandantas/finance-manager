-- SEC-017c (SDD-028 §7.4, US-080): marca a conta anonimizada. Aditiva e segura no `migrate deploy`.
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMPTZ(3);

-- A trilha de eventos da família é append-only (ADR-019). Única exceção desta migração: anonimizar o e-mail do
-- convidado gravado em INVITATION_RESENT quando o titular exclui a conta (LGPD). Só vale com `app.anonymize_user`
-- ligado na própria transação, só para esse tipo e só muda `changes`.
CREATE OR REPLACE FUNCTION family_events_guard() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.anonymize_user', true), '') = 'on'
     AND OLD."type" = 'INVITATION_RESENT' AND NEW."type" = 'INVITATION_RESENT'
     AND (to_jsonb(NEW) - 'changes') = (to_jsonb(OLD) - 'changes') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tabela % é append-only', TG_TABLE_NAME;
END $$;
DROP TRIGGER family_events_append_only ON "family_events";
CREATE TRIGGER family_events_append_only
  BEFORE UPDATE OR DELETE ON "family_events" FOR EACH ROW EXECUTE FUNCTION family_events_guard();
