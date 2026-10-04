# SDD-009: Despesas Previstas e Baixa (US-018, US-019)

- **Histórias**: [US-018](../../product-owner/backlog/stories/US-018-despesa-prevista-pontual.md) · [US-019](../../product-owner/backlog/stories/US-019-dar-baixa-em-despesa-prevista.md)
- **Fluxo**: [FLUXO-005](../../product-owner/flows/FLUXO-005-despesas-previstas.md)
- **Rastreabilidade**: NEED-004 (RN-004.1..4) · NEED-001 (RN-001.2, RN-001.3) · NEED-002 (RN-002.2) · NEED-007 · **ADR-015 (previsão como entidade própria)**, ADR-007, ADR-009, ADR-010, ADR-013 · D-PO-01, D-PO-02, D-PO-11
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-001](SDD-001-transacoes.md) (`createExpense`, ledger), [SDD-004](SDD-004-contas-e-ledger.md) (saldo), [SDD-005](SDD-005-extrato-e-home.md) (Home), [SDD-007](SDD-007-categorias.md), [SDD-008](SDD-008-cartoes-fatura.md) (`listPayableInvoices`) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md) §7
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA

---

## 1. Gaps técnicos e decisões

| Gap | Resolução |
| :-- | :-- |
| Previsão no ledger? | **Não** (ADR-015): tabela `PlannedExpense`. `PREVISTO` jamais aparece em saldo, extrato, `ledgerTotals` nem `computeSettlement`, por construção (nenhuma consulta precisa filtrar status). |
| Valor efetivo diferente do previsto | O **valor pago vive só na `Transaction`** gerada (`paidTransactionId`); `PlannedExpense.amountInCents` é sempre o **previsto**. `paid.differenceInCents = efetivo − previsto` é calculado na leitura. Corrigir a despesa pelo extrato (US-013) reflete na previsão automaticamente. |
| Baixa = despesa comum | A baixa chama o **mesmo serviço** `createExpenseCore` da US-005 (extraído de `createTransaction`) com `allowArchivedCategory: true` (a categoria pode ter sido arquivada depois do cadastro) e `occurredOn = paidOn`. Nenhuma regra nova de saldo/total/acerto. |
| Dupla baixa e conflito | `version` + `UPDATE … WHERE version = :v AND status = 'PREVISTO'`. Ordem de checagem **fixa**: (1) versão divergente ⇒ `409 VERSION_CONFLICT` ("alterada por {Nome}"); (2) status `PAGO` com versão atual ⇒ `409 PLANNED_ALREADY_PAID`. Duas baixas simultâneas ⇒ exatamente **1** despesa gerada. |
| Excluir a despesa gerada pelo extrato | `422 LINKED_TO_PLANNED` em `delete`/`restore` da `Transaction` apontada por uma previsão (emenda ao SDD-001 §4.3). `PATCH` continua permitido. |
| "Atrasada" | Derivada: `status = PREVISTO AND dueOn < hoje` (`todayInFamilyTz`, `America/Sao_Paulo`). Não é estado gravado. |
| Mês da lista | `periodOf(dueOn, cutDay)` (ADR-010): `period=YYYY-MM` por **vencimento**. |
| "Contas a pagar" mistura faturas | Agregador `listPayables` junta previsões `PREVISTO` e faturas `CLOSED` com total > 0 (SDD-008 `listPayableInvoices`); no **período corrente** inclui também **todas as atrasadas de períodos anteriores** (não podem sumir ao virar o mês). |
| Exclusão da previsão | Lógica (`deletedAt`), só `PREVISTO`; some das listas (404 na leitura). Sem restauração na R2. Trava de banco: previsão excluída não pode estar `PAGO`. |
| Auditoria | `version`, `authorMemberId`, `updatedByMemberId`; **sem** tabela de revisões na R2 (a despesa gerada tem a trilha completa do ledger). |
| Data de vencimento | Qualquer `DATE` válida (passada = atrasada). Sem limite superior na R2. |
| Baixa em mês já acertado | Criar a despesa **não** exige confirmação (como criar qualquer despesa retroativa, SDD-001); o acerto do período é recalculado (SDD-002). |
| Permissões | D-PO-02: qualquer membro cria, edita, exclui, baixa e desfaz. Sem `role`. |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/previstas/schemas.ts
const descriptionRequired = z.string({ error: "Informe a descrição" }).trim()
  .min(1, "Informe a descrição").min(2, "A descrição deve ter no mínimo 2 caracteres")
  .max(100, "A descrição deve ter no máximo 100 caracteres");
