# SDD-004: Contas Bancárias e Ledger (US-004, US-010)

- **Histórias**: [US-004](../../product-owner/backlog/stories/US-004-cadastrar-conta-bancaria.md) · [US-010](../../product-owner/backlog/stories/US-010-transferencia-entre-contas.md) (e a base de ledger usada por US-005/006/011/013)
- **Rastreabilidade**: NEED-002 · RN-002.1..3 · ADR-001, ADR-007 (ledger), ADR-009, ADR-010, ADR-013 · D-PO-02
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-003](SDD-003-auth-familia-convite.md) (família/membros) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md)
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA

---

## 1. Gaps técnicos e decisões

| Gap | Resolução |
| :-- | :-- |
| Representação do lançamento de abertura no ledger imutável | `Transaction(kind=OPENING)` com `direction` conforme o sinal (CREDIT se ≥ 0; DEBIT se < 0) e `amountInCents` = magnitude. Criada **na mesma transação** da conta. Não editável (sem rota). Entra no saldo; fica fora do extrato e dos totais (ADR-007). |
| Saldo | **Derivado** por `SUM` (nunca armazenado). Uma única função `accountBalances()` serve Contas, Home, transferência e testes. |
| Transferência atômica com par vinculado | `TransferGroup` + 2 linhas (`TRANSFER_OUT`/`TRANSFER_IN`) numa transação; índice único parcial garante 1 perna de cada tipo (modelo §4). |
| Reuso pelo acerto (US-011) | `createTransferGroup()` é compartilhada; o acerto passa `kind: "SETTLEMENT"` e metadados (SDD-002 §6). |
| Origem fica negativa | **Não bloqueia**: a UI avisa e exige confirmação; a API aceita (regra do PO). A API devolve saldos resultantes. |
| Nome duplicado | Índice único `(familyId, lower(btrim(name)))`; violação → `409 DUPLICATE_ACCOUNT_NAME` "Já existe uma conta com este nome". |
| Concorrência na renomeação | `version` (ADR-009). |
| Saldo inicial "não editável depois que houver movimentações" | No R1 **nunca** editável (nenhuma rota). Correção virá com a conciliação (AP2). |
| Data de abertura | Padrão hoje; permite passado; futura → `422 FUTURE_DATE_NOT_ALLOWED`. |
| Permissões | D-PO-02: todos os membros veem e usam todas as contas; titular é informativo. Sem papel exigido. |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/contas/schemas.ts
// Tipos: CHECKING = Conta corrente · SAVINGS = Poupança · CASH = Dinheiro/carteira
export const INSTITUTION_SUGGESTIONS = ["Nubank","Itaú","Inter","Bradesco","Banco do Brasil","Caixa","Santander","C6","Outro"] as const;

export const CreateAccountSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da conta").max(60, "O nome deve ter no máximo 60 caracteres"),
  institution: z.string().trim().min(1).max(40).default("Outro"),
  type: z.enum(["CHECKING", "SAVINGS", "CASH"], { error: "Escolha o tipo da conta" }),
  ownerMemberId: uuidSchema.optional(),                                     // padrão: membro logado
  openingBalanceInCents: z.number().int("O valor deve ser um número inteiro")
      .min(-MAX_AMOUNT_IN_CENTS).max(MAX_AMOUNT_IN_CENTS).default(0),       // pode ser negativo
  openingDate: dateISOSchema.optional(),                                    // padrão: hoje (servidor)
}).strict();
export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;

export const RenameAccountSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da conta").max(60),
  version: versionSchema,
}).strict();

export const CreateTransferSchema = z.object({
  fromAccountId: uuidSchema,
  toAccountId: uuidSchema,
  amountInCents: amountInCentsSchema,
  occurredOn: dateISOSchema.optional(),                                     // padrão: hoje
  note: z.string().trim().max(500).optional(),
}).strict().refine((v) => v.fromAccountId !== v.toAccountId, { path: ["toAccountId"], message: "Escolha contas diferentes" });

export const UndoTransferSchema = z.object({ version: versionSchema }).strict();   // version do TransferGroup

