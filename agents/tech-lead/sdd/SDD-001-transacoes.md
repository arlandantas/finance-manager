# SDD-001: Lançamentos: despesa, receita, correção e exclusão (US-005, US-006, US-013)

- **Histórias**: [US-005](../../product-owner/backlog/stories/US-005-lancar-despesa.md) · [US-006](../../product-owner/backlog/stories/US-006-lancar-receita.md) · [US-013](../../product-owner/backlog/stories/US-013-corrigir-ou-estornar-lancamento.md)
- **Fluxo**: [FLUXO-001 (rev. 2)](../../product-owner/flows/FLUXO-001-lancamento-rapido.md)
- **Rastreabilidade**: NEED-001, NEED-002 · RN-001.1, RN-001.3, RN-002.2, RN-007.2 · ADR-001, ADR-006, ADR-007, ADR-009, ADR-010, ADR-013 · D-PO-01, D-PO-02
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-004](SDD-004-contas-e-ledger.md) (ledger, `recordRevision`) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md)
- **Status**: **Revisão 2 — Aprovado para Desenvolvimento** · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA
- **Histórico**: Rev. 1 (cadastro de transações, antes das NEEDs/ADR-006) **substituída** por esta revisão em 2026-10-04 a pedido do PO (GAP-1, GAP-2). A antiga "US-001 Cadastro" = US-005 + US-006 (+ US-013).

---

## 1. Gaps técnicos e decisões (inclui GAP-1 e GAP-2 do PO)

| Gap | Resolução |
| :-- | :-- |
| **GAP-1** — faltava `accountId` | Todo lançamento (`EXPENSE`/`INCOME`) tem `accountId` **obrigatório** (conta da família). O saldo da conta é derivado (SDD-004). |
| **GAP-2** — nomes divergentes do ADR-006 | `isShared` → **`isSharedExpense`**; `paidByMemberId` → **`payerMemberId`**; novo **`authorMemberId`** (autor, automático e imutável, RN-001.1); novo **`updatedByMemberId`**; `version` inteiro (ADR-009) no lugar de `updatedAt`. Mapa: `isShared→isSharedExpense`, `paidByMemberId→payerMemberId`, `date→occurredOn`, `type EXPENSE|INCOME` mantido. |
| `familyId` no corpo | **Removido**: vem da sessão (ADR-013). Rota deixa de ter `/families/:familyId`. `.strict()` rejeita `familyId`, `authorMemberId` etc. enviados pelo cliente. |
| Data em ISO `datetime`/UTC | **Substituído**: `occurredOn` é `DATE` (`YYYY-MM-DD`) no fuso da família (ADR-010); validação `<= hoje` no servidor. |
| Concorrência por `updatedAt` | **Substituído** por `version` + `409 VERSION_CONFLICT` (ADR-009). |
| Cliques duplos | `Idempotency-Key` gerada **ao abrir o drawer** e reaproveitada em reenvios (ADR-009). |
| Descrição opcional na UI (Q-05) | Contrato aceita ausente/vazia e **o servidor preenche com o nome da categoria**; se informada: 2..100 caracteres. |
| D-PO-01: um único "Quem pagou?" | Um só campo `payerMemberId` (para receita = quem recebeu). Não existe `responsiblePaymentMemberId` no R1 (só nas previstas, US-018). |
| Receita no rateio | Receita não tem `isSharedExpense` (sempre `false`; campo proibido no schema de receita). |
| Editar sobre ledger imutável | Estado corrente + `version` + `TransactionRevision` append-only; exclusão lógica reversível (ADR-007). |
| Editar mês já acertado | `409 SETTLED_PERIOD_CONFIRMATION_REQUIRED` até o cliente reenviar com `confirmSettledPeriod: true`. |
| Transferência/acerto/abertura | **Não editáveis** (`422 NOT_EDITABLE`); transferências e acertos só por `POST /transfers/:id/undo` (SDD-004). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/transacoes/schemas.ts
const descriptionSchema = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().trim().min(2, "A descrição deve ter no mínimo 2 caracteres").max(100, "A descrição deve ter no máximo 100 caracteres").optional(),
);
const common = {
  accountId: z.uuid({ error: "Escolha uma conta" }),
  categoryId: z.uuid({ error: "Escolha uma categoria" }),
  amountInCents: amountInCentsSchema,                       // "Informe um valor maior que zero"
  occurredOn: dateISOSchema.optional(),                     // padrão: hoje (servidor, fuso da família)
  payerMemberId: uuidSchema.optional(),                     // padrão: membro logado
  description: descriptionSchema,
  note: z.string().trim().max(500).optional(),
};

