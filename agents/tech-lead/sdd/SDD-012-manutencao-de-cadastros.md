# SDD-012: Manutenção de cadastros — arquivar/excluir conta e cartão, editar família e papéis, remover membro e sair (US-032, US-033, US-034, US-035)

- **Histórias**: [US-032](../../product-owner/backlog/stories/US-032-arquivar-reativar-e-excluir-conta.md) · [US-033](../../product-owner/backlog/stories/US-033-arquivar-e-reativar-cartao.md) · [US-034](../../product-owner/backlog/stories/US-034-editar-familia-e-papeis.md) · [US-035](../../product-owner/backlog/stories/US-035-remover-membro-e-sair-da-familia.md)
- **Fluxos**: [FLUXO-010](../../product-owner/flows/FLUXO-010-arquivar-conta-e-cartao.md), [FLUXO-011](../../product-owner/flows/FLUXO-011-familia-e-membros.md)
- **Rastreabilidade**: NEED-020 (RN-020.1..7), NEED-002, NEED-003 · Q-F07, Q-F11, Q-U02 (fora) · D-PO-02, D-PO-17, D-PO-18 · **[ADR-019](../adrs/ADR-019-ciclo-de-vida-do-vinculo-ex-membro.md)**, [ADR-007](../adrs/ADR-007-modelo-de-ledger-e-correcoes.md) (sem DELETE no ledger), [ADR-009](../adrs/ADR-009-idempotencia-e-controle-otimista.md), [ADR-013](../adrs/ADR-013-isolamento-por-familia.md), [ADR-014](../adrs/ADR-014-cartao-e-fatura-no-ledger.md), [ADR-018](../adrs/ADR-018-multiplos-grupos-spike.md) (costuras)
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-003](SDD-003-auth-familia-convite.md), [SDD-004](SDD-004-contas-e-ledger.md), [SDD-008](SDD-008-cartoes-fatura.md), [SDD-009](SDD-009-despesas-previstas.md), [SDD-011](SDD-011-acerto-opcional-rotulo-e-previa.md) (`FamilyEvent`, `pendingSettlementMonths`, `Family.version`) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md) §8
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA

---

## 1. Gaps técnicos e decisões

| Gap / Pergunta do PO | Resolução |
| :-- | :-- |
| Arquivamento: `archivedAt` como em categorias? | **Sim**: `archivedAt`, `archivedByMemberId` em `bank_accounts` e `credit_cards` (reaproveitam `version` existente). Reativar = `archivedAt = NULL`. |
| **"Excluir de verdade"** (US-032/033) | O ledger **proíbe `DELETE`** (trigger `transactions_no_delete`, revisões *append-only*, ADR-007) e **toda conta nasce com um `OPENING`** (mesmo de saldo zero, `contas/service.ts`) e uma revisão. Portanto o *hard delete* é impossível sem desligar proteções. **Decisão**: "excluir" = **exclusão lógica terminal**: `deletedAt`, `deletedByMemberId` na conta/cartão; some de **todas** as telas (inclusive "arquivadas"), **libera o nome** (índice único passa a ser parcial `WHERE deletedAt IS NULL`) e não pode ser reativada. Efeito observável idêntico ao pedido pelo PO. Registrado em TL-04. |
| "Nunca teve movimentação" | Conta: **não existe** `Transaction` (ativa, excluída ou desfeita) com `accountId = :id` **exceto** o `OPENING` com `amountInCents = 0` da criação. Cartão: não existe `Transaction` com `cardId = :id` (compra, pagamento, em qualquer estado) **nem** `card_invoices` com compra. Uma conta criada com saldo ≠ 0 já tem `OPENING` ≠ 0 ⇒ só arquiva (como diz a US-032). Uma transferência que zerou o saldo ⇒ tem histórico ⇒ só arquiva. |
| Invariantes do ledger com conta arquivada | (1) **Arquivar** exige saldo zero **dentro de um lock**; (2) **nenhuma postagem nova** em conta/cartão arquivado; (3) **nenhuma alteração** que mude o saldo de conta arquivada (editar valor/conta, excluir, restaurar lançamento dela) até reativar: `422 ACCOUNT_ARCHIVED_LOCKED` ("Reative a conta para alterar este lançamento"). Leituras (Extrato, detalhe, histórico, relatórios) seguem normais com o marcador "(arquivada)". Protocolo de lock em §4.1. |
| Permissão | D-PO-02: **qualquer membro** arquiva/reativa conta e cartão; **só ADMIN** exclui. Editar família/papel: ADMIN. Remover membro: ADMIN; **sair**: o próprio membro. |
| Arquivar a última conta ativa | **Permitido** com aviso na UI (a lista de contas ativas já está no cliente). O servidor não bloqueia; `DEV-21` (drawer com contas **ou** cartões) já cobre o formulário. |
| Cartão arquivado × faturas | Bloqueios (em ordem): fatura **fechada/vencida não paga** ⇒ `CARD_HAS_UNPAID_INVOICE`; fatura **aberta com compras** ⇒ `CARD_HAS_OPEN_PURCHASES`; (R3) parcelas futuras ⇒ `CARD_HAS_FUTURE_INSTALLMENTS` (reservado no SDD-014). A consulta reusa `invoiceTotals`/`cardUsage` (SDD-008 §4.2): "total de compras ativas > 0 em fatura **sem pagamento ativo**". |
| Modelo de ex-membro, sessão e e-mail reutilizável | **ADR-019** (decisão e motivos). Resumo: `Member` nunca é apagado; `removedAt/By/Kind`; unicidade só entre ativos; reconvite cria **novo** `Member`; acesso encerrado por `403 NO_FAMILY`; aviso único via rota de saída. |
| Garantia atômica do "último Administrador" | `pg_advisory_xact_lock(hashtextextended('family:'||familyId, 0))` em **toda** operação que rebaixa/remove/sai, e, dentro dele, `SELECT … FOR UPDATE` dos `Member` `ADMIN` ativos + contagem. Teste de `Promise.all` obrigatório. |
| Reatribuição de titularidade em lote | Corpo único de `remove` com mapas `accounts` e `cards` (`id ⇒ novoTitular`) e `plannedTo`; tudo ou nada na mesma transação. |
| Trilha simples "autor e data" (US-034) | `FamilyEvent` (append-only, SDD-011 §5). A tela Família lista os últimos 20 eventos (`GET /family` ganha `events`). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/contas/schemas.ts  (acréscimos)
export const ArchiveAccountSchema   = z.object({ version: versionSchema }).strict();   // archive / unarchive / delete
export type AccountDTO = AccountDTOv1 & {
  archived: boolean; archivedAt: string | null;
  neverUsed: boolean;                 // base de "Excluir" (a UI só mostra a ação a ADMIN)
  usageCountByMe: number;             // SDD-013 (sugestão de conta)
};
// GET /api/v1/accounts?archived=false|true|all   (padrão false: só ativas; saldo total da família só de ATIVAS)
// TransactionDTO.account e .card ganham: archived: boolean   (marcador "(arquivada)" no histórico)

