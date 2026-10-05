# SDD-017: Cor por conta/cartão e receitas previstas (US-050, US-051) — **ESBOÇO** (R3)

- **Histórias**: [US-050](../../product-owner/backlog/stories/US-050-cor-por-conta-e-cartao.md) · [US-051](../../product-owner/backlog/stories/US-051-receitas-previstas-e-saldo-previsto.md)
- **Fluxos**: [FLUXO-014](../../product-owner/flows/FLUXO-014-parcelamento-tags-e-analise.md), [FLUXO-006](../../product-owner/flows/FLUXO-006-home-resumo-do-mes.md), [FLUXO-005](../../product-owner/flows/FLUXO-005-despesas-previstas.md)
- **Rastreabilidade**: NEED-017 (RN-017.1..4), NEED-015 (RN-015.4), NEED-004 · Q-F03 · D-PO-30, D-PO-31 · [ADR-015](../adrs/ADR-015-despesa-prevista-como-entidade-propria.md) (§7 prevê generalização), [SDD-009](SDD-009-despesas-previstas.md), [SDD-010](SDD-010-resumo-do-mes-ocultar-valores-e-preferencias.md), US-037 (tokens de tema)
- **Status**: **Esboço** · Autor: Agente Tech Lead · Estimativas: **US-050 = 3 · US-051 = 5**

## 1. US-050 — cor
- `enum AccountColor { BLUE GREEN PURPLE ORANGE PINK TEAL RED YELLOW GRAY BROWN }` (10 valores, nomes em pt-BR na UI: Azul, Verde, Roxo, Laranja, Rosa, Turquesa, Vermelho, Amarelo, Cinza, Marrom); coluna `color` `NOT NULL` em `bank_accounts` e `credit_cards`.
- **Migração dos existentes** (SQL, determinística e sem tela): por família, ordenar contas e cartões por `createdAt, id` e atribuir a paleta em ciclo (`row_number() % 10`). Novas: **primeira cor ainda não usada** na família (senão a de menor uso); `color` opcional no `Create` (padrão calculado no servidor) e editável no `PATCH` (pode repetir, RN-017.4). Conta/cartão arquivados mantêm a cor.
- **Tokens**: cada cor tem 2 tons (claro/escuro) em `globals.css` (variáveis por tema, US-037); teste de contraste (`contrastRatio` ≥ 3:1 do ponto contra o fundo, nos dois temas). O **nome nunca some** (ponto + texto). Seletor acessível: grade de 10 botões com nome falado e marca de seleção em texto.
- `AccountDTO.color`, `CardDTO.color`, `TransactionDTO.account/card.color`; componente `SourceBadge` (ponto + nome) em Extrato, Home, "Pagar com", faturas e cartões.
- Testes: unidade (escolha da cor livre/menos usada, ciclo da migração), integração (migração em dados existentes; `PATCH`; repetição permitida), componente (leitor de tela), E2E dos BDD.

## 2. US-051 — receitas previstas (decisão: **reaproveitar `PlannedExpense` com `kind`**)
| Pergunta do PO | Resolução |
| :-- | :-- |
| Entidade nova ou `kind` | **`kind`**: `enum PlannedKind { EXPENSE, INCOME } DEFAULT EXPENSE` em `planned_expenses` (ADR-015 §7 já previa generalizar). Mesma máquina de estados (`PREVISTO → PAGO`, rótulo "Recebido" na UI), mesmos guardas (`version`, `LINKED_TO_PLANNED`, desfazer, baixa única). Evita duplicar `service/repo/rotas/testes`. **Dívida de nome** (`planned_expenses`/`PlannedExpense`) registrada; renomear só no AP1. |
| Invariantes | `CHECK ("kind" = 'EXPENSE' OR "isSharedExpense" = false)` (receita não entra no acerto); categoria precisa ser do mesmo tipo (`CategoryKind`) do `kind` (validação de serviço, `INVALID_REFERENCE`); `status` e `paidTransactionId` como hoje. |
| Baixa de receita | "Receber": `createIncomeCore` (extraído de `createTransaction`, como `createExpenseCore` na US-019) com conta destino, data e **valor efetivo**; `payerMemberId` = quem recebeu; desfazer = exclusão lógica `UNDONE` da `Transaction` e `PREVISTO` (SDD-009 §4.4). |
| Impacto em `/previstas` e "A pagar" | `listPayables`/`listDueItems` filtram `kind = 'EXPENSE'` (**a lista "A pagar" não muda**). Nova `listReceivables(period)` (mesmos filtros, `kind = 'INCOME'`) e rota `GET /api/v1/receivables`. Tela `/previstas` ganha abas "A pagar" / "A receber" / "Pagas e recebidas" (a rota continua `/previstas`). |
| Resumo do Mês | `MonthSummaryDTO.toReceive: { totalInCents; overdueCount; items }` e `projectedBalanceInCents = saldoAtual − aPagar + aReceber`; `projectedBalanceFormula = "SALDO_ATUAL_MENOS_A_PAGAR_MAIS_A_RECEBER"` **somente quando existir receita prevista no período** (sem elas, rótulo e cálculo da R2.1 permanecem). Receita prevista **pendente não entra** em `incomeInCents` (fica fora do ledger). |
| Acerto | Nada muda (`isSharedExpense = false` forçado; `kind = EXPENSE` na base do acerto). |
- API: `POST/GET/PATCH /planned-expenses` aceitam `kind`; `POST /planned-expenses/:id/pay` com `kind=INCOME` usa `PayPlannedIncomeSchema` (`accountId` destino). Mensagens: "Esta receita prevista já foi recebida" (`PLANNED_ALREADY_PAID` com `kind`), "Receita prevista cadastrada".
- Testes: regressão de **todas** as consultas da R2 (`kind` default); Resumo (vetor: saldo 734950, a pagar 125890, a receber 500000 ⇒ **projetado 1109060**); baixa com valor efetivo 510000; desfazer; atrasada; não entra em `income` nem no acerto; isolamento.

## 3. Dados (migrações `us050_cores`, `us051_previstas_receita`; `modelo-de-dados.md` §9)
Colunas e enums acima; backfill de cores; `planned_expenses.kind` com `DEFAULT 'EXPENSE'` (linhas existentes viram despesa) e `CHECK`s.

## 4. Impacto
`contas/*`, `cartoes/*` (cor), `previstas/{schemas,service,repo,payables}.ts` (`kind`), `home/*` (Resumo), `previstas-screen.tsx`, `planned-drawer.tsx`, `pay-drawer.tsx` (variante "Receber"), componentes de origem (`SourceBadge`), `prisma/seed.ts`, fábricas (`makePlanned({ kind })`).