const noteSchema = z.string().trim().max(500, "A observação deve ter no máximo 500 caracteres");

export const CreatePlannedExpenseSchema = z.object({
  description: descriptionRequired,
  amountInCents: amountInCentsSchema,                         // "Informe um valor maior que zero"
  dueOn: dateISOSchema.optional(),                            // padrão: hoje (servidor)
  categoryId: z.uuid({ error: "Escolha uma categoria" }),     // categoria de DESPESA, ativa
  responsibleMemberId: uuidSchema.optional(),                 // padrão: membro logado (RN-001.2)
  isSharedExpense: z.boolean().default(true),
  note: noteSchema.optional(),
}).strict();

export const UpdatePlannedExpenseSchema = z.object({
  version: versionSchema,
  description: descriptionRequired.optional(),
  amountInCents: amountInCentsSchema.optional(),
  dueOn: dateISOSchema.optional(),
  categoryId: z.uuid({ error: "Escolha uma categoria" }).optional(),
  responsibleMemberId: uuidSchema.optional(),
  isSharedExpense: z.boolean().optional(),
  note: noteSchema.nullable().optional(),
}).strict();

export const DeletePlannedExpenseSchema = z.object({ version: versionSchema }).strict();
export const PayPlannedExpenseSchema = z.object({
  version: versionSchema,
  accountId: z.uuid({ error: "Escolha a conta do pagamento" }),
  paidOn: dateISOSchema.optional(),                           // padrão: hoje; futura => 422
  amountInCents: amountInCentsSchema.optional(),              // valor EFETIVO; padrão = previsto
  payerMemberId: uuidSchema.optional(),                       // padrão: responsável da previsão
  note: noteSchema.optional(),
}).strict();
export const UndoPlannedPaymentSchema = z.object({ version: versionSchema }).strict();

export const ListPlannedQuerySchema = z.object({
  period: periodKeySchema.optional(),                         // padrão: período corrente (por vencimento)
  status: z.enum(["PREVISTO", "PAGO"]).optional(),
}).strict();
export const PayablesQuerySchema = z.object({ period: periodKeySchema.optional() }).strict();