export const CreateExpenseSchema = z.object({ type: z.literal("EXPENSE"), ...common, isSharedExpense: z.boolean().default(true) }).strict();
export const CreateIncomeSchema  = z.object({ type: z.literal("INCOME"),  ...common }).strict();
export const CreateTransactionSchema = z.discriminatedUnion("type", [CreateExpenseSchema, CreateIncomeSchema]);
export type CreateTransactionInput = z.input<typeof CreateTransactionSchema>;

export const UpdateTransactionSchema = z.object({
  version: versionSchema,
  confirmSettledPeriod: z.boolean().optional(),
  accountId: common.accountId.optional(),
  categoryId: common.categoryId.optional(),
  amountInCents: amountInCentsSchema.optional(),
  occurredOn: dateISOSchema.optional(),
  payerMemberId: uuidSchema.optional(),
  description: z.string().trim().min(2, "A descrição deve ter no mínimo 2 caracteres").max(100).optional(),
  note: z.string().trim().max(500).nullable().optional(),
  isSharedExpense: z.boolean().optional(),                  // só despesa; em receita → 400
}).strict();

export const TransactionStateSchema = z.object({ version: versionSchema, confirmSettledPeriod: z.boolean().optional() }).strict(); // delete / restore

// ── DTOs ──
export type MemberRef = { id: string; name: string; image: string | null };
export type TransactionDTO = {
  id: string;
  type: "EXPENSE" | "INCOME" | "TRANSFER_OUT" | "TRANSFER_IN" | "OPENING";   // = coluna Prisma `kind`
  direction: "CREDIT" | "DEBIT";
  amountInCents: number;
  occurredOn: string;                                       // YYYY-MM-DD
  description: string; note: string | null;
  account: { id: string; name: string };
  category: { id: string; name: string; icon: string; kind: "EXPENSE" | "INCOME" } | null;
  payer: MemberRef | null;                                  // quem pagou/recebeu (D-PO-01)
  author: MemberRef;                                        // autor do cadastro (RN-001.1)
  updatedBy: MemberRef | null;                              // autor da última mutação
  isSharedExpense: boolean;                                 // "Dividir com a família"
  transferGroupId: string | null; isSettlement: boolean;
  counterpartAccount: { id: string; name: string } | null;  // pernas de transferência
  version: number; createdAt: string; updatedAt: string;
  deletedAt: string | null; deletionReason: "DELETED" | "UNDONE" | null;
};
export type TransactionDetailDTO = TransactionDTO & { editedBy: MemberRef | null };  // autor da última revisão UPDATE
export type CategoryDTO = { id: string; name: string; kind: "EXPENSE" | "INCOME"; icon: string };
export type RevisionDTO = {
  revision: number; action: "CREATE" | "UPDATE" | "DELETE" | "RESTORE" | "UNDO"; at: string; actor: MemberRef;
  changes: Array<{ field: string; label: string; from: unknown; to: unknown; fromLabel?: string; toLabel?: string }>;
};
```
Rótulos de `changes` (resolvidos na leitura; nomes de conta/categoria/membro vêm em `fromLabel/toLabel`): `amountInCents→Valor`, `description→Descrição`, `categoryId→Categoria`, `occurredOn→Data`, `payerMemberId→Quem pagou`, `isSharedExpense→Dividir com a família`, `accountId→Conta`, `note→Observação`.

---

## 3. Contratos de API

Todas `auth: "family"`; mutações exigem `Idempotency-Key`. Erros no envelope do SDD-000 §2.1.

| Rota | Corpo | Sucesso | Erros específicos |
| :-- | :-- | :-- | :-- |
| `GET /api/v1/categories?kind=EXPENSE\|INCOME` | — | `200 { items: CategoryDTO[] }` (por `sortOrder`, sem arquivadas) | — |
| `GET /api/v1/transactions/defaults` | — | `200 { accountId: string \| null; payerMemberId: string }` (conta do último lançamento do membro; senão conta de que é titular; senão a 1ª; senão `null`) | — |
| `POST /api/v1/transactions` | `CreateTransactionSchema` | `201 { transaction: TransactionDTO; account: { id: string; balanceInCents: number } }` | 400 (Zod) · 422 `FUTURE_DATE_NOT_ALLOWED` · 422 `CATEGORY_KIND_MISMATCH` · 422 `INVALID_REFERENCE` (conta/categoria/membro inexistente ou de outra família; `details:[{path}]`) |
| `GET /api/v1/transactions/:id` | — | `200 { transaction: TransactionDetailDTO }` | 404 |
| `PATCH /api/v1/transactions/:id` | `UpdateTransactionSchema` | `200 { transaction: TransactionDetailDTO; account: {id, balanceInCents} }` | 404 · 409 `VERSION_CONFLICT` · 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED` · 422 `NOT_EDITABLE` · 422 `TRANSACTION_DELETED` · 422 (mesmas de criação) |
| `POST /api/v1/transactions/:id/delete` | `TransactionStateSchema` | `200 { transaction }` | 404 · 409 `VERSION_CONFLICT` · 409 `ALREADY_DELETED` · 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED` · 422 `NOT_EDITABLE` |
| `POST /api/v1/transactions/:id/restore` | `TransactionStateSchema` | `200 { transaction }` | 404 · 409 `VERSION_CONFLICT` · 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED` · 422 `NOT_RESTORABLE` (não excluído, ou `UNDONE`) |
| `GET /api/v1/transactions/:id/history` | — | `200 { items: RevisionDTO[] }` (mais recente primeiro) | 404 |