// ── DTOs ──
export type AccountDTO = {
  id: string; name: string; institution: string; type: "CHECKING" | "SAVINGS" | "CASH";
  owner: MemberRef; balanceInCents: number; version: number; createdAt: string;
};
export type AccountsResponse = { items: AccountDTO[]; totalBalanceInCents: number };
export type TransferDTO = {
  groupId: string; kind: "TRANSFER" | "SETTLEMENT"; occurredOn: string; amountInCents: number;
  from: { accountId: string; name: string; balanceAfterInCents: number };
  to:   { accountId: string; name: string; balanceAfterInCents: number };
  author: MemberRef; note: string | null; version: number; createdAt: string;
  settlement: null | { period: string; fromMemberId: string; toMemberId: string };
  undoneAt: string | null;
};
```

---

## 3. Contratos de API

Todas `auth: "family"`, idempotentes quando mutação (SDD-000).

| Rota | Corpo | Sucesso | Erros |
| :-- | :-- | :-- | :-- |
| `GET /api/v1/accounts` | — | `200 AccountsResponse` (ordem: `createdAt` asc) | 401 · 403 `NO_FAMILY` |
| `POST /api/v1/accounts` | `CreateAccountSchema` | `201 AccountDTO` | 400 (campos obrigatórios) · 409 `DUPLICATE_ACCOUNT_NAME` · 422 `FUTURE_DATE_NOT_ALLOWED` · 422 `INVALID_REFERENCE` (`ownerMemberId` não é da família; `details:[{path:"ownerMemberId"}]`) |
| `PATCH /api/v1/accounts/:id` | `RenameAccountSchema` | `200 AccountDTO` | 404 · 409 `DUPLICATE_ACCOUNT_NAME` · 409 `VERSION_CONFLICT` |
| `POST /api/v1/transfers` | `CreateTransferSchema` | `201 { transfer: TransferDTO }` | 400 ("Escolha contas diferentes", "Informe um valor maior que zero") · 404 `NOT_FOUND` (conta de outra família ou inexistente) · 422 `FUTURE_DATE_NOT_ALLOWED` |
| `GET /api/v1/transfers/:groupId` | — | `200 { transfer: TransferDTO }` | 404 |
| `POST /api/v1/transfers/:groupId/undo` | `UndoTransferSchema` | `200 { transfer: TransferDTO }` (com `undoneAt`) | 404 · 409 `VERSION_CONFLICT` · 409 `ALREADY_UNDONE` |

Notas:
- `GET /accounts` inclui `balanceInCents` já calculado e `totalBalanceInCents` = soma (inclui contas negativas).
- `POST /accounts` aceita `institution` livre (UI mostra as sugestões + "Outro (texto livre)").
- **Desfazer transferência/acerto** é usado pela US-013 (SDD-001 §7); a rota mora aqui por ser do mesmo agregado.

---

## 4. Regras e algoritmos

### 4.1 Saldo
```sql
SELECT "accountId",
       COALESCE(SUM(CASE direction WHEN 'CREDIT' THEN "amountInCents" ELSE -"amountInCents" END), 0) AS balance