// src/modules/cartoes/schemas.ts
export const ArchiveCardSchema = z.object({ version: versionSchema }).strict();
export type CardDTO = CardDTOv1 & { archived: boolean; archivedAt: string | null; neverUsed: boolean };

// src/modules/familia/schemas.ts
export const UpdateFamilySchema = z.object({
  version: versionSchema,
  name: z.string().trim().min(2, "Informe um nome com 2 a 60 caracteres").max(60, "Informe um nome com 2 a 60 caracteres"),
}).strict();
export const ChangeRoleSchema = z.object({ role: RoleSchema }).strict();
export const RemoveMemberSchema = z.object({
  acknowledgeSettlement: z.boolean().default(false),
  reassign: z.object({
    accounts: z.record(uuidSchema, uuidSchema).default({}),     // contaId => novo titular
    cards: z.record(uuidSchema, uuidSchema).default({}),        // cartaoId => novo titular
    plannedTo: uuidSchema.optional(),                           // padrão: quem remove (na saída: um ADMIN ativo escolhido)
  }).strict().default({}),
}).strict();

export type MemberRef = { id: string; name: string; image: string | null; removed?: true };   // SDD-000 §6 ganha `removed`
export type FamilyDTO = FamilyDTOv1 & {
  family: { id: string; name: string; version: number; settlementEnabled: boolean };
  members: Array<MemberDTOv1 & { canChangeRole: boolean; canRemove: boolean }>;     // só ATIVOS
  exMembers: MemberRef[];                                                              // histórico (nome, sem e-mail)
  events: Array<{ type: FamilyEventType; actor: MemberRef; target: MemberRef | null; at: string }>;   // até 20
};
export type RemovalReviewDTO = {
  member: MemberRef; isSelf: boolean;
  settlement: { enabled: boolean; totalInCents: number; months: Array<{ period: string; toSettleInCents: number }> };   // acertos em aberto ENVOLVENDO o membro
  accounts: Array<{ id: string; name: string; balanceInCents: number; mustReassign: boolean; defaultAction: "ARCHIVE" | "REASSIGN" }>;
  cards: Array<{ id: string; name: string; unpaidInCents: number; mustReassign: boolean; defaultAction: "ARCHIVE" | "REASSIGN" }>;
  planned: Array<{ id: string; description: string; dueOn: string }>;                  // PREVISTO sob responsabilidade dele
  candidates: MemberRef[];                                                              // ativos, exceto o membro
  blockers: Array<"LAST_ADMIN" | "ONLY_MEMBER">;
};
```

---

## 3. Contratos de API (`auth: "family"`; mutações com `Idempotency-Key`)

### 3.1 Contas e cartões
| Rota | Papel | Corpo | Sucesso | Erros |
| :-- | :-- | :-- | :-- | :-- |
| `POST /api/v1/accounts/:id/archive` | todos | `ArchiveAccountSchema` | `200 { account }` | 404 · 409 `VERSION_CONFLICT` "Esta conta foi alterada por {Nome}. Recarregue para continuar." · 409 `ALREADY_ARCHIVED` · **422 `ACCOUNT_BALANCE_NOT_ZERO`** "Para arquivar, o saldo precisa ser zero. Transfira ou ajuste o saldo antes." (`details: { balanceInCents }`) |
| `POST /api/v1/accounts/:id/unarchive` | todos | idem | `200 { account }` | 404 · 409 `VERSION_CONFLICT` · 409 `NOT_ARCHIVED` |
| `POST /api/v1/accounts/:id/delete` | **ADMIN** | idem | `200 { deleted: true }` | 403 · 404 · 409 `VERSION_CONFLICT` · **422 `ACCOUNT_HAS_HISTORY`** "Esta conta tem histórico e só pode ser arquivada" |
| `GET /api/v1/accounts?archived=` | todos | — | `200` (SDD-004; `archived=true` lista só as arquivadas, `all` ambas) | 400 |
| `POST /api/v1/cards/:id/archive` | todos | `ArchiveCardSchema` | `200 { card }` | 404 · 409 `VERSION_CONFLICT` · 409 `ALREADY_ARCHIVED` · **422 `CARD_HAS_UNPAID_INVOICE`** "Pague a fatura antes de arquivar o cartão" (`details: { ref }`) · **422 `CARD_HAS_OPEN_PURCHASES`** "Há compras na fatura aberta. Pague a fatura quando ela fechar para arquivar." |
| `POST /api/v1/cards/:id/unarchive` · `POST /api/v1/cards/:id/delete` (ADMIN, `422 CARD_HAS_HISTORY` "Este cartão tem compras e só pode ser arquivado") | — | — | análogos | análogos |
Alterações nas rotas existentes: **postar** (despesa/receita/transferência/acerto/pagamento de fatura/baixa) numa conta ou cartão **arquivado** ⇒ `422 INVALID_REFERENCE` (`path: accountId|cardId`, "Escolha uma conta" / "Escolha um cartão"); `PATCH` (renomear) em arquivada ⇒ `422 ACCOUNT_ARCHIVED_LOCKED`; editar/excluir/restaurar lançamento de conta arquivada ⇒ `422 ACCOUNT_ARCHIVED_LOCKED`. `GET /transactions` **continua** devolvendo o histórico, com `archived: true` no `account`/`card`.

### 3.2 Família e membros
| Rota | Papel | Corpo | Sucesso | Erros |
| :-- | :-- | :-- | :-- | :-- |
| `PATCH /api/v1/family` | **ADMIN** | `UpdateFamilySchema` | `200 { family }` (+ `FamilyEvent FAMILY_RENAMED`) | 400 "Informe um nome com 2 a 60 caracteres" · 403 · 409 `VERSION_CONFLICT` "A família foi alterada por {Nome}. Recarregue para continuar." (`Family.updatedByMemberId`) |
| `PATCH /api/v1/members/:id` | **ADMIN** | `ChangeRoleSchema` | `200 { member }` (+ `ROLE_CHANGED`) | 403 · 404 (outra família) · **422 `LAST_ADMIN`** "A família precisa de pelo menos um Administrador. Promova outro membro antes." |
| `GET /api/v1/members/:id/removal-review` | **ADMIN** | — | `200 RemovalReviewDTO` | 403 · 404 |
| `POST /api/v1/members/:id/remove` | **ADMIN** | `RemoveMemberSchema` | `200 { removed: true }` (+ `MEMBER_REMOVED`) | 403 · 404 · **422 `REMOVAL_BLOCKED`** (`details.blockers: Array<{ code: "LAST_ADMIN" \| "ONLY_MEMBER" \| "SETTLEMENT_NOT_ACKNOWLEDGED" \| "ACCOUNT_NEEDS_OWNER" \| "CARD_NEEDS_OWNER" \| "INVALID_REASSIGN_TARGET"; ids?: string[] }>`, mensagem do 1º) |
| `GET /api/v1/family/leave-review` · `POST /api/v1/family/leave` | todos | idem (o alvo é o próprio) | `200 RemovalReviewDTO` · `200 { left: true }` (+ `MEMBER_LEFT`) | 422 `REMOVAL_BLOCKED` |
| `GET /api/auth/membership-ended` | — (cookie) | — | `302 /login?error=MembershipEnded` (encerra a sessão e grava `removalNoticeAt`) | — |
Mensagens exatas dos bloqueios: `LAST_ADMIN` (remoção/saída): **"Você é a única pessoa Administradora. Promova outro membro antes de sair."** (texto **neutro**; o BDD da US-035 usa "única Administradora" — ajuste ao PO em TL-06); `ONLY_MEMBER`: **"Você é a única pessoa na família. Convide alguém antes de sair."**; `SETTLEMENT_NOT_ACKNOWLEDGED`: "Há R$ {X} a acertar entre vocês"; `ACCOUNT_NEEDS_OWNER`: "A conta {Nome} tem saldo. Passe a titularidade para outro membro."; `CARD_NEEDS_OWNER`: "O cartão {Nome} tem fatura em aberto. Passe a titularidade para outro membro."
**`403 NO_FAMILY`** passa a ser devolvido a quem foi removido na **próxima** requisição (ADR-019 §4).

---

## 4. Regras e algoritmos

### 4.1 Arquivar conta/cartão e protocolo de lock (anti-corrida)
- **Arquivar** (transação): `SELECT … FROM bank_accounts WHERE id AND familyId FOR UPDATE` (`FOR UPDATE` conflita com o `FOR SHARE`/KEY SHARE de qualquer postagem em andamento); `version` divergente ⇒ `409`; `archivedAt` ≠ NULL ⇒ `409 ALREADY_ARCHIVED`; `balance = accountBalances(...)` (leitura **depois** do lock); `≠ 0` ⇒ `422 ACCOUNT_BALANCE_NOT_ZERO`; `UPDATE … SET archivedAt = now(), archivedByMemberId, version = version+1 WHERE … AND version = :v`.
- **Postar** em conta (SDD-001/004/008/009): função única `lockAccountsForPosting(tx, familyId, ids[])` — `SELECT … FOR SHARE` **em ordem crescente de `id`** (sem *deadlock*) e checagem `archivedAt IS NULL AND deletedAt IS NULL` **depois** do lock ⇒ senão `INVALID_REFERENCE`. Chamada por `createExpenseCore`, `createIncome`, `createTransferGroup` (as duas contas), `registerSettlement` (via `createTransferGroup`), `payInvoice`, `payPlannedExpense` (via `createExpenseCore`). Compra no cartão já usa `FOR SHARE` no cartão (`getOrCreateInvoice`, SDD-008 §4.3); acrescenta-se a checagem de `archivedAt`.
- **Resultado**: ou a postagem comita antes (e o arquivamento enxerga o saldo ≠ 0 ⇒ recusa) ou o arquivamento comita antes (e a postagem recusa). **Nunca** conta arquivada com saldo ≠ 0 por corrida (teste `Promise.all`).
- **Editar/excluir/restaurar** lançamento de conta arquivada: carrega a conta com `FOR SHARE` e recusa com `ACCOUNT_ARCHIVED_LOCKED`.
- **Excluir** (ADMIN): mesmo lock `FOR UPDATE`; `neverUsed` recalculado dentro do lock (§1); `deletedAt = now()` + `version+1`; **não** toca no ledger.
- **Cartão**: `FOR UPDATE` no cartão; verificações de §1 (ordem: fechada/vencida não paga ⇒ aberta com compras ⇒ [R3] parcelas futuras); a consulta é a de `cardUsage`/`invoiceTotals` filtrada por `invoice` sem pagamento ativo e `total > 0`.
- **Seletores e leituras**: `listAccounts`/`listCards` (padrão) e todos os seletores (`Pagar com`, transferência, baixa, acerto, titular) usam `archivedAt IS NULL AND deletedAt IS NULL`; **saldo da família** soma só contas ativas; `deletedAt` nunca aparece em tela alguma (nem no histórico: o histórico mostra o **nome** via `JOIN` sem filtro de `deletedAt`, caso contrário perderíamos o nome nas linhas antigas — **conta excluída não tem linhas**, pois `neverUsed`).
- **Transferir o saldo**: botão leva a `/contas?transfer=1&from=<id>&amount=<balance>` (o formulário aceita *query params* de pré-preenchimento; sem mudança de API). Saldo **negativo** não é "transferir o saldo": a UI oferece "Transferir para esta conta" com origem aberta e valor `|saldo|`.

### 4.2 Editar a família e papéis (US-034)
`updateFamily`: `FOR UPDATE` em `families`; `version` ⇒ `409`; `UPDATE name, version+1, updatedByMemberId`; `FamilyEvent(FAMILY_RENAMED, changes: { name: { from, to } })`. `changeRole(memberId, role)`: lock de família (§ADR-019 §5); `target` ativo da família (senão `404`); rebaixar `ADMIN` quando `COUNT(ADMIN ativos) = 1` ⇒ `422 LAST_ADMIN`; sem mudança ⇒ `200` sem evento; efeito **imediato** (o `withApi` relê o papel a cada requisição, sem *cache*). Nome novo aparece no cabeçalho (`MeDTO.membership.familyName`; invalidar `["me"]`, `["family"]`); convites **já enviados** mantêm o nome do e-mail original (nada a fazer).

### 4.3 Revisão e remoção de membro (US-035) — `removeMemberCore(tx, ctx, target, body, kind)`
1. Lock de família; carregar `target` **ativo** (senão `404`); `kind = target.id === ctx.memberId ? LEFT : REMOVED`; `REMOVED` exige `ADMIN`.
2. Bloqueios: `ONLY_MEMBER` (membros ativos = 1); `LAST_ADMIN` (alvo é ADMIN e é o último).
3. **Acerto** (se `settlementEnabled`): `pendingSettlementMonths(todos)` filtrado a sugestões **que envolvem o alvo** ⇒ `total > 0` exige `acknowledgeSettlement = true` (`SETTLEMENT_NOT_ACKNOWLEDGED`). A diferença **continua registrada** (nada é apagado).
4. **Contas do alvo** (`ownerMemberId = alvo`, não excluídas): saldo ≠ 0 ⇒ **precisa** de entrada em `reassign.accounts` (`ACCOUNT_NEEDS_OWNER`); saldo = 0 e sem entrada ⇒ **arquivada** (Q-F07); com entrada ⇒ `ownerMemberId = novo` (alvo da reatribuição = membro **ativo** diferente do removido, senão `INVALID_REASSIGN_TARGET`).
5. **Cartões**: fatura não paga com total > 0 ⇒ precisa reatribuir; sem pendência e sem entrada ⇒ arquivado.
6. **Previstas** `PREVISTO` do alvo: `responsibleMemberId = plannedTo ?? ctx.memberId` (na saída, `plannedTo` é **obrigatório** e deve ser ADMIN ativo).
7. `UPDATE members SET removedAt = now(), removedByMemberId = ctx.memberId, removalKind = :kind`; `FamilyEvent`; **não** se apaga sessão (ADR-019 §4).
8. Resposta; a reavaliação do passo 2..5 ocorre **dentro do lock** (a revisão da UI pode estar velha).
**Idempotente** (`Idempotency-Key`); duplo clique com chaves diferentes ⇒ a 2ª recebe `404` (alvo já removido).
**Motor do acerto**: `computeSettlement` passa a receber `removedOn` por membro (ADR-019 §6). Períodos que terminam antes da remoção **não mudam**; períodos posteriores não incluem o ex-membro como participante `EQUAL`; despesas **pagas** pelo ex-membro continuam creditadas a ele; a diferença aberta com ele permanece no painel ("Acerto em aberto continua registrado após a remoção"). `stale`/`SHARES_MEMBER_MISMATCH` consideram só ativos (nova regra a definir pelo Administrador). **Vetores novos** (SDD-002 §4.7): **S14** (3 membros `EQUAL`; X removido em 15/10; período 2026-10 com X ativo até 15/10 ⇒ X participa — `removedOn >= start`; período 2026-11 ⇒ X **não** participa), **S15** (despesa paga por ex-membro: crédito preservado), **S16** (regra `PROPORTIONAL` com ex-membro ⇒ `stale`).
**Gate de entrada** (`resolveAppEntry`): sem vínculo ativo ⇒ (1) `acceptPendingInvitation` (reconvite); (2) último vínculo `REMOVED` com `removalNoticeAt IS NULL` ⇒ `redirect("/api/auth/membership-ended")`; (3) `/onboarding`.
**Reconvite**: `createInvitation` ignora ex-membros no `DUPLICATE_MEMBER`; `acceptPendingInvitation` cria **novo** `Member` (índice parcial permite).

### 4.4 Costuras do ADR-018 (obrigatórias aqui)
Função única `findActiveMembership(userId, db)` (substitui as 4 leituras por `userId`); índices parciais em `members`; teste estrutural "nenhuma FK para `members` com `ON DELETE CASCADE`" e **teste canário de isolamento** (ADR-018 §2, itens 1 e 2).

---

## 5. Dados e migrações (SQL cru; nunca editar migração aplicada)

**`r21_arquivamento`** (US-032/033):
```sql
ALTER TABLE "bank_accounts" ADD COLUMN "archivedAt" TIMESTAMPTZ(3), ADD COLUMN "archivedByMemberId" UUID,
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3), ADD COLUMN "deletedByMemberId" UUID;
ALTER TABLE "credit_cards"   ADD COLUMN "archivedAt" TIMESTAMPTZ(3), ADD COLUMN "archivedByMemberId" UUID,
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3), ADD COLUMN "deletedByMemberId" UUID;
-- o nome só é liberado quando a conta/cartão é EXCLUÍDO (arquivada continua ocupando o nome)
DROP INDEX bank_accounts_family_name_uq;
CREATE UNIQUE INDEX bank_accounts_family_name_uq ON "bank_accounts" ("familyId", lower(btrim("name"))) WHERE "deletedAt" IS NULL;
DROP INDEX credit_cards_family_name_uq;
CREATE UNIQUE INDEX credit_cards_family_name_uq ON "credit_cards" ("familyId", lower(btrim("name"))) WHERE "deletedAt" IS NULL;
```
Invariantes de arquivamento/exclusão (saldo zero, "nunca usada") são garantidos por **serviço dentro do lock** (§4.1); não há `CHECK` para isso. Índice de apoio: `CREATE INDEX bank_accounts_family_active_idx ON "bank_accounts" ("familyId") WHERE "archivedAt" IS NULL AND "deletedAt" IS NULL;` (idem cartões).

**`r21_ex_membro`** (US-035; **pré-requisito de US-035 e da costura do ADR-018**):
```sql
CREATE TYPE "MemberRemovalKind" AS ENUM ('REMOVED','LEFT');
ALTER TABLE "members" ADD COLUMN "removedAt" TIMESTAMPTZ(3), ADD COLUMN "removedByMemberId" UUID,
  ADD COLUMN "removalKind" "MemberRemovalKind", ADD COLUMN "removalNoticeAt" TIMESTAMPTZ(3);
