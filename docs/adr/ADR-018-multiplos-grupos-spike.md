# ADR-018 — Spike: pessoa em mais de um grupo e conta privada no grupo

**Status:** aceito como diagnóstico e recomendação (sem implementação) · **Data:** 2026-10-04 · **Autor:** arquiteto

## Contexto
NEED-021 / Q-F08: avaliar o custo de (a) uma pessoa em vários grupos e (b) conta privada dentro do grupo, sem mudar comportamento.

## Decisão
- **Diagnóstico:** `Member` já é a tabela de junção `(userId, familyId)`; o vínculo é N:N estruturalmente e 1:1 por regra. A única trava é `Member @@unique([userId])` mais código que resolve **um** vínculo por usuário (`withApi`, `findMembershipByUserId`, `createFamily`, `acceptPendingInvitation`, `MeDTO.membership` singular). O ledger não vaza entre grupos: FKs compostas `(familyId, id)` e `ctx.familyId` único.
- **Não construir agora** (sem demanda concreta). Custo estimado: (a) multi-grupo com grupo ativo ≈ 13 pontos (índice parcial, `Session.activeMemberId`, `resolveMembership`, seletor, reset de cache); (b) conta privada ≈ 13–21 (`visibility` em conta/cartão, predicado único `visibleTo(memberId)`, decisão de acerto opt-in). RLS recomendada quando (a) for feito (≈ 5).
- **Preparar a custo ≈ 0:** índice **parcial** (`WHERE removedAt IS NULL`) no lugar de `UNIQUE(userId)`; ler o vínculo por **uma** função `findActiveMembership`; predicado único de leitura do ledger com gancho `visibleTo` no-op; toda tabela nova com `familyId` + FK composta; **proibido** criar unicidade global por `userId` fora de `Member`/`Session`.
- **Testes de isolamento propostos:** estrutural (toda tabela com `familyId` tem FK composta), canário (`CANARY-B-n` varrendo toda rota `GET /api/v1/**` como usuário da família A), lint de SQL cru exigindo `"familyId"`.

## Consequências
- Nenhuma mudança de comportamento. Ordem se for construído: (a), RLS, (b).
- (b) altera a premissa "todos veem tudo" apenas para contas marcadas privadas.
