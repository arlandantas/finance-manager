# SDD-005: Extrato e Home (US-007, US-012)

- **Histórias**: [US-007](../../product-owner/backlog/stories/US-007-extrato-de-lancamentos.md) · [US-012](../../product-owner/backlog/stories/US-012-home-dashboard.md)
- **Fluxos**: FLUXO-001 (FAB "+"), FLUXO-003 (card de acerto)
- **Rastreabilidade**: NEED-006 (extrato simples e visão sintética) · NEED-001, NEED-002, NEED-007 · RN-001.1 · ADR-001, ADR-007, ADR-010, ADR-013
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-001](SDD-001-transacoes.md) (DTO de lançamento), [SDD-004](SDD-004-contas-e-ledger.md) (saldos), [SDD-002](SDD-002-split-e-acerto.md) (resumo do acerto)
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA

---

## 1. Gaps técnicos e decisões

| Pergunta / Gap | Resolução |
| :-- | :-- |
| Paginação e índices (US-007) | **Keyset** por `(occurredOn DESC, createdAt DESC, id DESC)`; cursor opaco; índice `(familyId, occurredOn DESC, createdAt DESC, id DESC)` do modelo. Sem `OFFSET`. |
| Filtros na URL (recomendação do PO) | **Aceita**: a tela `/extrato` lê/escreve os mesmos nomes de parâmetro da API (§3.1). |
| Totais do filtro | Calculados sobre **todo** o conjunto filtrado (não só a página), só nas requisições **sem `cursor`**. |
| Mesma regra de totais em todo lugar | Uma única função `buildLedgerWhere(filters)` alimenta lista **e** totais (propriedade testada: Σ itens = totais). Totais consideram só `EXPENSE`/`INCOME` ativos (ADR-007 §6). |
| Linhas de transferência no extrato | Aparecem como **duas linhas** (perna OUT e IN), com `transferGroupId` e `counterpartAccount`; acertos têm `isSettlement=true`. Não entram nos totais. `OPENING` **não aparece** no extrato. |
| Excluídos | Fora por padrão; `includeDeleted=true` os lista (inclui transferências **desfeitas**, sem ação de restaurar). |
| Filtro "comum/pessoal" | Aplica-se a **despesas**: `shared=true|false` restringe a `EXPENSE` (receitas e transferências ficam de fora quando o filtro está ativo). |
| Filtro por membro | `payerMemberId = m OR authorMemberId = m`. |
| Agregados da Home (consulta vs materializado) | **Consulta** em tempo real (ADR-001: medir antes). Reavaliar se p95 > 200 ms com 50 mil lançamentos. |
| Consistência dos blocos da Home | Leituras dentro de uma transação **somente leitura `REPEATABLE READ`** (um instantâneo). |
| Período da Home | Período corrente (`periodOf(hoje, cutDay)`); a API aceita `period` para testes/futuro (ADR-010). |
| "Quanto cada membro gastou" | Despesas (comuns **e** pessoais) em que o membro é `payer`; percentual por **maior resto** em 100 (soma 100). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/transacoes/schemas.ts (extrato)
const boolParam = z.enum(["true", "false"]).transform((v) => v === "true");

export const ListTransactionsQuerySchema = z.object({
  period: periodKeySchema.optional(),                 // padrão: período corrente
  from: dateISOSchema.optional(),                     // alternativa a period (ambos obrigatórios juntos)
  to: dateISOSchema.optional(),
  accountId: uuidSchema.optional(),
  memberId: uuidSchema.optional(),                    // pagou/recebeu OU autor
  categoryId: uuidSchema.optional(),
  type: z.enum(["EXPENSE", "INCOME", "TRANSFER"]).optional(),
  shared: boolParam.optional(),                       // true = comum; false = pessoal (só despesas)
  includeDeleted: boolParam.optional(),
  cursor: z.string().max(300).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
}).strict()
  .refine((v) => !(v.period && (v.from || v.to)), { message: "Use period ou from/to, não ambos" })
  .refine((v) => (v.from == null) === (v.to == null), { message: "Informe from e to juntos" })
  .refine((v) => !v.from || !v.to || (v.from <= v.to && daysBetween(v.from, v.to) <= 366), { message: "Intervalo inválido" });

