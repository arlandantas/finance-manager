-- SEC-018 fase 2 (SDD-028 §6.1, DEV-97): apaga o token de sessão em texto.
--
-- PENDENTE, NAO APLICAR AINDA. Esta pasta fica FORA de prisma/migrations de propósito: o `vercel-build` roda
-- `prisma migrate deploy` e aplicaria a fase 2 junto com a fase 1, derrubando as sessões abertas e quebrando o
-- código antigo que ainda serve durante o deploy.
--
-- Condição para promover (PR separado, ≥ 1 dia depois do deploy da fase 1 em produção):
--   1. `pnpm tsx scripts/sec018-phase2-check.ts --since <ISO do deploy da fase 1>` imprime 0
--      (count(*) de sessões com "sessionToken" preenchido criadas depois do deploy da fase 1);
--   2. mover esta pasta para prisma/migrations/ (nome com data posterior à última migração);
--   3. remover `sessionToken` do model Session em prisma/schema.prisma e rodar `pnpm db:generate`.
UPDATE "sessions" SET "sessionToken" = NULL;
ALTER TABLE "sessions" DROP COLUMN "sessionToken";
