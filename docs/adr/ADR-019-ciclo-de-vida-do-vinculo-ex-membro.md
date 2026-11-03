# ADR-019 — Ciclo de vida do vínculo (`Member`): ex-membro, saída e reconvite

**Status:** aceito (emenda ADR-012 §2; D-PO-18) · **Data:** 2026-10-04 · **Autor:** arquiteto

## Contexto
Remover um membro não pode apagar histórico: ledger, previstas, contas, cartões e revisões apontam para `(familyId, memberId)` com `ON DELETE RESTRICT`. `Member.userId UNIQUE` impediria reconvidar um ex-membro e uma futura 2ª família.

## Decisão
1. **`Member` nunca é apagado.** Colunas: `removedAt`, `removedByMemberId`, `removalKind` (`REMOVED | LEFT`), `removalNoticeAt`. Membro ativo ⇔ `removedAt IS NULL`. O nome é preservado ("Pago por Lucas (ex-membro)").
2. **Unicidade só entre ativos:** índices parciais `("userId") WHERE "removedAt" IS NULL` e `("familyId","userId") WHERE "removedAt" IS NULL`. **Uma** função `findActiveMembership(userId, db)` substitui as leituras diretas por `userId`; `DUPLICATE_MEMBER` considera só ativos.
3. **Reconvite:** o e-mail volta como **novo `Member`** (novo id e `joinedAt`); não reassume histórico.
4. **Acesso encerrado na hora:** sem vínculo ativo ⇒ `403 NO_FAMILY`. A sessão não é apagada. O gate trata "último vínculo `REMOVED` sem `removalNoticeAt`" encerrando a sessão, gravando o aviso e redirecionando a `/login?error=MembershipEnded`; depois do aviso (ou em `LEFT`) segue o fluxo normal.
5. **Remoção, saída e último Administrador** numa transação sob `pg_advisory_xact_lock('family:'||familyId)`: reavalia pendências, exige reatribuições, marca a remoção, grava `FamilyEvent` e impõe "último Administrador" contando `role = 'ADMIN' AND removedAt IS NULL` (segunda tentativa ⇒ `422 LAST_ADMIN`).
6. **Efeitos:** (a) acerto: participantes `EQUAL` = `joinedOn <= fim` e (`removedOn` nulo ou `>= início`); períodos passados não mudam; `stale` usa só ativos. (b) Seletores (pagador, responsável, titular) só ativos; referência a ex-membro ⇒ `422 INVALID_REFERENCE`. (c) `MemberRef.removed?: true`; nunca expõe e-mail. (d) Previstas do removido passam ao Administrador (ou escolhido). (e) Contas/cartões: titularidade reatribuída (obrigatório com saldo ≠ 0 ou fatura não paga) ou arquivados.
7. **`FamilyEvent` append-only** (`forbid_mutation`): `type` ∈ `FAMILY_RENAMED | ROLE_CHANGED | SETTLEMENT_TOGGLED | MEMBER_REMOVED | MEMBER_LEFT | INVITATION_RESENT`.

## Consequências
- Teste estrutural: nenhuma tabela referencia `members` com `ON DELETE CASCADE`.
- Retenção de dados pessoais de ex-membros e "excluir família" não são tratados aqui. Prepara múltiplos grupos (ADR-018).
