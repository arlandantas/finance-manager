# Spec 10a — Lançamentos, contas, extrato e base

Atualizado: 2026-10-31. Continua em 10b (tags e cor). Regra do "Só meu": spec própria.

## Resumo
- Ledger único (`Transaction`): despesa, receita, abertura, pernas de transferência/acerto e pagamento de fatura. Saldo sempre derivado (soma). Editar/excluir é lógico, com versão e histórico.
- Período = competência (compra no cartão e parcela contam no mês da fatura; o resto, pela data). O mesmo filtro alimenta Extrato, Resumo e acerto.
- Valores começam OCULTOS por usuário/dispositivo; MCP ignora a preferência. Não há orçamento/teto (módulo `orcamento` vazio).
- Contas/categorias: qualquer membro cria, renomeia e arquiva; só ADMIN exclui conta (nunca usada).

## Regras
| # | Regra | Onde |
| :-- | :-- | :-- |
| 1 | Dinheiro: `amountInCents` inteiro seguro 1..9.999.999.999, `BIGINT`, `toCents` lança fora da faixa; saldo inicial aceita negativo; sem `parseFloat`; `formatBRL`/`parseBRL` via BigInt; rateio por maior resto (`apportion`) | `lib/money.ts`, `lib/apportion.ts` |
| 2 | Data contábil = `DATE` sem fuso; "hoje" no servidor em `America/Sao_Paulo` (`Family.timezone` ignorado). Data futura 422 `FUTURE_DATE_NOT_ALLOWED`. Relógio injetável; `APP_NOW_OVERRIDE` só fora de produção | `lib/dates.ts`, `lib/clock.ts` |
| 3 | Período = `periodOf(data, cutDay)`, chave `YYYY-MM`. `Family.cutDay` 1..28 sem UI (sempre 1). Resumo aceita até hoje + 12 meses (`PERIOD_OUT_OF_RANGE`) | `lib/period.ts`, `home/service.ts` |
| 4 | Predicado ÚNICO de período = `competenceOn` (derivada por gatilho `tx_sync_competence`: comum = `occurredOn`; parcela = fechamento da fatura). `check:imports` proíbe filtro de data fora de `ledger-where.ts`. `visibilityPredicate` é no-op | `transacoes/ledger-where.ts` |
| 5 | Mutação via `withApi`: CSRF (Origin, `application/json`, senão 403 `BAD_ORIGIN`), sessão 401, rate limit 300/min 429, membro ativo 403 `NO_FAMILY`, papel, Zod `.strict()` 400, `Idempotency-Key` UUID (400 `IDEMPOTENCY_KEY_REQUIRED`), `$transaction` 30 s | `lib/api/with-api.ts` |
| 5b | Idempotência: mesma chave+corpo = replay com `Idempotent-Replay: true`; corpo diferente 422 `IDEMPOTENCY_KEY_REUSED`; escopo usuário; retenção 24 h; só 2xx guardado | `lib/api/idempotency.ts` |
| 6 | Isolamento: `familyId` da sessão, nunca do cliente; repos filtram por `familyId`; outra família = 404. Importar `@/lib/db` só em `lib/api`, `lib/auth`, `repo.ts`, `ledger*.ts`, tests, prisma, scripts | `scripts/check-imports.ts` |
| 7 | Concorrência otimista: `version` no corpo; 409 `VERSION_CONFLICT` ("alterado por {Nome}"). Travas: `lockFamilySplit` sempre a 1ª; contas `FOR SHARE` ao postar (ordem de id), `FOR UPDATE` ao arquivar; categorias `pg_advisory_xact_lock(família:tipo)` | `contas/lock.ts` |
| 8 | Erros: `{error:{code,message,details?}}` pt-BR; 500 `INTERNAL` genérico (log pino com `requestId`). Paginação keyset `(occurredOn, createdAt, id)` desc, `limit` 30 (máx 100), cursor base64url | `lib/api/errors.ts`, `extrato.ts` |
| 9 | `POST /transactions`: despesa em conta OU compra no cartão (`accountId` nulo; exatamente um), ou receita (sempre em conta, nunca dividida; `isSharedExpense=true` = 400). Descrição opcional (vazia = nome da categoria; 2..100); observação até 500 | `transacoes/service.ts` |
| 9b | `isSharedExpense` padrão false ("Só meu"); categoria do mesmo tipo e ATIVA (arquivar depois não é erro; baixa de prevista ignora arquivamento); quem pagou padrão = logado; `tags?` só em despesa/receita | `transacoes/service.ts` |
| 10 | `PATCH`: só despesa/receita sem plano de parcelas; transferência/acerto/abertura/pagamento de fatura 422 `NOT_EDITABLE` (usar Desfazer); parcela `INSTALLMENT_NOT_EDITABLE`; compra no cartão não troca forma (`PAYMENT_SOURCE_NOT_EDITABLE`) | `transacoes/mutations.ts` |
| 10b | Travas de edição: fatura paga `INVOICE_PAID_LOCKED`; conta arquivada `ACCOUNT_ARCHIVED_LOCKED`; baixa de prevista só por Desfazer pagamento (`LINKED_TO_PLANNED`); mês acertado + despesa dividida 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED` até `confirmSettledPeriod:true`. PATCH só de `tags` é exceção (10b regra 25) | `transacoes/mutations.ts` |
| 11 | Excluir/restaurar: `POST .../delete` e `.../restore` (lógico, `deletedAt`+`deletionReason=DELETED`); restaurar só `DELETED`. Revisão append-only `TransactionRevision` (CREATE/UPDATE/DELETE/RESTORE/UNDO; ator real); `GET .../history` | `ledger.ts` |
| 12 | Extrato `GET /transactions`: filtros `period` OU `from/to` (até 24 meses), conta, cartão, membro (pagou OU autor), categoria, tipo, `shared`, `origin` (APP/ASSISTANT), `q` (ILIKE 2..50, sem unaccent), `includeDeleted`, `tagIds`, `untagged` | `extrato.ts`, `extrato/filters.ts` |
| 12b | Totais (só sem cursor) = EXPENSE/INCOME ativos, mesma cláusula da lista; OPENING nunca aparece; transferência = 2 linhas; acerto marcado `isSettlement`. Filtros espelham a URL | `extrato.ts` |
| 13 | Contas: nome único por família (sem caixa, ignora excluídas) 409 `DUPLICATE_ACCOUNT_NAME`; criação grava `OPENING` na mesma transação (não editável; data não futura). Tipos CHECKING/SAVINGS/CASH; `excludeFromAvailable` = reserva (fora do disponível, dentro de `reservesInCents`); titular informativo | `contas/*` |
| 13b | Arquivar: saldo = 0 dentro do lock (`ACCOUNT_BALANCE_NOT_ZERO`; `GET /accounts/:id/archive-check` antecipa o bloqueio no diálogo, US-054), qualquer membro; reativar: qualquer membro; excluir (lógico, libera o nome): só ADMIN e conta "nunca usada" (`ACCOUNT_HAS_HISTORY`); renomear arquivada 422 | `contas/*` |
| 14 | Transferência = `TransferGroup` + 2 pernas (OUT/IN) numa transação; origem pode ficar negativa (API aceita; UI confirma); contas diferentes; data não futura; desfazer = grupo inteiro (`UNDONE`, com `version`). Acerto reusa `createTransferGroup(kind=SETTLEMENT)` | `contas/transfers.ts` |
| 15 | Conta de origem sugerida (pagar fatura/baixa), função pura no cliente: titular com saldo suficiente (mais usada em 90 dias, depois maior saldo) > outra suficiente > maior saldo (marca insuficiente); arquivada nunca. Defaults: última conta/cartão do membro, senão a de que é titular, senão a 1ª | `contas/suggest-source.ts` |
| 16 | Categorias: nome 2..30, único por família+tipo sem caixa (inclui arquivadas; erro orienta reativar); máx 40 por tipo; ícone de lista fechada (26); qualquer membro arquiva/renomeia/reativa; nunca arquivar a última ativa do tipo (`LAST_ACTIVE_CATEGORY`); sem exclusão. Padrão: 8 despesa + 3 receita | `categorias/*`, `familia/default-categories.ts` |
| 17 | Resumo do Mês (`GET /month-summary` e Home; `REPEATABLE READ`): receita/despesa = `ledgerTotals`; resultado = receita - despesa; "A pagar" = previstas PREVISTO + faturas não pagas com vencimento no período (+ atrasado se período corrente); saldo previsto = saldo atual (sem reservas) - a pagar + a receber | `home/service.ts` |
| 17b | `byMember` = despesas por pagador (comuns e pessoais) em % por maior resto (soma 100); "Previstas" = faturas + previstas abertas + baixadas; "Não previstas" = despesa sem cartão e sem baixa; `isEmpty` sem receita, despesa nem a pagar; compra no cartão entra na despesa pela data | `home/service.ts` |
| 18 | Home (`GET /home`): Resumo + saldos (card recolhível) + indicador de acerto (só com acerto ligado) + `dueSoon` + 10 recentes (`occurredOn <= hoje`, sem parcelas futuras) + checklist (`showChecklist` = sem conta e sem lançamento) | `home/service.ts` |
| 19 | Ocultar valores: `Money` é o único componente que formata (`check:imports` proíbe `formatBRL`/`Intl currency` em `src/app` e `src/components` fora de `money*.tsx`); padrão OCULTO (snapshot de servidor sempre oculto); máscara `R$ •••••`; toque revela 5 s; erros do servidor passam por `maskMoneyInText`; toasts sem valor. `MoneyInput`, %, datas e nomes visíveis | `components/money.tsx`, `lib/mask-money.ts` |
| 20 | Preferências só no navegador (`localStorage`, `try/catch`, fallback em memória), chave `fm:v1:u:<userId>:<pref>`: `hideValues` (true), `balancesExpanded` (false), `homeSummaryOpen` (false); tema `fm:v1:theme` (system/light/dark, anti-flash). Nunca dado financeiro | `lib/prefs.ts`, `lib/theme.ts` |
| 21 | Estados de UI: skeleton (sem spinner de página), vazio com ação, erro de leitura com "Tentar de novo", offline = mutação bloqueada com texto fixo e formulário preservado, enviando = botão desabilitado, `Idempotency-Key` gerada ao abrir o formulário e reusada nos reenvios, 409 = diálogo "Recarregar", validação por campo | `components/providers.tsx`, `lib/http.ts` |
| 21b | TanStack Query: `staleTime` 30 s, `retry` 2 só rede/5xx em leitura, mutação sem retry. Responsivo 375/1280 px, alvo de toque >= 44 px, contraste AA (teste) | `components/providers.tsx` |
| 22 | Stack: Next 16 (App Router, Route Handlers REST; sem Server Actions para mutação financeira), React 19, Prisma 7 + `pg`, Zod 4, Auth.js 5 beta, Tailwind 4, Radix Dialog, sonner, pino, Biome, Vitest 5, Playwright + playwright-bdd, Node 22, pnpm 11. NÃO usados: pg-boss, Serwist/PWA, Recharts, Sentry, Testcontainers | `package.json` |

## Invariantes
1. Saldo(conta) = Σ CREDIT - Σ DEBIT das linhas ativas (inclui OPENING; compra no cartão fora; pagamento de fatura debita a conta). Única função: `accountBalances`.
2. Totais de receita/despesa = só EXPENSE/INCOME ativos; transferência, acerto, abertura e pagamento de fatura nunca entram. Σ itens listados = totais (ambos usam `buildLedgerWhere`).
3. Banco impede `DELETE` em `transactions` (gatilho) e `UPDATE/DELETE` em `transaction_revisions`; CHECKs `tx_kind_shape_chk`, `tx_amount_chk`, `tx_split_kind_chk`; transferência com exatamente uma perna de cada tipo (`tx_transfer_leg_uq`); pagamento de fatura ativo único.
4. Toda mutação grava revisão com `revision = version` resultante, dentro da transação do `withApi`.
5. Nenhuma tela renderiza valor monetário em HTML de servidor.

## Riscos aceitos
- Busca `q` sem acento (`unaccent` ausente). Saldo inicial nunca editável (correção via conciliação futura). Resumo de mês futuro usa saldo ATUAL. Fuso fixo `America/Sao_Paulo`. `cutDay` sem UI.
- Sem orçamento/tetos/metas nem escrita offline/PWA (só bloqueio com aviso). Qualquer membro arquiva/renomeia/reativa conta de outro titular. Idempotência: janela 24 h, chave por usuário.
- Ocultar valores não protege dados (MCP e exportação ignoram). Dev lento na 1ª abertura de cada tela.

## Fontes
Código: `src/modules/transacoes/{service,mutations,extrato,ledger-where,schemas,repo,optimistic,hooks}.ts`; `contas/{service,archive,transfers,ledger,ledger-queries,lock,suggest-source,schemas}.ts`; `categorias/{service,schemas,repo}.ts`; `home/{service,repo,schemas,copy}.ts`; `lib/{money,dates,period,clock,apportion,prefs,mask-money,http}.ts`; `lib/api/{with-api,idempotency,errors,rate-limit}.ts`; UI `app/(app)/{extrato,contas,categorias,home-screen.tsx}`, `components/{money,money-input,transaction-drawer,quick-add}.tsx`; `prisma/schema.prisma`, `scripts/check-imports.ts`.
Testes: int `us-004-contas`, `us-005-006-lancamentos`, `us-007-extrato`, `us-010-transferencia`, `us-012-home`, `us-013-corrigir-lancamento`, `us-013b-mes-acertado`, `us-014-categorias`, `us-023-conta-origem`, `us-024-descricao-busca`, `us-025-resumo-do-mes`, `us-032-arquivar-conta`, `us-054-archive-check`, `us-057-conta-reserva`, `with-api`, `sec039-idempotencia-escopo`, `sec031-idempotencia-excluidos`, `sec030-033-conta-excluida`; unit `lib/{money,period,dates-clock,apportion,prefs,theme,http-idempotency-key}`, `transacoes/{schemas,optimistic}`, `contas/*`, `categorias/schemas`, `ui/{money,contrast}`; E2E `tests/e2e/features/US-004..014, 023..027, 032, 036..038, 054`.

## Pendências
- E2E completo com falhas preexistentes (DEV-100, DEV-96), suíte completa não verificada (último: 718 unit, 1106 int). Validar assimetria à vista x parcela e busca sem acento.
- "Nova despesa sem rolagem em 375x667" não fecha (DEV-148): rodapé "Salvar" fixo com rolagem interna. `TransactionDrawer` tem "Quando?" e "Repetir" e salva por `door.ts`.
- Divergências: `accountId` é nulo em compra no cartão (SDD-001 diz obrigatório); Home mostra 10 recentes; `orcamento`, `transacoes/index.ts`, `contas/index.ts` vazios; `Family.timezone`/`currency` não lidos. US-060: "Por conta" do A pagar lê `listAccountBalances`; `contas/hooks.ts` invalida `["payables"]`.
