-- SEC-036 (revisão de LGPD 2026-10-25, D-GES-46): endurece as funções de trava de imutabilidade.
-- (1) `search_path` fixo em todas (sem depender do caminho de busca da sessão).
-- (2) `app.anonymize_user` passa a carregar o ID do titular e só permite trocar `changes.email` pelo e-mail
--     anonimizado DAQUELE titular em eventos INVITATION_RESENT (antes: "on" liberava qualquer `changes`).

CREATE OR REPLACE FUNCTION family_events_guard() RETURNS trigger LANGUAGE plpgsql
SET search_path = pg_catalog, public AS
$$ BEGIN
  IF TG_OP = 'DELETE' AND purge_family_bypass(to_jsonb(OLD)) THEN RETURN OLD; END IF;
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.anonymize_user', true), '') <> ''
     AND OLD."type" = 'INVITATION_RESENT' AND NEW."type" = 'INVITATION_RESENT'
     AND (to_jsonb(NEW) - 'changes') = (to_jsonb(OLD) - 'changes')
     AND (NEW."changes" - 'email') = (OLD."changes" - 'email')
     AND NEW."changes" ->> 'email' = 'deleted+' || current_setting('app.anonymize_user', true) || '@invalid.local' THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tabela % é append-only', TG_TABLE_NAME;
END $$;

ALTER FUNCTION purge_family_bypass(jsonb) SET search_path = pg_catalog, public;
ALTER FUNCTION forbid_mutation() SET search_path = pg_catalog, public;
ALTER FUNCTION ai_consent_append_only() SET search_path = pg_catalog, public;
ALTER FUNCTION mcp_audit_guard() SET search_path = pg_catalog, public;
ALTER FUNCTION tx_split_integrity() SET search_path = pg_catalog, public;
ALTER FUNCTION tx_sync_competence() SET search_path = pg_catalog, public;
ALTER FUNCTION installment_plan_paid_before_immutable() SET search_path = pg_catalog, public;