export type LedgerFilters = {                         // normalizado, usado por lista e totais
  familyId: string; start: DateISO; end: DateISO;
  accountId?: string; memberId?: string; categoryId?: string;
  type?: "EXPENSE" | "INCOME" | "TRANSFER"; shared?: boolean; includeDeleted: boolean;
};

export type LedgerTotalsDTO = { incomeInCents: number; expenseInCents: number; balanceInCents: number; count: number };
export type ListTransactionsResponse = {
  items: TransactionDTO[];                            // SDD-001 §2
  nextCursor: string | null;
  period: { key: string; start: string; end: string } | null;   // null quando from/to
  totals: LedgerTotalsDTO | null;                     // null se houve `cursor`
  hasAnyTransactions: boolean | null;                 // null se houve `cursor`; exclui OPENING e excluídos
};

// src/modules/home/schemas.ts
export const HomeQuerySchema = z.object({ period: periodKeySchema.optional() }).strict();
export type HomeDTO = {
  period: { key: string; start: string; end: string };
  familyBalanceInCents: number;
  accounts: AccountDTO[];                             // SDD-004
  settlement: Pick<SettlementDTO, "period" | "status" | "suggestions" | "rule">;   // SDD-002 (sem listas longas)
  monthSummary: {
    incomeInCents: number; expenseInCents: number;
    byMember: Array<{ member: MemberRef; paidInCents: number; sharePercent: number }>;   // Σ sharePercent = 100 (ou 0 se sem despesas)
  };
  recent: TransactionDTO[];                           // últimos 5 (mesma base do extrato, sem filtro de período)
  onboarding: { hasAccount: boolean; hasOtherMember: boolean; hasTransaction: boolean; showChecklist: boolean };
  memberCount: number;
};
```
- `balanceInCents` do total = `income − expense` (pode ser negativo).
- `showChecklist` = `!hasAccount && !hasTransaction` (família nova sem contas nem lançamentos).

---

## 3. Contratos de API

### 3.1 `GET /api/v1/transactions` (extrato)
`auth: "family"`; sem `Idempotency-Key` (leitura).

| Parâmetro | Efeito |
| :-- | :-- |
| `period` / `from`+`to` | Faixa de `occurredOn` (inclusiva). Sem nenhum: período corrente. |
| `accountId`, `categoryId` | Igualdade. Em transferências, `accountId` casa com a conta da perna. |
| `memberId` | `payerMemberId = m OR authorMemberId = m`. |
| `type` | `EXPENSE` → `kind=EXPENSE`; `INCOME` → `kind=INCOME`; `TRANSFER` → `TRANSFER_OUT/IN`. Padrão: tudo menos `OPENING`. |
| `shared` | `true` → `EXPENSE AND isSharedExpense`; `false` → `EXPENSE AND NOT isSharedExpense`. |
| `includeDeleted` | Padrão `false` (`deletedAt IS NULL`). |
| `limit`, `cursor` | Paginação keyset. |

Resposta `200 ListTransactionsResponse`. Erros: `400 VALIDATION_ERROR` (parâmetros), `400 INVALID_CURSOR` ("Cursor inválido"), `401`, `403 NO_FAMILY`.

**Cursor:** `base64url(JSON.stringify({ d: occurredOn, c: createdAtISO, i: id }))`; condição `(occurredOn, createdAt, id) < ($d, $c, $i)` por comparação de linhas; buscar `limit + 1` para saber se há próxima página.

**SQL de referência** (via `$queryRaw` + `Prisma.sql`, fragmento comum `buildLedgerWhere`):
```sql
WHERE t."familyId" = $1 AND t.kind <> 'OPENING'
  AND t."occurredOn" BETWEEN $start AND $end
  [AND t."deletedAt" IS NULL]                      -- quando !includeDeleted
  [AND t."accountId" = $a] [AND t."categoryId" = $c]
  [AND (t."payerMemberId" = $m OR t."authorMemberId" = $m)]
  [AND t.kind = ... | t.kind IN ('TRANSFER_OUT','TRANSFER_IN')]
  [AND t.kind = 'EXPENSE' AND t."isSharedExpense" = $s]