**Listagem/extrato** (`GET /api/v1/transactions`) está no [SDD-005](SDD-005-extrato-e-home.md).

Mensagens exatas:
- `FUTURE_DATE_NOT_ALLOWED`: despesa "Para contas futuras, use Despesa prevista"; receita "A data da receita não pode ser futura".
- `VERSION_CONFLICT`: **"Este lançamento foi alterado por {Nome}. Recarregue para continuar."** (`details: { currentVersion, updatedBy: MemberRef }`).
- `SETTLED_PERIOD_CONFIRMATION_REQUIRED`: **"Este mês já foi acertado. O saldo do acerto será recalculado."** (`details: { periods: string[] }`).
- `NOT_EDITABLE`: "Transferências e acertos não podem ser editados. Use Desfazer."
- Validação: "Informe um valor maior que zero", "Escolha uma categoria", "Escolha uma conta".

---

## 4. Regras de negócio e algoritmos

### 4.1 Criação (`createTransaction`, em uma transação)
1. Resolver defaults: `occurredOn ??= hoje`; `payerMemberId ??= ctx.memberId`.
2. Validar referências **da família**: conta, categoria (não arquivada), membro pagador → senão `422 INVALID_REFERENCE`.
3. `categoria.kind` deve casar com `type` → senão `422 CATEGORY_KIND_MISMATCH`.
4. `occurredOn <= hoje` → senão `422 FUTURE_DATE_NOT_ALLOWED`.
5. `description ??= categoria.name`.
6. `INSERT Transaction`: `kind = type`, `direction` (`EXPENSE→DEBIT`, `INCOME→CREDIT`), `authorMemberId = ctx.memberId`, `isSharedExpense` (despesa: valor recebido; receita: `false`), `version = 1`.
7. `recordRevision(CREATE)`; devolver DTO + `balanceInCents` da conta.

### 4.2 Edição (`updateTransaction`)
1. Carregar `Transaction` da família (`404`). `type` ∈ {TRANSFER_OUT, TRANSFER_IN, OPENING} → `422 NOT_EDITABLE`; `deletedAt != null` → `422 TRANSACTION_DELETED`.
2. Em receita, `isSharedExpense` presente → `400 VALIDATION_ERROR`.
3. Validar referências/categoria/data como na criação para os campos enviados.
4. Calcular `changes` (campo a campo, comparando valor normalizado). **Sem diferenças** → `200` sem alterar `version` nem gravar revisão.
5. **Mês acertado:** se a despesa é/era **comum** (`isSharedExpense` antes ou depois) e o período de `occurredOn` (antes ou depois) tem acerto ativo, e a edição toca `amountInCents | occurredOn | payerMemberId | isSharedExpense` → exige `confirmSettledPeriod === true`, senão `409 SETTLED_PERIOD_CONFIRMATION_REQUIRED` (`details.periods`).
6. `UPDATE … SET …, version = version + 1, "updatedByMemberId" = :me WHERE id AND "familyId" AND version = :v`. 0 linhas → recarregar: se existe → `409 VERSION_CONFLICT` (nome de `updatedBy` na mensagem); senão `404`.
7. `recordRevision(UPDATE, changes)`; devolver DTO e saldo da conta (e da conta anterior, se mudou, em `account` apenas a nova).

