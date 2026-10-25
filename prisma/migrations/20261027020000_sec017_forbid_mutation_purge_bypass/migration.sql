-- SEC-017d (SDD-028 §7.5, US-081): exceção controlada às travas de imutabilidade para excluir a FAMÍLIA INTEIRA.
-- O DELETE só passa quando a transação declarou `app.purge_family = '<familyId>'` (set_config(..., true)) e esse
-- valor é IGUAL ao "familyId" da linha apagada. Sem a variável, ou com a de outra família, tudo segue proibido.
-- UPDATE continua proibido em todos os casos.

CREATE OR REPLACE FUNCTION purge_family_bypass(old_row jsonb) RETURNS boolean LANGUAGE sql STABLE AS
$$ SELECT coalesce(current_setting('app.purge_family', true), '') <> ''
          AND current_setting('app.purge_family', true) = (old_row ->> 'familyId') $$;

-- transaction_revisions e transactions (DELETE)
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF TG_OP = 'DELETE' AND purge_family_bypass(to_jsonb(OLD)) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'tabela % é append-only', TG_TABLE_NAME;
END $$;

-- family_events (mantém a exceção de anonimização da SEC-017c)
CREATE OR REPLACE FUNCTION family_events_guard() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF TG_OP = 'DELETE' AND purge_family_bypass(to_jsonb(OLD)) THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.anonymize_user', true), '') = 'on'
     AND OLD."type" = 'INVITATION_RESENT' AND NEW."type" = 'INVITATION_RESENT'
     AND (to_jsonb(NEW) - 'changes') = (to_jsonb(OLD) - 'changes') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tabela % é append-only', TG_TABLE_NAME;
END $$;

-- prova de consentimento de IA
CREATE OR REPLACE FUNCTION ai_consent_append_only() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF TG_OP = 'DELETE' AND purge_family_bypass(to_jsonb(OLD)) THEN RETURN OLD; END IF;
  RAISE EXCEPTION 'ai_consent_events is append-only' USING ERRCODE = 'check_violation';
END $$;

-- auditoria do assistente (mantém o expurgo de 12 meses do cron)
CREATE OR REPLACE FUNCTION mcp_audit_guard() RETURNS trigger LANGUAGE plpgsql AS
$$ BEGIN
  IF TG_OP = 'DELETE' AND purge_family_bypass(to_jsonb(OLD)) THEN RETURN OLD; END IF;
  IF TG_OP = 'DELETE'
     AND coalesce(current_setting('app.mcp_purge', true), '') = 'on'
     AND OLD."createdAt" < now() - interval '12 months' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'mcp_audit_events is append-only' USING ERRCODE = 'check_violation';
END $$;