// ── DTOs ──
export type PlannedExpenseDTO = {
  id: string; description: string;
  amountInCents: number;                                      // PREVISTO
  dueOn: string; status: "PREVISTO" | "PAGO"; isOverdue: boolean;
  category: { id: string; name: string; icon: string; archived: boolean };
  responsible: MemberRef; author: MemberRef; updatedBy: MemberRef | null;
  isSharedExpense: boolean; note: string | null;
  paid: null | {                                              // da Transaction gerada (fonte única)
    transactionId: string; accountId: string; accountName: string; paidOn: string;
    amountInCents: number; differenceInCents: number;         // efetivo − previsto (pode ser negativo)
    payer: MemberRef;
  };
  version: number; createdAt: string; updatedAt: string;
};
export type PlannedListResponse = {
  items: PlannedExpenseDTO[];                                 // por dueOn asc (atrasadas naturalmente primeiro), depois createdAt, id
  period: { key: string; start: string; end: string };
  totals: { plannedInCents: number; overdueInCents: number; overdueCount: number; paidInCents: number; count: number };
};
export type PayableItemDTO = {
  type: "PLANNED" | "INVOICE";
  id: string;                                                 // PLANNED: id da previsão · INVOICE: `${cardId}:${ref}`
  title: string;                                              // descrição | "Fatura {Cartão}"
  dueOn: string; amountInCents: number; isOverdue: boolean;
  responsible: MemberRef | null; isSharedExpense: boolean | null;
  href: string;                                               // /previstas#id | /cartoes/{cardId}?ref={ref}
};
export type PayablesResponse = {
  items: PayableItemDTO[];                                    // atrasadas primeiro, depois por dueOn, depois título
  period: { key: string; start: string; end: string };
  totals: { dueInCents: number; overdueInCents: number; overdueCount: number };
};
export type PayPlannedResponse = {
  plannedExpense: PlannedExpenseDTO; transaction: TransactionDTO;
  account: { id: string; balanceInCents: number };
};
// HomeDTO (SDD-005 §2) ganha:
//   payables: { items: PayableItemDTO[] /* até 5 */; overdue: { count: number; totalInCents: number }; totalCount: number }
// TransactionDTO (SDD-001 §2) ganha: plannedExpenseId: string | null
```

---

## 3. Contratos de API (`auth: "family"`; mutações com `Idempotency-Key`)

| Rota | Corpo | Sucesso | Erros |
| :-- | :-- | :-- | :-- |
| `GET /api/v1/planned-expenses?period=&status=` | — | `200 PlannedListResponse` | 400 |
| `POST /api/v1/planned-expenses` | `CreatePlannedExpenseSchema` | `201 { plannedExpense }` | 400 · 422 `INVALID_REFERENCE` (categoria inexistente/arquivada/de receita/de outra família; responsável de outra família) |
| `GET /api/v1/planned-expenses/:id` | — | `200 { plannedExpense }` | 404 |
| `PATCH /api/v1/planned-expenses/:id` | `UpdatePlannedExpenseSchema` | `200 { plannedExpense }` | 404 · 409 `VERSION_CONFLICT` · 422 `PLANNED_PAID_LOCKED` · 422 `INVALID_REFERENCE` |
| `POST /api/v1/planned-expenses/:id/delete` | `DeletePlannedExpenseSchema` | `200 { deleted: true }` | 404 · 409 `VERSION_CONFLICT` · 422 `PLANNED_PAID_LOCKED` |
| `POST /api/v1/planned-expenses/:id/pay` | `PayPlannedExpenseSchema` | `201 PayPlannedResponse` | 404 · 409 `VERSION_CONFLICT` · 409 `PLANNED_ALREADY_PAID` · 422 `FUTURE_DATE_NOT_ALLOWED` · 422 `INVALID_REFERENCE` (`accountId`, `payerMemberId`) |
| `POST /api/v1/planned-expenses/:id/undo-payment` | `UndoPlannedPaymentSchema` | `200 { plannedExpense }` | 404 · 409 `VERSION_CONFLICT` · 409 `PLANNED_NOT_PAID` |
| `GET /api/v1/payables?period=` | — | `200 PayablesResponse` | 400 |

Mensagens exatas:
- `VERSION_CONFLICT`: **"Esta despesa prevista foi alterada por {Nome}. Recarregue para continuar."** (`details: { currentVersion, updatedBy }`).
- `PLANNED_ALREADY_PAID`: "Esta despesa prevista já foi paga". `PLANNED_NOT_PAID`: "Esta despesa prevista não está paga".
- `PLANNED_PAID_LOCKED`: "Despesa prevista paga não pode ser alterada. Use Desfazer pagamento."
- `FUTURE_DATE_NOT_ALLOWED` na baixa: "A data do pagamento não pode ser futura".
- `LINKED_TO_PLANNED` (nas rotas `delete`/`restore` de `/transactions/:id`, 422): **"Esta despesa veio de uma despesa prevista. Use Desfazer pagamento."**
- Validação: "Informe a descrição", "A descrição deve ter no mínimo 2 caracteres", "Informe um valor maior que zero", "Escolha uma categoria", "Escolha a conta do pagamento".

---

## 4. Regras e algoritmos

### 4.1 `createPlannedExpense` (transação do `withApi`)
1. `dueOn ??= hoje`; `responsibleMemberId ??= ctx.memberId`.
2. Referências da família: categoria **de despesa e ativa**, responsável ⇒ `INVALID_REFERENCE`.
3. `INSERT PlannedExpense { status: PREVISTO, version: 1, authorMemberId: ctx.memberId, … }`. **Nenhuma** escrita no ledger.

### 4.2 `updatePlannedExpense` / `deletePlannedExpense`
Carregar `FOR UPDATE` (família, `deletedAt IS NULL`, senão `404`); `version` divergente ⇒ `VERSION_CONFLICT`; `status = PAGO` ⇒ `PLANNED_PAID_LOCKED`; validar referências dos campos enviados; sem diferença ⇒ `200` sem mudar `version`; `UPDATE … SET …, version = version + 1, "updatedByMemberId" WHERE id AND "familyId" AND version = :v`. `delete`: `SET deletedAt = now(), deletedByMemberId`, `version + 1`.

### 4.3 `payPlannedExpense` (US-019) — uma transação, com `FOR UPDATE` na previsão
1. Carregar a previsão (`404` se inexistente/excluída/de outra família).
2. `version` divergente ⇒ `409 VERSION_CONFLICT`; senão `status = PAGO` ⇒ `409 PLANNED_ALREADY_PAID`.
3. `paidOn ??= hoje`; `paidOn > hoje` ⇒ `FUTURE_DATE_NOT_ALLOWED`. `effective = body.amountInCents ?? planned.amountInCents`. `payer = body.payerMemberId ?? planned.responsibleMemberId`.
4. Conta e pagador **da família** ⇒ senão `INVALID_REFERENCE`.
5. `createExpenseCore(tx, ctx, { accountId, categoryId: planned.categoryId, amountInCents: effective, occurredOn: paidOn, payerMemberId: payer, description: planned.description, note: body.note ?? planned.note, isSharedExpense: planned.isSharedExpense }, { allowArchivedCategory: true })` ⇒ `Transaction` + revisão `CREATE` (autor = quem deu a baixa).
6. `UPDATE planned_expenses SET status = 'PAGO', "paidTransactionId" = :tx, version = version + 1, "updatedByMemberId" = :me WHERE id AND version = :v AND status = 'PREVISTO'` (0 linhas ⇒ `VERSION_CONFLICT`, com *rollback* da despesa).
7. Responder `201` com previsão (`paid` preenchido), `transaction` e `balanceInCents` da conta.

### 4.4 `undoPlannedPayment`
`FOR UPDATE`; `version` divergente ⇒ `VERSION_CONFLICT`; `status = PREVISTO` ⇒ `409 PLANNED_NOT_PAID`; marcar a `Transaction` com `deletedAt/By`, `deletionReason = UNDONE`, `version + 1`, revisão `UNDO`; `UPDATE planned_expenses SET status = 'PREVISTO', "paidTransactionId" = NULL, version + 1`. A previsão volta **inalterada** (valor previsto, vencimento etc.). Saldo, totais e acerto voltam por derivação.

### 4.5 Guardas e leitura cruzada com o ledger (emendas ao SDD-001/005)
- `TransactionDTO.plannedExpenseId`: `LEFT JOIN planned_expenses p ON p."paidTransactionId" = t.id`.
- `delete` e `restore` de `Transaction` com previsão vinculada ⇒ `422 LINKED_TO_PLANNED`. `PATCH` permitido (valor/data/conta/categoria): `PlannedExpenseDTO.paid` lê da `Transaction` (join), portanto "Previsto x Pago" se atualiza sozinho. Desfazer **antes** de excluir.
- `PlannedExpenseDTO.paid.differenceInCents = tx.amountInCents − planned.amountInCents`.

### 4.6 `listPlannedExpenses` e `listPayables`
- `period` ⇒ `periodFromKey(key, cutDay)`; filtro `dueOn BETWEEN start AND end`, `deletedAt IS NULL`, `status` opcional. `totals`: `plannedInCents` = Σ previsto dos `PREVISTO`; `overdue*` = `PREVISTO` com `dueOn < hoje`; `paidInCents` = Σ valor **efetivo** (da `Transaction`) dos `PAGO`.
- `listPayables(tx, ctx, { period })`: `PREVISTO` com `dueOn` no período **+** faturas de `listPayableInvoices` (CLOSED, total > 0) com `dueDate` no período; se o período é o **corrente**, acrescenta todos os itens **atrasados com vencimento anterior ao início** do período. `isOverdue` = vencimento < hoje. Ordenação: atrasados primeiro; depois `dueOn` asc; depois título.
- **Home** (`HomeDTO.payables`, dentro do instantâneo `REPEATABLE READ` do SDD-005): itens `PREVISTO` + faturas CLOSED com `isOverdue` **ou** `dueOn ∈ [hoje, hoje + 7 dias]` (hoje incluso, 7 dias após), máximo **5** itens na ordem acima; `overdue` = contagem/soma de **todos** os atrasados; `totalCount` = quantos itens elegíveis existem (para "Ver todas").

### 4.7 Invariantes (verificadas por teste)
1. Criar/editar/excluir previsão **não altera** `accountBalances`, `ledgerTotals`, extrato nem `computeSettlement`.
2. Após a baixa existe **exatamente uma** `Transaction EXPENSE` ativa apontada por `paidTransactionId`, com `amountInCents = efetivo` e `occurredOn = paidOn`; saldo da conta = antes − efetivo.
3. `status = PAGO ⇔ paidTransactionId IS NOT NULL` (CHECK); previsão excluída nunca é `PAGO` (CHECK).
4. Baixar uma previsão **não toca** em nenhuma outra linha de `planned_expenses`.
5. `paid.differenceInCents` sempre = efetivo atual − previsto.

---

## 5. Interface

- **Rota `/previstas`** ("Contas a pagar"): seletor de mês (`period`, por vencimento, na URL); abas **A pagar** (usa `GET /payables`: previsões + faturas fechadas) | **Pagas** (`GET /planned-expenses?status=PAGO`); totais do mês no topo. Item: descrição, categoria (`CategoryIcon`), valor, vencimento, avatar do responsável, marcador Comum/Pessoal, *chip* **Atrasada** (cor + texto). Itens `INVOICE` mostram "Fatura {Cartão}", sem Editar/Excluir e com ação "Ver fatura" (`href`). Ações por item `PREVISTO`: **Dar baixa**, Editar, Excluir (diálogo "Excluir despesa prevista?"); `PAGO`: **Desfazer pagamento** (diálogo), mostrando "Previsto R$ x · Pago R$ y" e a diferença.
- **Drawers**: *Nova/Editar despesa prevista* (valor com máscara BRL, grade de categorias de despesa, responsável em avatares, switch "Dividir com a família", *Mais detalhes*: vencimento e observação) e **Dar baixa** (valor pago pré-preenchido com o previsto e diferença ao vivo "+R$ 32,50 sobre o previsto", conta com saldo e aviso "A conta de origem ficará negativa" + *Confirmar mesmo assim*, data, quem pagou, botão fixo "Confirmar pagamento"). A `Idempotency-Key` nasce ao abrir o drawer e é reaproveitada em reenvios; conflito ⇒ diálogo padrão com *Recarregar*.
- **Home**: bloco **"A pagar"** (`HomeDTO.payables`): até 5 itens, atrasados primeiro, ação rápida "Dar baixa" (previsões) / "Ver fatura" (faturas), link "Ver todas" ⇒ `/previstas`. Vazio: bloco oculto.
- **Cache**: `["planned", { period, status }]`, `["payables", period]`; criar/editar/excluir invalidam `["planned"]`, `["payables"]`, `["home"]`; **baixa/desfazer** invalidam também `["accounts"]`, `["transactions"]`, `["settlement"]`. O saldo exibido só muda com a resposta do servidor.
- Toasts: "Despesa prevista cadastrada!", "Pagamento registrado com sucesso!", "Pagamento desfeito". Estados padrão do SDD-000 §7 (skeleton, vazio "Nenhuma conta a pagar neste mês" + CTA, erro, sem conexão), 375 px/1280 px.

## 6. Segurança e isolamento
`familyId` da sessão; previsão/categoria/membro/conta de outra família ⇒ `404`/`INVALID_REFERENCE`; FKs compostas; `.strict()` rejeita `familyId`, `status`, `paidTransactionId`, `authorMemberId`. Logs sem descrição/nota.

---

## 7. Testes obrigatórios (BDD → teste) — U = unidade, I = integração, E = E2E

> Fábricas novas: `makePlannedExpense({ dueOn, amountInCents, responsible, … })`, `payPlanned(...)`. Relógio fixo (28/10/2026 e 10/11/2026 nos cenários).

### US-018
| Cenário BDD | Testes |
| :-- | :-- |
| Cadastrar despesa prevista | **I**: `POST` ⇒ 201, `status PREVISTO`, `version 1`, `amountInCents 65000`, `dueOn 2026-11-10`, `authorMemberId` = logado. **E**: aparece em "Contas a pagar" de novembro + aviso "Despesa prevista cadastrada!". |
| Responsável padrão / em nome de outro | **I**: sem `responsibleMemberId` ⇒ logado; com Mariana ⇒ `responsible = Mariana`, `author = Lucas`. |
| Previsão não mexe em saldo, extrato, totais nem acerto | **I (regressão obrigatória)**: antes/depois de criar, editar e excluir ⇒ `accountBalances`, `ledgerTotals`, `GET /transactions` e `computeSettlement` idênticos; `SELECT count(*) FROM transactions` não muda. |
| Vencimento passado fica atrasado | **U**: `isOverdue` (`dueOn < hoje`; `dueOn = hoje` ⇒ **não** atrasada; virada de dia em SP: `2026-10-29T02:30:00Z` ainda é 28/10). **I**: item com `isOverdue true`, `status PREVISTO`. **E**: chip "Atrasada". |
| Campos obrigatórios / descrição curta | **U**: schema ⇒ "Informe a descrição", "Informe um valor maior que zero", "Escolha uma categoria"; `"A"` ⇒ "A descrição deve ter no mínimo 2 caracteres". **I**: 400, nada criado. |
| Editar despesa prevista | **I**: `PATCH amountInCents/dueOn` ⇒ 200, `version 2`, `updatedBy`; sem diferença ⇒ 200 sem mudar `version`; em `PAGO` ⇒ 422 `PLANNED_PAID_LOCKED`. |
| Excluir despesa prevista | **I**: `delete` ⇒ some de listas e `GET` ⇒ 404; `PAGO` ⇒ 422. **E**: diálogo "Excluir despesa prevista?". |
| Conflito de edição | **I**: dois `PATCH` mesma `version` em `Promise.all` ⇒ 1×200 e 1×409 com "Esta despesa prevista foi alterada por Mariana. Recarregue para continuar."; perdedor não grava. |
| Lista por mês com total | **I**: `GET /planned-expenses?period=2026-11` ordenado por `dueOn` (Escola 05/11 antes de Condomínio 10/11); `totals.plannedInCents 185000`. |
| Bloco "A pagar" na Home | **I**: `GET /home` ⇒ `payables.items` com Internet (atrasada) e Luz (30/10); **sem** Condomínio (10/11, > 7 dias); borda: vencimento em `hoje + 7` entra, `hoje + 8` não; máx. 5; `overdue` conta todas as atrasadas. **E**: bloco e link "Ver todas". |
| Faturas fechadas aparecem em "A pagar" | **I**: com fatura CLOSED 40000, `GET /payables?period=2026-11` ⇒ item `INVOICE` `dueOn 2026-11-05`, `href /cartoes/{id}?ref=2026-10`; fatura **paga** ou aberta fora; atrasadas de meses anteriores aparecem no período corrente e **não** em período futuro. |
| Dividir com a família desligado | **I**: `isSharedExpense false` persiste; baixa gera despesa pessoal (US-019). |
| Nenhuma despesa prevista | **E**: vazio "Nenhuma conta a pagar neste mês" + CTA. |
| Duplo clique não duplica | **I**: `Promise.all` mesma chave ⇒ 1 previsão. **E**: duplo clique. |
| Membro comum também cadastra | **I**: MEMBER ⇒ 201. |
| Falha de rede ao salvar | **E**: `route.abort()` ⇒ mensagem padrão, formulário preservado, reenvio cria 1 previsão. |
| Isolamento entre famílias | **I**: teste padrão SDD-000 §9.4 em `GET/PATCH/delete/pay/undo-payment /planned-expenses/:id` e `GET` de listas. |
| (infra) Referências | **I**: categoria de receita, arquivada ou de outra família ⇒ 422 `INVALID_REFERENCE`; responsável de outra família idem. |
| (infra) `.strict()` / Banco | **I**: `status`/`paidTransactionId`/`familyId` no corpo ⇒ 400; `INSERT` com `status PAGO` sem `paidTransactionId` viola `planned_status_paid_chk`. |

### US-019
| Cenário BDD | Testes |
| :-- | :-- |
| Dar baixa com a conta e a data | **I**: Itaú 300000, previsão 65000 ⇒ `POST …/pay` 201; `accountBalances` 235000; `status PAGO`, `paid.amountInCents 65000`, `paidOn` = hoje; **uma** `Transaction EXPENSE` com `occurredOn`, `categoryId`, `description`, `isSharedExpense` da previsão, `authorMemberId` = quem deu baixa; revisão `CREATE`. **E**: aviso "Pagamento registrado com sucesso!". |
| Valor efetivo diferente do previsto | **I**: `amountInCents 68250` ⇒ saldo 231750; `paid.differenceInCents 3250`; previsão mantém `amountInCents 65000`. **E**: "Previsto R$ 650,00 · Pago R$ 682,50" com "+R$ 32,50". **U**: cálculo da diferença (positiva, negativa, zero). |
| A baixa gera a despesa real | **I**: `GET /transactions?period=2026-11` lista a despesa 68250 (Moradia, Itaú, 10/11); `ledgerTotals.expenseInCents` +68250. |
| Quem pagou padrão / outro membro paga | **I**: sem `payerMemberId` ⇒ `payer = responsible`; com Mariana ⇒ `payer Mariana`, `author Lucas`. |
| Comum entra no acerto pelo valor efetivo | **I** (SDD-002): EQUAL, baixa de 68250 por Lucas ⇒ `settlement` considera 68250 pago por Lucas. |
| Pessoal fora do acerto | **I**: `isSharedExpense false` ⇒ `settlement` inalterado. |
| Previsão do mês seguinte intacta | **I**: a previsão de 10/12 segue `PREVISTO`, `version` e valor inalterados (comparar linha inteira antes/depois). |
| Conta obrigatória / valor inválido / data futura / retroativa | **U**: schema ⇒ "Escolha a conta do pagamento", `0` ⇒ "Informe um valor maior que zero". **I**: `paidOn` amanhã ⇒ 422 `FUTURE_DATE_NOT_ALLOWED` ("A data do pagamento não pode ser futura"; relógio fixo, virada em SP); `paidOn` 08/11 ⇒ 201 com `occurredOn 2026-11-08`; nada gravado nos erros. |
| Conta ficará negativa | **I**: saldo 10000, pagar 65000 ⇒ 201, saldo −55000. **E**: aviso e confirmação. |
| Baixa única | **I**: segunda baixa com a **versão atual** de uma previsão `PAGO` ⇒ 409 `PLANNED_ALREADY_PAID`; saldo debitado 1×. |
| Duplo clique não paga duas vezes | **I**: `Promise.all` mesma chave ⇒ 1 despesa, 2ª resposta `Idempotent-Replay`; chaves **diferentes** e mesma `version` ⇒ 1×201 e 1×409 `VERSION_CONFLICT`. **E**: duplo clique. |
| Conflito de baixa simultânea | **I**: duas baixas com a mesma `version` ⇒ 1×201 e 1×409 `VERSION_CONFLICT` com "Esta despesa prevista foi alterada por Mariana. Recarregue para continuar."; **uma** `Transaction` e **um** débito. |
| Previsão paga fica travada | **I**: `PATCH`/`delete` em `PAGO` ⇒ 422 `PLANNED_PAID_LOCKED`. **E**: sem Editar/Excluir, com "Desfazer pagamento". |
| Desfazer o pagamento | **I**: `undo-payment` ⇒ saldo 300000, `status PREVISTO`, `paidTransactionId null`, valor previsto igual ao original; `Transaction` com `deletionReason UNDONE` e revisão `UNDO`; some de extrato/totais/acerto; repetir ⇒ 409 `PLANNED_NOT_PAID`; nova baixa depois do desfazer ⇒ 201. |
| Despesa gerada não pode ser excluída pelo extrato | **I**: `POST /transactions/:id/delete` e `restore` ⇒ 422 `LINKED_TO_PLANNED` com a mensagem exata; `GET /transactions/:id` traz `plannedExpenseId`. **E**: detalhe sem "Excluir", com link para a previsão. |
| Corrigir o valor da despesa gerada atualiza a previsão | **I**: `PATCH /transactions/:id amountInCents 68000` ⇒ `GET planned` ⇒ `paid.amountInCents 68000`, `differenceInCents 3000`. |
| Falha de rede ao dar baixa / Isolamento | **E**: `route.abort()` ⇒ mensagem padrão, mesma chave no reenvio; **I**: 404 em `pay` de outra família. |
| (infra) Atomicidade | **I**: falha injetada no `UPDATE` da previsão ⇒ a despesa **não** persiste e o saldo é o original; falha na gravação da revisão ⇒ nada persiste. |
| (infra) Categoria arquivada depois do cadastro | **I**: arquivar a categoria da previsão ⇒ baixa ainda 201 (despesa na categoria arquivada). |
| (infra) Referências | **I**: conta/pagador de outra família ⇒ 422 `INVALID_REFERENCE`. |

---

## 8. Estimativa e dependências
| História | PO | TL | Observação |
| :-- | :-: | :-: | :-- |
| US-018 | 5 | **5** | Modelo + migração, 5 rotas, listas por período, `listPayables` (inclui faturas), bloco da Home, 2 telas/drawers |
| US-019 | 5 | **5** | Extração de `createExpenseCore`, baixa/desfazer atômicos, guardas cruzadas com US-013, regressões de saldo/totais/acerto |
Ordem técnica: US-018 ➔ US-019. US-018 depende de US-005 (categorias, `createExpenseCore` só na US-019) e US-012 (bloco na Home); o item `INVOICE` do agregador depende de `listPayableInvoices` (SDD-008, US-017a), **opcional**: sem a US-017a o agregador devolve apenas previsões. Cenários que dependem da US-013a (`LINKED_TO_PLANNED` no `delete`) ficam inativos se ela for cortada.

## 9. Impacto no código da R1/R2 (lista de verificação para o Dev)
| Arquivo / módulo | Mudança |
| :-- | :-- |
| `src/modules/transacoes/service.ts` | Extrair `createExpenseCore(tx, ctx, input, { allowArchivedCategory })` de `createTransaction` (a rota continua chamando-o) |
| `src/modules/transacoes/{schemas,repo}.ts` | `TransactionDTO.plannedExpenseId` (join) |
| US-013a (`delete`/`restore`) | `422 LINKED_TO_PLANNED` |
| `src/modules/home/*` (US-012) | `HomeDTO.payables` dentro do instantâneo `REPEATABLE READ` |
| `prisma/schema.prisma` + `us018_previstas` | Modelo §7 |
| `tests/support/factories.ts`, `prisma/seed.ts` | `makePlannedExpense`; seed com duas previsões |