### 4.3 Exclusão e restauração
- `delete`: mesmas guardas de 4.2 (item 1, 5 e controle de `version`); marca `deletedAt/By/Reason = DELETED`, `version + 1`, `updatedBy`; revisão `DELETE`. Já excluído → `409 ALREADY_DELETED`. Some de saldos, totais, extrato e acerto (todas as consultas filtram `deletedAt IS NULL`).
- `restore`: só `deletionReason = DELETED`; limpa as colunas de exclusão, `version + 1`; revisão `RESTORE`. Outro caso → `422 NOT_RESTORABLE`.
- Pernas de transferência: `422 NOT_EDITABLE` (usar `undo`).

### 4.4 Valor, saldo e acerto
- Despesa reduz e receita aumenta o saldo **na data**; como o saldo é derivado, editar/excluir/restaurar recalcula "imediatamente" (a próxima leitura).
- Alterações de despesa comum alteram o acerto automaticamente (SDD-002 deriva de `transactions`).

---

## 5. Interface

### 5.1 Drawer de lançamento (FLUXO-001 rev. 2)
- Acionado pelo FAB "+" (Home, extrato, contas). Se não há contas: diálogo **"Cadastre uma conta primeiro"** com atalho para `/contas` (nada é aberto).
- Ao abrir: `GET /transactions/defaults` + `["accounts"]` + `["categories", kind]` do cache; **gera a `Idempotency-Key`**; foca o campo valor (teclado numérico).
- Campos: Valor (máscara BRL, fonte grande), **Conta** (chip; padrão = `defaults.accountId`), **Categoria** (grade de ícones, na ordem de §SDD-003 4.3), **Quem pagou?** (seletor de avatares; padrão = logado; em receita o rótulo é **"Quem recebeu?"**), switch **"Dividir com a família"** (padrão ligado; **oculto em receita**), botão fixo **"Salvar Despesa"** / **"Salvar Receita"**. Em *Mais detalhes*: data (padrão hoje; máx. hoje), observação.
- Alternador *Nova Despesa / Nova Receita* troca grade de categorias, rótulos e visibilidade do switch; limpa a categoria escolhida.
- **Meta de velocidade**: com os padrões, o fluxo é valor → categoria → salvar (3 interações; a 4ª, opcional, é trocar a conta).
- **Estados**: ocioso · enviando ("Salvando…", botão desabilitado; reuso da chave) · sucesso (toast **"Despesa registrada com sucesso!"** / **"Receita registrada com sucesso!"**, fecha, nova chave na próxima abertura) · erro de campo · **sem conexão**: "Sem conexão. Seus dados continuam na tela, tente de novo." (formulário preservado; mesma chave).
- **Atualização otimista:** `onMutate` insere item provisório (`pending: true`) no topo de `["transactions", filtros]` cujo filtro/período o admita; `onError` desfaz; `onSuccess` troca pelo item do servidor e invalida `["accounts"]`, `["home"]`, `["settlement"]`, `["transactions"]`. O **saldo exibido só muda com a resposta do servidor**.