FROM transactions
WHERE "familyId" = $1 AND "deletedAt" IS NULL
GROUP BY "accountId";
```
`accountBalances(tx, familyId, accountIds?)` → `Map<accountId, number>` (com `toCents`; contas sem linhas = 0). Inclui `OPENING`. **Não** filtra por data (não há lançamentos futuros no R1).

### 4.2 `createAccount` (transação)
1. Validar `ownerMemberId` ∈ membros da família.
2. `INSERT BankAccount`; violação do índice de nome → `DUPLICATE_ACCOUNT_NAME`.
3. `postOpening()`: `Transaction { kind: OPENING, direction: saldo >= 0 ? CREDIT : DEBIT, amountInCents: |saldo|, accountId, occurredOn: openingDate ?? hoje, description: "Saldo inicial", authorMemberId: ctx.memberId }` + revisão `CREATE`.
4. Retornar `AccountDTO` com `balanceInCents = saldo inicial`.

### 4.3 `createTransferGroup` (compartilhada com o acerto)
```typescript
export async function createTransferGroup(tx: Tx, ctx: Ctx, a: {
  kind: "TRANSFER" | "SETTLEMENT"; fromAccountId: string; toAccountId: string; amountInCents: number;
  occurredOn: DateISO; note?: string;
  description?: string;                       // padrão "Transferência"; o acerto passa "Acerto de contas - {Mês}" (SDD-002 §5.4)
  settlement?: { period: string; fromMemberId: string; toMemberId: string };
}): Promise<TransferDTO>
```
Em **uma** transação (herdada do `withApi`):
1. Carregar as duas contas **da família** (`404` se faltar alguma). `occurredOn <= hoje`.
2. `INSERT TransferGroup` (`version = 1`, `authorMemberId`, `settlement*` se SETTLEMENT).
3. `INSERT Transaction` perna `TRANSFER_OUT` (DEBIT, conta origem) e `TRANSFER_IN` (CREDIT, conta destino): mesmo `amountInCents`, `occurredOn`, `transferGroupId`, `description` = `a.description ?? "Transferência"`, `categoryId = null`, `payerMemberId = null`, `isSharedExpense = false`.
4. Revisão `CREATE` para cada perna.
5. Calcular `balanceAfterInCents` das duas contas e montar `TransferDTO`.
Qualquer falha → *rollback* integral (nenhuma perna persiste).

### 4.4 `undoTransferGroup`
Carrega o grupo (`404` se de outra família); `deletedAt != null` → `409 ALREADY_UNDONE`; `UPDATE … WHERE version = :v` (0 linhas → `409 VERSION_CONFLICT`); marca grupo e **as duas pernas** com `deletedAt = now`, `deletedByMemberId`, `deletionReason = UNDONE`, `version + 1`; revisão `UNDO` em cada perna. Saldos e totais voltam ao estado anterior automaticamente (saldo é derivado).

### 4.5 Trilha de auditoria (compartilhada com SDD-001)
```typescript
type Change = { field: string; from: unknown; to: unknown };
recordRevision(tx, { familyId, transactionId, revision: version, action, actorMemberId, changes: Change[] })
```
`CREATE`: `changes = [{ field: "*", from: null, to: <snapshot da linha> }]`. A tabela é *append-only* por trigger.

### 4.6 Invariantes (verificadas por teste)
- Σ saldos consolidado **não muda** por transferência (RN-002.3).
- Transferência/abertura não aparecem em `ledgerTotals` (SDD-005).
- Exatamente 2 pernas por grupo, com mesmo valor.

---

## 5. UI (tela *Contas*, drawers)

Rota `/contas`.
- **Lista**: cards (avatar do titular, nome, instituição, saldo). Saldo negativo em vermelho **e** com sinal "−" (não depender só de cor). **Total consolidado** no topo. Botões *Nova conta* e *Transferir*.
- **Vazio**: "Cadastre sua primeira conta para começar" + botão primário.
- **Drawer Nova conta**: nome, instituição (select + "Outro (texto livre)"), tipo (3 opções), titular (padrão: logado), saldo inicial (máscara BRL; aceita negativo com sinal "−"), data em *Mais detalhes*. Erros por campo com as mensagens do Zod.
- **Renomear**: ação no card (menu "⋯" → Renomear); envia `version`; em `409 VERSION_CONFLICT` mostra o diálogo padrão.
- **Drawer Transferir**: origem, destino, valor (máscara BRL), data em *Mais detalhes*; mostra o **saldo resultante das duas contas** (calculado do cache `["accounts"]`). Se `saldoOrigem − valor < 0`: aviso **"A conta de origem ficará negativa"** com botão *Confirmar mesmo assim*. Menos de 2 contas: o botão abre o aviso "Cadastre outra conta para transferir" com atalho para *Nova conta*.
- Estados: skeleton dos cards, vazio, erro, enviando ("Salvando…"/"Transferindo…"), sem conexão (padrão).
- Chaves: invalidar `["accounts"]`, `["transactions"]`, `["home"]` após criar conta/transferência/desfazer.

## 6. Segurança e isolamento
`makeRepos` impõe `familyId`; conta/categoria/membro de outra família → `404`/`422 INVALID_REFERENCE` sem vazar existência; FKs compostas no banco; sem `DELETE` de `Transaction` (trigger).

## 7. Testes obrigatórios (BDD → teste)

### US-004
| Cenário BDD | Testes |
| :-- | :-- |
| Cadastrar conta com sucesso | **I**: `POST /accounts` (`openingBalanceInCents: 150000`) → saldo 150000; existe `OPENING` CREDIT 150000; `totalBalanceInCents` soma. **E**: lista mostra "R$ 1.500,00". |
| Titular padrão | **I**: sem `ownerMemberId` → titular = membro logado. **E**: campo "Titular" vem com "Lucas". |
| Saldo inicial negativo | **I**: `-30000` → `OPENING` DEBIT 30000, saldo -30000. **U**: `formatBRL(-30000) === "-R$ 300,00"`. **E**: card com saldo "-R$ 300,00" destacado. |
| Campos obrigatórios | **U**: schema sem `name`/`type` → mensagens "Informe o nome da conta"/"Escolha o tipo da conta". **I**: 400 e nada criado. **E**: erros nos campos. |
| Nome duplicado na família | **I**: 2ª criação com "itaú mariana " (caixa/espaço diferentes) → 409 `DUPLICATE_ACCOUNT_NAME` com mensagem exata; corrida simultânea (chaves diferentes) → 1×201 e 1×409. |
| Conta visível para os dois membros | **I**: Lucas lista contas criadas por Mariana, mesmo saldo. **E**: idem na UI. |
| Isolamento entre famílias | **I**: teste de isolamento (SDD-000 §9.4) para `GET /accounts`, `PATCH /accounts/:id`, uso em `POST /transfers`. |
| Renomear conta | **I**: `PATCH` muda o nome, saldo igual, `version` 2; versão antiga → 409; nome duplicado → 409. |
| (infra) Atomicidade da abertura | **I**: falha injetada no `postOpening` → conta não persiste. |
| (infra) Idempotência | **I**: duplo envio mesma chave → 1 conta, 1 abertura. |
| (infra) Abertura intocável | **I**: `DELETE FROM transactions` direto → exceção do trigger. |

### US-010
| Cenário BDD | Testes |
| :-- | :-- |
| Transferir com sucesso | **I**: Itaú 300000, Nubank 50000; transferir 100000 → 200000 e 150000; `Σ` = 350000; `TransferDTO.balanceAfter*` corretos. **E**: saldos na UI. |
| Aparece vinculada no extrato | **I**: duas linhas (OUT e IN) com o mesmo `transferGroupId`. **E**: (com SDD-005) linhas marcadas como mesma transferência. |
| Não é despesa nem receita | **I**: `ledgerTotals` e painel de acerto não mudam após transferir (teste de regressão compartilhado com SDD-002/005). |
| Origem igual ao destino | **U**: schema → "Escolha contas diferentes". **I**: 400, nada criado. |
| Valor inválido | **U**: `0`, `-1`, `1.5`, `NaN` → "Informe um valor maior que zero". |
| Origem sem saldo suficiente | **I**: transferir 50000 de conta com 20000 → 201, saldo origem -30000 (sem bloqueio). **E**: aviso "A conta de origem ficará negativa", confirmar, saldo "-R$ 300,00". |
| Atomicidade | **I**: falha injetada na inserção da perna IN → 0 linhas em `transactions` e `transfer_groups`; saldos iguais. |
| Duplo clique não duplica | **I**: 2× simultâneas mesma chave → 1 grupo, 2 linhas. **E**: duplo clique. |
| Menos de duas contas | **E**: família com 1 conta → orientação "Cadastre outra conta". |
| (infra) Desfazer | **I**: `undo` → saldos revertidos, 2 pernas `UNDONE`, revisões `UNDO`; repetir → 409 `ALREADY_UNDONE`; versão velha → 409. |
| (infra) Conta de outra família | **I**: `fromAccountId` de outra família → 404, nada criado. |
| (infra) Invariante de pernas | **I**: tentar inserir 2ª perna OUT no mesmo grupo → violação do índice único. |

## 8. Estimativa e dependências
| História | PO | TL | Observação |
| :-- | :-: | :-: | :-- |
| US-004 | 3 | **5** | Modelo de ledger, migração SQL (CHECKs/trigger), saldo derivado, 2 drawers |
| US-010 | 3 | **3** | `createTransferGroup`/`undo` reutilizados por US-011 e US-013 |
Dependência técnica: o **ledger** (`Transaction`, `recordRevision`, `accountBalances`) nasce em US-004 e é reutilizado por US-005 em diante.

---

## Errata 2026-10-04 (R2)
`accountBalances` (§4.1) passa a filtrar `AND "accountId" IS NOT NULL`: compras no cartão têm `accountId` nulo e **não** alteram saldo de conta (RN-003.1, [ADR-014](../adrs/ADR-014-cartao-e-fatura-no-ledger.md)). O pagamento da fatura (`INVOICE_PAYMENT`) tem conta e **debita** o saldo normalmente. Teste novo: compra no cartão não cria chave `null` no mapa de saldos.