```
**Totais** (mesmo `WHERE`, mais `AND t."deletedAt" IS NULL AND t.kind IN ('EXPENSE','INCOME')` — **sempre**, mesmo com `includeDeleted`):
```sql
SELECT COALESCE(SUM("amountInCents") FILTER (WHERE kind='INCOME'),0)  AS income,
       COALESCE(SUM("amountInCents") FILTER (WHERE kind='EXPENSE'),0) AS expense
```
`count` = número de linhas **listáveis** do filtro (inclui transferências; respeita `includeDeleted`).
Detalhes e histórico: `GET /transactions/:id` e `/history` (SDD-001).

### 3.2 `GET /api/v1/home`
`auth: "family"`; `200 HomeDTO`. Mesma `GET` aceita `?period=YYYY-MM`.

Montagem (em uma transação `REPEATABLE READ` somente leitura):
1. `accounts` + `accountBalances` (SDD-004); `familyBalanceInCents = Σ`.
2. `settlement` = `computeSettlement` do período (SDD-002 §5), reduzido a `status`, `suggestions`, `rule`, `period`.
3. `monthSummary.income/expense` = `ledgerTotals` do período **sem outros filtros**; `byMember`: `SELECT payerMemberId, SUM(amountInCents) … WHERE kind='EXPENSE' AND deletedAt IS NULL AND occurredOn BETWEEN …`; todos os membros aparecem (0 se não gastaram); `sharePercent = apportion(100, pesos = paidInCents, ordinal canônico)`; total 0 → todos 0.
4. `recent` = mesma consulta do extrato, `limit 5`, sem período (os 5 mais recentes por `occurredOn, createdAt, id`), `deletedAt IS NULL`, sem `OPENING`.
5. `onboarding`: `hasAccount` (≥ 1 conta), `hasOtherMember` (membros > 1), `hasTransaction` (existe lançamento não-`OPENING` ativo).

---

## 4. Interface

### 4.1 Extrato (`/extrato`)
- **Filtros na URL**: nomes idênticos aos do §3.1; alterações usam `router.replace` (sem poluir o histórico). Barra de **chips** (período, conta, membro, categoria, tipo, comum/pessoal) e, no mobile, *drawer* de filtros; seletor de mês anterior/próximo (`period`). Chip "Mostrar excluídos".
- **Totais fixos no topo** (receitas, despesas, saldo do filtro) vindos de `totals` da **primeira** página; mantidos durante a rolagem.
- **Lista**: cards no mobile; tabela compacta no desktop (≥ 1024 px). Linha: data, descrição, categoria, **valor** (receita em verde com `+`; despesa neutra/vermelha com `−`, sempre com sinal além da cor), avatar de quem pagou/recebeu, conta, marcador **Comum**/**Pessoal** (despesas). Transferência: ícone de setas, "Transferência para {conta}"/"de {conta}", marcador "Mesma transferência" ligando as duas linhas (destaque ao passar o mouse/foco no mesmo `transferGroupId`); acerto: "Acerto de contas - {Mês}".
- **Rolagem infinita** (`useInfiniteQuery`, `IntersectionObserver`, `limit = 30`); nunca carrega tudo.
- **Detalhe**: abre o drawer do SDD-001 §5.2 (com "Registrado por/Pago por").
- **Estados**: skeleton de linhas e totais · **vazio sem lançamentos** (`hasAnyTransactions=false` e filtros padrão): "Faça seu primeiro lançamento" + botão "+" · **vazio com filtro**: **"Nenhum lançamento encontrado"** + ação **"Limpar filtros"** (volta ao período corrente sem demais filtros) · erro de leitura com "Tentar de novo" · sem conexão (padrão SDD-000).
- **Novo lançamento sem recarregar**: item otimista no topo (SDD-001 §5.1) + invalidação de `["transactions"]`.
- Chave de cache: `["transactions", <filtros normalizados em objeto estável>]`.

### 4.2 Home (`/`)
Ordem dos blocos (US-012): (1) **Saldo da família** (título "Saldo", valor `familyBalanceInCents`) + lista de contas com saldo (link para `/contas`); (2) card **"Acerto do mês"** com a frase-herói do SDD-002 §6.1 (mesmos textos), clique → `/acerto?period=<corrente>`; para `NEEDS_MORE_MEMBERS` o card convida a convidar; (3) **Resumo do mês**: Receitas, Despesas e **"Mariana R$ 900,00 (75%)"** por membro; (4) **Últimos 5 lançamentos** + link "Ver extrato" (`/extrato`); (5) **FAB "+"** (abre o drawer de despesa com foco no valor).
- **Família nova** (`showChecklist`): passo a passo **"1. Cadastre uma conta  2. Convide quem divide as contas  3. Faça seu primeiro lançamento"**, cada passo com estado concluído (`hasAccount`, `hasOtherMember`, `hasTransaction`) e atalho.
- **Aviso de boas-vindas** `?joined=1` (SDD-003 §5.5).
- **Skeletons** por bloco (alturas fixas para não saltar o layout); estados de erro por bloco (cartão com "Tentar de novo"), sem derrubar a tela.
- **Responsivo** 375/1280 px: uma coluna no mobile; grade 2 colunas no desktop; sem rolagem horizontal.
- Chave de cache: `["home", period]`; invalidada por qualquer mutação de lançamento, conta, transferência, acerto, regra.

---

## 5. Segurança e isolamento
`makeRepos` impõe `familyId` em **toda** consulta, inclusive nos `$queryRaw` (o fragmento inicial `t."familyId" = $1` é obrigatório e coberto por teste: lint de teste que falha se o SQL gerado não contiver `"familyId"`). Cursor é validado (estrutura e tipos) e **não carrega `familyId`** (a família vem da sessão). Parâmetros `accountId/memberId/categoryId` de outra família simplesmente não casam (lista vazia; não `403`).

---

## 6. Testes obrigatórios (BDD → teste)

### US-007
Contexto comum (**I/E**): outubro com despesa comum `15050` (Lucas, Supermercado, Nubank), despesa pessoal `8000` (Mariana, Lazer e restaurantes) e receita `500000` (Mariana, Salário).

| Cenário BDD | Testes |
| :-- | :-- |
| Extrato padrão | **I**: `GET /transactions?period=2026-10` devolve 3 itens na ordem `occurredOn desc, createdAt desc, id desc`; cada item traz valor, categoria, conta, `payer`, `isSharedExpense`. Sem `OPENING`. **E**: três linhas com os dados e marcadores. |
| Filtrar por membro | **I**: `memberId=Lucas` → itens em que Lucas é payer **ou** autor (incluir caso "Lucas registrou despesa paga por Mariana" e "Mariana registrou despesa paga por Lucas"). **E**: chip de membro. |
| Filtrar por categoria e tipo | **I**: `categoryId=Supermercado&type=EXPENSE` → 1 item; `totals.expenseInCents=15050`, `incomeInCents=0`. |
| Filtrar por período | **I**: lançamentos de 30/09 e 01/10: `period=2026-09` só os do mês; fuso `America/Sao_Paulo` (data é `DATE`, sem deslocamento). **E**: seletor de mês anterior muda a URL e a lista. |
| Detalhe mostra o autor | **I**: detalhe (SDD-001) com `author=Lucas`, `payer=Mariana`. **E**: "Registrado por Lucas" e "Pago por Mariana". |
| Estado vazio com filtro | **E**: filtro sem resultado → "Nenhum lançamento encontrado" e "Limpar filtros" que restaura o padrão. **I**: `items=[]`, `hasAnyTransactions=true`. |
| Estado vazio sem lançamentos | **I**: família sem lançamentos → `hasAnyTransactions=false` (conta com `OPENING` não conta). **E**: convite ao primeiro lançamento. |
| Novo lançamento aparece sem recarregar | **E**: no extrato, registrar via "+" e ver a linha no topo sem navegação (`page.waitForURL` não dispara; asserção de contagem). **Componente (U)**: cache otimista insere e reverte em erro. |
| Isolamento entre famílias | **I**: teste padrão (SDD-000 §9.4) com `GET /transactions` e filtros por `accountId` de outra família (lista vazia). |
| (infra) Paginação keyset | **I**: 120 lançamentos, vários com **mesmo `occurredOn` e `createdAt`**; percorrer `limit=25` até `nextCursor=null` → nenhuma duplicata/omissão, ordem total estável; `limit=101` → 400; cursor adulterado → `400 INVALID_CURSOR`. |
| (infra) Totais = lista | **I (propriedade)**: para combinações de filtros, Σ(`INCOME`) e Σ(`EXPENSE`) dos itens listados em **todas as páginas** (sem excluídos) == `totals`; `balance = income − expense`. |
| (infra) Totais excluem transferência, acerto, abertura, excluídos | **I (regressão)**: com transferência, acerto, `OPENING` e lançamento excluído presentes, `totals` não os contabiliza; `type=TRANSFER` → totais 0 e `count` > 0. |
| (infra) `includeDeleted` | **I**: excluídos aparecem com `deletedAt`/`deletionReason`; transferência desfeita aparece como `UNDONE`. |
| (infra) `shared` | **I**: `shared=false` → só despesas pessoais; `shared=true` → só comuns; ambos excluem receitas e transferências. |
| (infra) Parâmetros inválidos | **U/I**: `period` + `from` → 400; `from` sem `to` → 400; `from > to` → 400; intervalo > 366 dias → 400. |
| (infra) Índice | **I**: `EXPLAIN` da consulta paginada contém o índice `(familyId, occurredOn, createdAt, id)` (verificação informativa; não quebra o CI se o planner optar por outro com poucas linhas). |

### US-012
| Cenário BDD | Testes |
| :-- | :-- |
| Home com dados | **I**: contas Itaú 650000 e Nubank 84950 → `familyBalanceInCents=734950`, `accounts`, `settlement`, `recent` (5). **E**: "Saldo da família: R$ 7.349,50", lista de contas, card de acerto e 5 lançamentos. |
| Resumo do mês exclui transferências e acertos | **I**: receita 500000, despesas 120000, transferência 100000 e acerto → `monthSummary.income=500000`, `expense=120000`. **E**: textos "R$ 5.000,00"/"R$ 1.200,00". |
| Participação por membro | **U**: `apportion(100, [90000, 30000])=[75,25]`; total 0 → `[0,0]`; 3 membros `[1,1,1]` → soma 100. **I**: Mariana 90000 e Lucas 30000 → `{Mariana 75, Lucas 25}`; inclui despesas pessoais. **E**: "Mariana R$ 900,00 (75%)" e "Lucas R$ 300,00 (25%)". |
| Card de acerto abre o painel | **E**: clique → `/acerto?period=2026-10` com o painel. |
| Botão de lançamento rápido | **E**: "+" abre o drawer de despesa com o foco no campo valor (`document.activeElement`). |
| Família nova sem dados | **I**: `onboarding.showChecklist=true`. **E**: passo a passo "1. Cadastre uma conta  2. Convide quem divide as contas  3. Faça seu primeiro lançamento". |
| Carregamento | **E**: com resposta atrasada (`route.fulfill` após delay) → skeletons presentes e **sem salto de layout** (`CLS` do bloco ≤ 0,01 medido por `PerformanceObserver` no teste ou altura fixa verificada). |
| Layout responsivo | **E**: projetos desktop (1280) e mobile (375): `document.documentElement.scrollWidth <= innerWidth`; todos os blocos visíveis/utilizáveis. |
| (infra) Últimos 5 | **I**: 7 lançamentos → `recent` = 5 mais recentes, sem `OPENING`/excluídos; inclui transferências. |
| (infra) Snapshot | **I**: leitura usa transação `REPEATABLE READ` (verificado por *spy* no `$transaction` com `isolationLevel`). |
| (infra) Isolamento | **I**: Home da Família B nunca contém dados da A. |
| (infra) Erro parcial | **E/Componente**: falha em um bloco mostra o cartão de erro do bloco sem derrubar os demais (a API é única; usar `HomeDTO` parcial simulado no teste de componente). |

---

## 7. Estimativa e dependências
| História | PO | TL | Observação |
| :-- | :-: | :-: | :-- |
| US-007 | 3 | **5** | SQL cru com keyset, totais coerentes com a lista, filtros na URL, rolagem infinita, vazios e otimista |
| US-012 | 3 | **5** | Agregação multi-bloco, instantâneo `REPEATABLE READ`, checklist e estados por bloco |
Dependências: US-007 depende de US-005/006 (dados); `ledgerTotals`/`buildLedgerWhere` nascem em US-007 e são reutilizados por US-012 e pelos testes de regressão de US-009/010/011. US-012 depende de US-004, US-007 e US-009 (`computeSettlement`).