### 5.2 Detalhe, edição, exclusão, histórico (US-013)
- Detalhe do lançamento (drawer/rota `/extrato/[id]`): todos os campos, **"Registrado por {autor}"**, **"Pago por {payer}"**, **"Editado por {editedBy}"** quando houver revisão UPDATE, menu "⋯" com **Editar**, **Excluir**, **Histórico**. Para transferência/acerto: apenas **"Desfazer transferência"**/**"Desfazer acerto"** (sem Editar).
- **Editar** reutiliza o formulário (valores atuais, `version` do detalhe). Em `409 VERSION_CONFLICT`: diálogo com a mensagem do servidor e ação *Recarregar*; **a edição local é descartada**. Em `409 SETTLED_PERIOD_CONFIRMATION_REQUIRED`: diálogo de confirmação com o texto do servidor; confirmar reenvia com `confirmSettledPeriod: true` (mesma chave? **não**: nova `Idempotency-Key`, pois o corpo mudou).
- **Excluir:** diálogo **"Excluir lançamento?"**; sucesso → toast com ação **"Desfazer"** por **5 s** (chama `restore` com a `version` devolvida). Filtro **"Mostrar excluídos"** (SDD-005) lista com ação **Restaurar**.
- **Histórico:** linha do tempo com autor, data/hora, campo (rótulo), valor anterior → novo.
- Todas as mutações invalidam `["transactions"]`, `["accounts"]`, `["home"]`, `["settlement"]`.

---

## 6. Segurança, isolamento e auditoria
- `familyId` só da sessão; `authorMemberId` nunca do cliente; recurso de outra família = `404`; FKs compostas.
- Qualquer membro pode editar/excluir lançamentos da família (D-PO-02/US-013); toda mutação gera `TransactionRevision` (quem, quando, o quê). `TransactionRevision` é *append-only* (trigger) e `Transaction` não aceita `DELETE`.
- Logs (pino) sem descrição/nota de lançamentos (dado pessoal).

---

## 7. Testes obrigatórios (BDD → teste)

### US-005 (despesa)
| Cenário BDD | Testes |
| :-- | :-- |
| Despesa comum com sucesso | **I**: `POST` com `amountInCents: 15050`: conta com 100000 → saldo `84950`; `authorMemberId`=Lucas, `payerMemberId`=Lucas, `occurredOn`=hoje, `isSharedExpense=true`; revisão CREATE. **E**: toque em "+", "R$ 150,50", "Supermercado", "Salvar Despesa" → aviso "Despesa registrada com sucesso!" e saldo "R$ 849,50". |
| Registrar em nome de outro membro | **I**: `payerMemberId=Mariana` → `author=Lucas`, `payer=Mariana`. **E**: seletor "Quem pagou: Mariana". |
| Despesa pessoal | **I**: `isSharedExpense=false` persiste e **não** entra em `settlement` (assert cruzado com SDD-002). **E**: switch desligado. |
| Valor obrigatório e positivo | **U**: schema `0`, `-5`, `1.5`, `undefined` → "Informe um valor maior que zero". **I**: 400, nada gravado. **E**: mensagem exibida. |
| Categoria obrigatória | **U**: sem `categoryId` → "Escolha uma categoria". **E**: campo destacado. |
| Descrição omitida | **I**: sem `description` → `description = "Transporte"`; `"a"` → 400; `""` e `"   "` tratadas como ausente. |
| Duplo clique não duplica | **I**: `Promise.all` de 2 `POST` com a mesma chave → 1 linha, saldo reduzido 1×, 2ª resposta com `Idempotent-Replay`. **E**: duplo clique → 1 despesa. |
| Data retroativa | **I**: `occurredOn = ontem` aceito. **E**: "Mais detalhes" → ontem. |
| Tentar data futura | **I**: amanhã → 422 `FUTURE_DATE_NOT_ALLOWED` com a mensagem exata (relógio fixo, virada de dia em `America/Sao_Paulo`: 02:30 UTC de dia D ainda é D-1 em SP). **E**: mensagem exibida. |
| Falha de rede ao salvar | **E**: `route.abort()` no `POST` → mensagem "Sem conexão. Seus dados continuam na tela, tente de novo." e campos preservados; reenvio reusa a mesma chave e cria 1 despesa. **Componente (U)**: estado de erro preserva o formulário. |
| Família sem conta cadastrada | **E**: "+" → "Cadastre uma conta primeiro" com atalho. |
| Meta de velocidade | **E**: com padrões, conta os eventos de interação (preencher valor, clicar categoria, clicar salvar) ≤ 4. |
| (infra) Referências inválidas | **I**: conta/categoria/pagador de outra família → 422 `INVALID_REFERENCE` e nada gravado; categoria de receita em despesa → 422 `CATEGORY_KIND_MISMATCH`. |
| (infra) `.strict()` | **I**: corpo com `familyId`/`authorMemberId` → 400. |
| (infra) Isolamento | **I**: teste padrão para `GET/PATCH/delete/restore /transactions/:id` e `history`. |
| (infra) Formato | **U**: `parseBRL("R$ 1.250,90")=125090`, `parseBRL("1250,9")=125090`, `parseBRL("abc")=null`, `formatBRL(125090)="R$ 1.250,90"`. |
| (infra) Defaults | **I**: `GET /transactions/defaults` retorna a conta do último lançamento do membro; sem lançamentos, a conta de que é titular. |

### US-006 (receita)
| Cenário BDD | Testes |
| :-- | :-- |
| Registrar salário | **I**: Itaú 150000 + receita 500000 → saldo 650000; autor e payer = Mariana; `isSharedExpense=false`. **E**: "R$ 6.500,00". |
| Receita em nome de outro membro | **I**: `payerMemberId = Mariana`, autor Lucas. |
| Interface não exibe divisão | **E/Componente**: no modo Receita o switch não existe e as categorias são as 3 de receita. **I**: `isSharedExpense` no corpo de receita → 400; categoria de despesa em receita → 422. |
| Valor inválido | **U/I**: igual a US-005. |
| Duplo clique não duplica | **I/E**: igual a US-005. |
| (infra) Futura | **I**: 422 com "A data da receita não pode ser futura". |

### US-013 (correção, exclusão, auditoria)
| Cenário BDD | Testes |
| :-- | :-- |
| Corrigir valor | **I**: despesa 15050 (saldo 84950) → `PATCH amountInCents=10550` → saldo `89450`; `version` 2; detalhe com `editedBy = Mariana`; revisão `changes=[{field:"amountInCents",from:15050,to:10550}]`. **E**: "Editado por Mariana". |
| Trilha de auditoria | **I**: `history` lista CREATE e UPDATE com ator, data, campo, antes/depois; ordem decrescente; rótulos e `fromLabel/toLabel` (categoria/conta/membro). **I**: `UPDATE`/`DELETE` direto em `transaction_revisions` falha (trigger). |
| Excluir com confirmação | **I**: `delete` → some da listagem padrão, aparece com `includeDeleted`, saldo restabelecido; `ALREADY_DELETED` ao repetir. **E**: diálogo "Excluir lançamento?"; toast com "Desfazer". |
| Restaurar lançamento excluído | **I**: `restore` → volta ao saldo e à listagem; restaurar não excluído → 422. **E**: via "Mostrar excluídos" e via "Desfazer" em 5 s. |
| Conflito de edição | **I**: dois `PATCH` com a mesma `version` em `Promise.all` → um 200 e um 409 com "Este lançamento foi alterado por Mariana. Recarregue para continuar."; o perdedor não grava. **E**: duas páginas. |
| Acerto de contas recalculado | **I** (com SDD-002): painel "Lucas deve R$ 400,00" → excluir a despesa comum de R$ 400,00 da Mariana → "Lucas deve R$ 200,00". |
| Aviso em mês já acertado | **I**: após acerto de outubro, `PATCH amountInCents` em despesa comum de outubro **sem** flag → 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED`; **com** flag → 200. Editar só `description` não exige flag. **E**: diálogo e confirmação. |
| Desfazer um acerto | **I**: `POST /transfers/:id/undo` (SDD-004) de um acerto de 40000 → painel volta a "Lucas deve R$ 400,00" (as duas pernas `UNDONE`). **E**: "Desfazer acerto". |
| Transferência não é editável | **I**: `PATCH` e `delete` em perna → 422 `NOT_EDITABLE`. **E**: detalhe sem "Editar", com "Desfazer transferência". |
| Validações da edição | **U/I**: `amountInCents=0` → "Informe um valor maior que zero"; nada gravado. |
| (infra) Sem alteração | **I**: `PATCH` sem diferença → 200, `version` e revisões inalterados. |
| (infra) Edição de data/conta | **I**: mudar `accountId` move o saldo entre contas; `occurredOn` futura → 422. |
| (infra) Atomicidade | **I**: falha injetada ao gravar a revisão → a atualização não persiste. |

---

## 8. Estimativa e dependências
| História | PO | TL | Observação |
| :-- | :-: | :-: | :-- |
| US-005 | 5 | **5** | Drawer rápido, idempotência ponta a ponta, atualização otimista |
| US-006 | 3 | **2** | Reaproveita US-005 (`type = INCOME`) |
| US-013 | 3 | **8** | Edição/exclusão/restauração, `version`, auditoria, confirmação de mês acertado, UI de histórico e diálogos |
Dependências: US-004 (ledger, `recordRevision`); US-013 também usa `undo` de US-010 e o cálculo de acerto de US-009/011 (testes cruzados), logo é implementada por último.
