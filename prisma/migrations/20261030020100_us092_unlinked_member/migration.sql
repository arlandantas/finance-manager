-- US-092a (SDD-033 §3.1, ADR-033 §2): membro SEM conta (só metadado). Expand, sem dados novos:
-- o código antigo nunca grava userId NULL, então esta migração pode ir à produção antes do código.
-- Reversão (até existir o primeiro sem conta): DROP TRIGGER members_link_guard; DROP FUNCTION members_link_guard();
-- DROP INDEX members_family_pending_email_uq, invitations_member_pending_uq; DROP CONSTRAINT (CHECKs e FKs abaixo);
-- DROP COLUMN (members.name, pendingEmail, linkedAt, createdByMemberId; invitations.memberId);
-- ALTER TABLE members ALTER COLUMN "userId" SET NOT NULL. Depois do primeiro sem conta, só removendo/vinculando
-- os cadastros (ponto sem volta). Valores de enum não se removem (inofensivos).
-- R5: o gatilho congela joinedAt apenas no UPDATE de vínculo (094b); script de manutenção que mexa em joinedAt
-- NESSE momento é recusado de propósito.

-- 1. vínculo pode existir sem usuário
ALTER TABLE members ALTER COLUMN "userId" DROP NOT NULL;

-- 2. colunas novas, nulas, sem default (instantâneo)
ALTER TABLE members
  ADD COLUMN name text,
  ADD COLUMN "pendingEmail" text,
  ADD COLUMN "linkedAt" timestamptz(3),
  ADD COLUMN "createdByMemberId" uuid;
ALTER TABLE members ADD CONSTRAINT members_created_by_fk
  FOREIGN KEY ("familyId", "createdByMemberId") REFERENCES members("familyId", id) ON DELETE RESTRICT NOT VALID;

-- 3. CHECKs (todas as linhas atuais têm userId, logo passam)
ALTER TABLE members ADD CONSTRAINT members_unlinked_has_name_chk
  CHECK ("userId" IS NOT NULL OR name IS NOT NULL) NOT VALID;
ALTER TABLE members ADD CONSTRAINT members_unlinked_is_member_chk
  CHECK ("userId" IS NOT NULL OR role = 'MEMBER') NOT VALID;
ALTER TABLE members ADD CONSTRAINT members_pending_email_chk
  CHECK ("pendingEmail" IS NULL OR ("userId" IS NULL AND "removedAt" IS NULL)) NOT VALID;
ALTER TABLE members ADD CONSTRAINT members_name_len_chk
  CHECK (name IS NULL OR char_length(name) BETWEEN 2 AND 60) NOT VALID;
ALTER TABLE members ADD CONSTRAINT members_pending_email_lower_chk
  CHECK ("pendingEmail" IS NULL OR "pendingEmail" = lower(btrim("pendingEmail"))) NOT VALID;
ALTER TABLE members VALIDATE CONSTRAINT members_created_by_fk;
ALTER TABLE members VALIDATE CONSTRAINT members_unlinked_has_name_chk;
ALTER TABLE members VALIDATE CONSTRAINT members_unlinked_is_member_chk;
ALTER TABLE members VALIDATE CONSTRAINT members_pending_email_chk;
ALTER TABLE members VALIDATE CONSTRAINT members_name_len_chk;
ALTER TABLE members VALIDATE CONSTRAINT members_pending_email_lower_chk;
CREATE UNIQUE INDEX members_family_pending_email_uq
  ON members ("familyId", "pendingEmail") WHERE "pendingEmail" IS NOT NULL;

-- 4. gatilho do vínculo (padrão SEC-036: search_path fixo; SEC-065: só IS DISTINCT FROM / IS NULL)
CREATE OR REPLACE FUNCTION members_link_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."familyId" IS DISTINCT FROM OLD."familyId"
     OR NEW."createdByMemberId" IS DISTINCT FROM OLD."createdByMemberId" THEN
    RAISE EXCEPTION 'members: id/familyId/createdByMemberId imutáveis' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."linkedAt" IS NOT NULL AND NEW."linkedAt" IS DISTINCT FROM OLD."linkedAt" THEN
    RAISE EXCEPTION 'members: linkedAt imutável' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."userId" IS NOT NULL AND NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'members: userId não troca nem volta a NULL' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."userId" IS NULL AND NEW."userId" IS NOT NULL THEN       -- UPDATE de vínculo (094b)
    -- SEC-065: só a transação do aceite liga a GUC com o id deste membro
    IF coalesce(current_setting('app.link_member', true), '') IS DISTINCT FROM OLD.id::text THEN
      RAISE EXCEPTION 'members: vínculo fora do aceite' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."removedAt" IS NOT NULL OR NEW."removedAt" IS NOT NULL
       OR NEW."pendingEmail" IS NOT NULL OR NEW."linkedAt" IS NULL OR NEW.name IS NULL
       OR NEW."joinedAt" IS DISTINCT FROM OLD."joinedAt" THEN
      RAISE EXCEPTION 'members: vínculo inválido' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW."linkedAt" IS DISTINCT FROM OLD."linkedAt" THEN
    RAISE EXCEPTION 'members: linkedAt só no vínculo' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER members_link_guard BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION members_link_guard();

-- 5. convite vinculado (uso a partir da 094a)
ALTER TABLE invitations ADD COLUMN "memberId" uuid;
ALTER TABLE invitations ADD CONSTRAINT invitations_member_fk
  FOREIGN KEY ("familyId", "memberId") REFERENCES members("familyId", id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX invitations_member_pending_uq
  ON invitations ("memberId") WHERE status = 'PENDING' AND "memberId" IS NOT NULL;