ALTER TABLE "members" ADD CONSTRAINT members_removal_chk CHECK (
  ("removedAt" IS NULL AND "removedByMemberId" IS NULL AND "removalKind" IS NULL)
  OR ("removedAt" IS NOT NULL AND "removalKind" IS NOT NULL));
DROP INDEX "members_userId_key";
DROP INDEX "members_familyId_userId_key";
CREATE UNIQUE INDEX members_user_active_uq        ON "members" ("userId")            WHERE "removedAt" IS NULL;
CREATE UNIQUE INDEX members_family_user_active_uq ON "members" ("familyId","userId") WHERE "removedAt" IS NULL;
CREATE INDEX members_family_user_idx ON "members" ("familyId","userId");
```
`schema.prisma`: remover `@@unique([userId])` e `@@unique([familyId, userId])`, acrescentar `@@index([familyId, userId])` e comentário "unicidade parcial em SQL cru (r21_ex_membro)". **Os dados existentes continuam válidos** (todos ativos). `family_events` vem de `r21_familia_configuracoes` (SDD-011 §5). Sem `DELETE` em nenhuma tabela do ledger. Rodar **toda** a suíte após as duas migrações.

---

## 6. Interface
- **Contas (`/contas`)**: menu "…" **rotulado** por linha (`Arquivar`, `Excluir` só ADMIN e só `neverUsed`); seção recolhida **"Contas arquivadas (N)"** com `Reativar`; bloqueio por saldo com botão **Transferir o saldo**; aviso ao arquivar a última conta ativa; marcador "(arquivada)" no Extrato/detalhe. **Cartões (`/cartoes`)** idem, com a mensagem do motivo e o próximo passo.
- **Família (`/familia`)**: cartão com o nome (lápis "Editar nome", só ADMIN), lista de membros ativos com menu "…" (`Alterar papel`, `Remover`), `Sair da família`, seção "Ex-membros", trilha dos últimos eventos, convites (US-039). **Diálogo de remoção em duas etapas**: (1) revisão (`removal-review`: acerto com checkbox "Reconheço a diferença de R$ X", contas/cartões com seletor de novo titular, previstas com responsável sugerido); botão destrutivo só habilita com pendências resolvidas; (2) confirmação textual "Remover {Nome}". Concorrência: `409` ⇒ diálogo padrão (SDD-000 §7).
- **Cache**: arquivar/excluir/reativar invalidam `["accounts"]`, `["cards"]`, `["home"]`, `["transactions"]`; família/papel: `["family"]`, `["me"]`; remoção/saída: tudo (`queryClient.clear()` na saída, seguida de navegação).
- Estados: skeleton, vazio ("Nenhuma conta arquivada"), erro, sem conexão — padrão do SDD-000 §7; 375/1280 px; alvos ≥ 44 px; ações com texto (nada só em ícone).

---

## 7. Segurança e isolamento
Matriz de permissão testada em **todas** as rotas novas (ADMIN × MEMBER × sem sessão). Recurso de outra família ⇒ `404` (conta, cartão, membro, previsão a reatribuir ⇒ `INVALID_REFERENCE`). `.strict()` rejeita `familyId`, `removedAt`, `archivedAt`. Reatribuição só para **membros ativos da mesma família**. O e-mail do ex-membro **não** vai em `MemberRef`. Logs sem nome/valores.

---

## 8. Testes obrigatórios (BDD → teste) — U/C/I/E como no SDD-010

### US-032 (ordem 11)
| Cenário BDD | Testes |
| :-- | :-- |
| Arquivar com saldo zero / some dos seletores / histórico com marcador / saldo da família ignora | **I**: `POST /accounts/:id/archive` ⇒ 200, `archived true`; `GET /accounts` não a lista; `GET /transactions` mantém linhas com `account.archived true`; `balances.totalInCents` sem ela. **E**: lista, "Pagar com" e Extrato "Poupança (arquivada)". |
| Saldo ≠ 0 bloqueia + Transferir o saldo | **I**: 422 `ACCOUNT_BALANCE_NOT_ZERO` com `details.balanceInCents 300000`. **E**: botão leva ao formulário com origem "Itaú Lucas" e "R$ 3.000,00". |
| Reativar | **I**: `unarchive` ⇒ volta a `GET /accounts` e a "Pagar com" com saldo 0. |
| Excluir sem movimentação / só arquivar com histórico / Membro não exclui | **I**: ADMIN `delete` ⇒ 200; conta some de **todas** as listas (inclusive `archived=all`) e o **nome é liberado** (criar outra com o mesmo nome ⇒ 201); com histórico ⇒ 422 `ACCOUNT_HAS_HISTORY`; MEMBER ⇒ 403. **E**: menu sem "Excluir" para conta com histórico e para Membro. |
| Conflito de versão / Duplo clique / Isolamento | **I**: dois `archive` com mesma `version` em `Promise.all` ⇒ 1×200 e 1×409 "Esta conta foi alterada por Mariana…"; mesma chave ⇒ 1 efeito; conta de outra família ⇒ 404. |
| (infra) **Corrida postagem × arquivamento** | **I**: `Promise.all([createExpense(contaX, 100), archive(contaX)])` com saldo 0 ⇒ **ou** a despesa grava e o arquivamento recebe 422, **ou** o arquivamento vence e a despesa recebe `INVALID_REFERENCE`; **jamais** conta arquivada com saldo ≠ 0 (10 repetições, ambas as ordens; mesmo para transferência e pagamento de fatura). |
| (infra) Travas de lançamento | **I**: `PATCH/delete/restore` de lançamento de conta arquivada ⇒ 422 `ACCOUNT_ARCHIVED_LOCKED`; postar em conta arquivada ⇒ `INVALID_REFERENCE`; `deadlock` ausente ao travar duas contas em ordem (transferência cruzada em `Promise.all`). |
| (infra) Migração | **I** (`migrations.int.test`): colunas e índices parciais; nome de conta **arquivada** continua ocupado; excluída libera. |
| (infra) Última conta ativa | **E**: aviso "Sem contas ativas você não poderá lançar despesas em conta nem pagar faturas." |

### US-033 (ordem 12)
| Cenário BDD | Testes |
| :-- | :-- |
| Arquivar sem pendências / some do Pagar com / compras antigas no Extrato com "(arquivado)" / Reativar | **I/E** análogos à conta. |
| Fatura em aberto (fechada, aberta com compras) bloqueia | **I**: fechada não paga ⇒ 422 `CARD_HAS_UNPAID_INVOICE`; aberta com compra 9000 ⇒ 422 `CARD_HAS_OPEN_PURCHASES`; paga ⇒ 200. **E**: mensagens exatas. |
| Excluir só sem compras / cartão com compras só arquiva / Membro arquiva mas não exclui / Isolamento | **I**: `delete` ⇒ 200 (cartão novo), 422 `CARD_HAS_HISTORY`; MEMBER ⇒ 403; outra família ⇒ 404. |
| (infra) Corrida compra × arquivamento | **I**: `Promise.all([compra no cartão, archive])` ⇒ ou compra grava e arquivamento recusa (`CARD_HAS_OPEN_PURCHASES`), ou arquivamento vence e a compra recusa; nunca cartão arquivado com compra aberta. |
| (infra) Parcelas futuras | **I** (R3): gancho `CARD_HAS_FUTURE_INSTALLMENTS` reservado (teste *skipped* até o SDD-014). |

### US-034 (ordem 13)
| Cenário BDD | Testes |
| :-- | :-- |
| Editar nome / vazio ou curto / Membro não edita | **U**: schema "Informe um nome com 2 a 60 caracteres" para `""`, `"a"`, 61 caracteres. **I**: `PATCH /family` ADMIN ⇒ 200 `version 2` + `FamilyEvent`; MEMBER ⇒ 403. **E**: cabeçalho "Casa Silva". |
| Promover / Rebaixar com outro Administrador | **I**: `PATCH /members/:id` ⇒ 200 + `ROLE_CHANGED`; chave de acerto habilitada para o novo Admin (leitura de `canEdit`). **E**. |
| Último Administrador não pode ser rebaixado | **I**: 422 `LAST_ADMIN`; **corrida**: dois Administradores rebaixam-se mutuamente em `Promise.all` ⇒ exatamente 1×200 e 1×422 (sempre sobra 1 ADMIN). |
| Membro rebaixado perde permissões | **I**: a requisição seguinte do rebaixado a `PUT /split-rule` ⇒ 403 (papel relido por requisição). |
| Conflito de versão / Duplo clique / Falha de rede / Isolamento | **I/E** padrão (nome: 409 "A família foi alterada por Lucas…"). |

### US-035 (ordem 14; fatiar em 035a remover e 035b sair/avisos)
| Cenário BDD | Testes |
| :-- | :-- |
| Remover sem pendências graves / acesso encerrado | **I**: `remove` ⇒ 200; `Member.removedAt`; a **próxima** chamada de Lucas a qualquer rota ⇒ `403 NO_FAMILY`. **E**: ex-membro no histórico. |
| Histórico preservado com o nome | **I**: `GET /transactions` ⇒ `payer { name "Lucas", removed true }`; totais inalterados (regressão de `ledgerTotals` e `computeSettlement`). **E**: "Pago por Lucas (ex-membro)". |
| Diálogo lista pendências | **I**: `removal-review` ⇒ `accounts[0].defaultAction "ARCHIVE"`, `planned.length 1`, `settlement.totalInCents`. **E**: textos "1 conta de Lucas será arquivada", "1 despesa prevista será passada para você". |
| Conta com saldo exige reatribuir / reatribuir e remover | **I**: sem mapa ⇒ 422 `REMOVAL_BLOCKED` (`ACCOUNT_NEEDS_OWNER`); com `accounts: { id: mariana }` ⇒ 200, conta ativa com titular Mariana e saldo intacto. |
| Acerto em aberto exige reconhecimento / continua registrado | **I**: 38000 pendente ⇒ 422 `SETTLEMENT_NOT_ACKNOWLEDGED`; com `acknowledgeSettlement` ⇒ 200 e `GET /settlement?period=2026-10` ainda mostra 38000 (vetores **S14..S16**). |
| Despesa prevista passa ao Administrador | **I**: `responsibleMemberId` = Mariana. |
| Último Administrador não sai / Único membro não sai / Membro sai | **I**: `family/leave` ⇒ 422 `LAST_ADMIN` / `ONLY_MEMBER` com as mensagens; Lucas sai ⇒ 200 `LEFT`. **E**: "Você saiu da Família Silva" e perda de acesso à Home. |
| Membro não remove outros | **I**: MEMBER ⇒ 403. |
| Ex-membro pode ser convidado de novo | **I**: `POST /invitations` do e-mail do ex ⇒ 201 (sem `DUPLICATE_MEMBER`); aceite cria **novo** `Member` (id diferente), sem herdar histórico; índice parcial permite. |
| Sessão do removido é encerrada | **I/E**: `GET /api/auth/membership-ended` ⇒ 302 `/login?error=MembershipEnded` **uma vez**; sessão removida; 2º login ⇒ `/onboarding`. **E**: "Seu acesso a esta família foi encerrado". |
| Duplo clique / Isolamento | **I**: mesma chave ⇒ 1 remoção; chaves diferentes ⇒ 1×200 e 1×404; membro de outra família ⇒ 404. |
| (infra) Atomicidade e lock | **I**: falha injetada após arquivar a conta ⇒ nada persiste (membro continua ativo); `Promise.all` de remoção × rebaixamento do último ADMIN ⇒ consistente. |
| (infra) Estrutural | **I**: nenhuma FK para `members` com `ON DELETE CASCADE`; teste **canário de isolamento** do ADR-018. |

---

## 9. Estimativa e dependências

| História | PO | **TL** | Observação |
| :-- | :-: | :-: | :-- |
| US-032 | 3 | **5** | Migração, `lockAccountsForPosting` em **todos** os caminhos de postagem (maior risco), exclusão lógica, UI de contas arquivadas |
| US-033 | 2 | **3** | Reusa o lock; consulta de faturas; exclusão lógica; UI |
| US-034 | 3 | **3** | `PATCH /family`, papel com lock, `FamilyEvent`, UI da tela Família |
| US-035 | 5 | **8** | **Fatiar 035a (remover: modelo ADR-019, motor com ex-membro, revisão/reatribuição, reconvite) = 5 e 035b (sair, avisos de acesso encerrado, casos-limite) = 3.** Maior risco da R2.1 (acerto com ex-membro) |
Dependências: US-032 antes da 033; 034 antes da 035; 035 depende de `pendingSettlementMonths` (SDD-011); costuras do ADR-018 nesta história. **US-023 (SDD-013)** usa `archivedAt` (cenário "Conta arquivada nunca é sugerida" é **habilitado** na US-032).

**Impacto em R1/R2 (lista para o Dev):** `contas/{repo,service,ledger-queries}.ts` (`listAccounts` ativas, saldo ativo), `cartoes/{repo,service,queries}.ts`, `transacoes/{service,mutations}.ts` (`lockAccountsForPosting`, `ACCOUNT_ARCHIVED_LOCKED`), `contas/transfers.ts`, `cartoes/payment-service.ts`, `previstas/service.ts` (baixa), `split/service.ts` (carga de membros com `removedOn`), `familia/{repo,service,invitations/*}.ts` (`findActiveMembership`, `DUPLICATE_MEMBER`, reconvite), `lib/api/with-api.ts:123`, `(app)/layout.tsx` e `resolveAppEntry`, `schemas.ts` de `MemberRef`, `check:imports` (módulos puros: `split/pending` e `split/explain` sem Prisma), testes `us-004`, `us-010`, `us-015`, `us-003`, `us-002` (índices de membro), `migrations.int.test.ts`.
