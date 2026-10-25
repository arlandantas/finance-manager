# Estado vigente: Lançamentos, contas, extrato e base (convenções transversais)

Atualizado: 2026-10-26. Fonte de verdade: código + testes (§f). Mudou a regra? Atualize ESTE arquivo no mesmo commit. Quem pode alterar "Só meu": ver [so-meu.md](so-meu.md) (não repetido aqui).

## a) Resumo para o usuário
- O ledger é uma tabela só (`Transaction`): despesa, receita, abertura, pernas de transferência/acerto e pagamento de fatura. Saldo da conta é sempre derivado (soma), nunca gravado. Editar/excluir é lógico, com versão e histórico; nada é apagado de fato.
- Período = competência (compra no cartão e parcela contam no mês da fatura; o resto, pela data). O mesmo filtro alimenta Extrato, Resumo do Mês e acerto, então os totais conferem entre telas.
- Valores começam OCULTOS em cada usuário/dispositivo; o olho alterna e tocar revela por 5 s. O assistente (MCP) ignora essa preferência (D-GES-35).
- Contas/categorias: qualquer membro cria, renomeia e arquiva; só o Administrador exclui conta (e só se nunca usada). Não há orçamento por categoria/teto (módulo `orcamento` é casca vazia; AP1 não iniciado).
- Aberto: nenhuma implementação em curso nesta área. Homologação visual no navegador de várias telas segue incompleta (E2E tem falhas preexistentes, §e).
- Decisões que dependem do usuário: nenhuma bloqueante; hipóteses vigentes em `manager/decisoes-para-o-usuario.md` (ex.: D-PO-02 todos usam todas as contas).

## b) Regras vigentes
| # | Regra | Onde |
| :-- | :-- | :-- |
| 1 | Dinheiro: `amountInCents` inteiro seguro, 1..9.999.999.999 (R$ 99.999.999,99); banco `BIGINT`, `toCents` lança fora da faixa. Saldo inicial de conta aceita negativo. Sem `parseFloat`; `formatBRL`/`parseBRL` via BigInt. Rateio por maior resto (`apportion`). | `lib/money.ts`, `lib/apportion.ts` |
| 2 | Data contábil = `DATE` sem fuso (`YYYY-MM-DD`); "hoje" calculado no servidor em `America/Sao_Paulo` (fixo; `Family.timezone` existe mas é ignorado). Data futura: 422 `FUTURE_DATE_NOT_ALLOWED` (despesa: "use Despesa prevista"). Relógio injetável; `APP_NOW_OVERRIDE` e relógio dev só fora de produção. | `lib/dates.ts`, `lib/clock.ts` |
| 3 | Período = `periodOf(data, cutDay)`; chave `YYYY-MM` do mês de início. `Family.cutDay` 1..28 existe, SEM UI (sempre 1 na prática). Resumo aceita até hoje + 12 meses (`PERIOD_OUT_OF_RANGE`). | `lib/period.ts`, `home/service.ts` |
| 4 | Predicado ÚNICO de período = `competenceOn` (coluna derivada por gatilho `tx_sync_competence`: lançamento comum = `occurredOn`; parcela = fechamento da fatura). `check:imports` proíbe filtro de data fora de `ledger-where.ts`. `visibilityPredicate` é no-op (gancho ADR-018). | `transacoes/ledger-where.ts` |
| 5 | Toda mutação `POST/PATCH/PUT/DELETE` via `withApi`: CSRF (Origin = AUTH_URL ou origem dev + `application/json`, senão 403 `BAD_ORIGIN`), sessão (401), rate limit 300/min por usuário (429), membro ativo (403 `NO_FAMILY`), papel, Zod `.strict()` (400), `Idempotency-Key` UUID (400 `IDEMPOTENCY_KEY_REQUIRED`), tudo em `$transaction` (30 s). Mesma chave+corpo = replay com `Idempotent-Replay: true`; corpo diferente = 422 `IDEMPOTENCY_KEY_REUSED`. Escopo da chave: usuário; retenção 24 h (limpeza oportunista). Só 2xx é guardado. | `lib/api/with-api.ts`, `idempotency.ts` |
| 6 | Isolamento: `familyId` vem da sessão, nunca do cliente; repos filtram por `familyId`; outra família = 404. Importar `@/lib/db` só em `lib/api`, `lib/auth`, `repo.ts`, `ledger*.ts`, tests, prisma, scripts. | `check-imports.ts` |
| 7 | Concorrência otimista: `version` no corpo; conflito 409 `VERSION_CONFLICT` com "alterado por {Nome}". Travas: `lockFamilySplit` é sempre a 1ª; contas `FOR SHARE` ao postar (ordem de id), `FOR UPDATE` ao arquivar; categorias `pg_advisory_xact_lock(família:tipo)`. | `contas/lock.ts` |
| 8 | Erros: envelope `{error:{code,message,details?}}`, mensagens pt-BR; 500 `INTERNAL` genérico (log pino com `requestId`, sem message). Paginação keyset `(occurredOn, createdAt, id)` desc, `limit` 30 (máx 100), cursor base64url. | `lib/api/errors.ts`, `extrato.ts` |
| 9 | Lançamento (`POST /transactions`): despesa em conta OU compra no cartão (`accountId` nulo; exatamente um dos dois), ou receita (sempre em conta, nunca dividida). Descrição opcional (vazia = nome da categoria; 2..100); observação até 500; `isSharedExpense` padrão false ("Só meu"); categoria deve ser do mesmo tipo e ATIVA (manter categoria depois arquivada não é erro; baixa de prevista ignora arquivamento). Quem pagou padrão = logado. | `transacoes/service.ts` |
| 10 | Editar (`PATCH`): só despesa/receita sem plano de parcelas; transferência/acerto/abertura/pagamento de fatura = 422 `NOT_EDITABLE` (usar Desfazer); parcela = `INSTALLMENT_NOT_EDITABLE`; compra no cartão não troca forma de pagamento (`PAYMENT_SOURCE_NOT_EDITABLE`); fatura paga trava (`INVOICE_PAID_LOCKED`); conta arquivada trava (`ACCOUNT_ARCHIVED_LOCKED`); baixa de prevista só por Desfazer pagamento (`LINKED_TO_PLANNED`). Mês já acertado + despesa dividida: 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED` até `confirmSettledPeriod:true`. | `transacoes/mutations.ts` |
| 11 | Excluir/restaurar: `POST .../delete` e `.../restore` (lógico, `deletedAt`+`deletionReason=DELETED`); restaurar só `DELETED`. Revisão append-only `TransactionRevision` (CREATE/UPDATE/DELETE/RESTORE/UNDO; ator real). Histórico: `GET .../history`. | `ledger.ts` |
| 12 | Extrato (`GET /transactions`): filtros `period` OU `from/to` (até 24 meses), conta, cartão, membro (pagou OU autor), categoria, tipo, `shared`, `origin` (APP/ASSISTANT), `q` (ILIKE 2..50, sem acento-insensibilidade), `includeDeleted`. Totais (só sem cursor) = EXPENSE/INCOME ativos; mesma cláusula da lista; OPENING nunca aparece; transferência = 2 linhas; acerto marcado `isSettlement`. Filtros espelham a URL. | `extrato.ts`, `extrato/filters.ts` |
| 13 | Contas: nome único por família (sem caixa, ignora excluídas) = 409 `DUPLICATE_ACCOUNT_NAME`; criação grava `OPENING` na mesma transação (não editável; data de abertura não futura). Tipos CHECKING/SAVINGS/CASH. `excludeFromAvailable` = reserva (fora do saldo disponível, dentro de `reservesInCents`). Titular é informativo. Arquivar: saldo = 0 dentro do lock (`ACCOUNT_BALANCE_NOT_ZERO`), qualquer membro; reativar: qualquer membro; excluir (lógico, libera o nome): só ADMIN e só conta "nunca usada" (`ACCOUNT_HAS_HISTORY`). Renomear arquivada = 422. | `contas/*` |
| 14 | Transferência = `TransferGroup` + 2 pernas (OUT/IN) numa transação; origem pode ficar negativa (API aceita; UI confirma); contas diferentes; data não futura; desfazer = grupo inteiro (`UNDONE`, com `version`). Acerto reusa `createTransferGroup(kind=SETTLEMENT)`. | `contas/transfers.ts` |
| 15 | Conta de origem sugerida (pagar fatura/baixa): função pura no cliente: titular com saldo suficiente (mais usada em 90 dias, depois maior saldo) > outra suficiente > maior saldo (marca insuficiente); arquivada nunca. Defaults do lançamento: última conta/cartão do membro, senão a de que é titular, senão a 1ª. | `contas/suggest-source.ts`, `transacoes/service.ts` |
| 16 | Categorias: nome 2..30, único por família+tipo ignorando caixa (inclui arquivadas: erro orienta reativar); máx 40 por tipo (ativas+arquivadas); ícone de lista fechada (26); arquivar/renomear/reativar por qualquer membro; nunca arquivar a última ativa do tipo (`LAST_ACTIVE_CATEGORY`); sem exclusão. Padrão da família: 8 despesa + 3 receita (`familia/default-categories.ts`). | `categorias/*` |
| 17 | Resumo do Mês (`GET /month-summary`, e bloco da Home; `REPEATABLE READ`): receita/despesa = `ledgerTotals`; resultado = receita - despesa; "A pagar" = previstas PREVISTO + faturas não pagas com vencimento no período (+ todo atrasado se período corrente); saldo previsto = saldo atual das contas ativas (reservas fora) - a pagar; `byMember` = despesas por pagador (comuns e pessoais) em % por maior resto (soma 100); "Previstas" = faturas + previstas abertas + baixadas; "Não previstas" = despesa sem cartão e sem baixa; `isEmpty` sem receita, despesa nem a pagar. Compra no cartão entra na despesa pela data (não pela fatura). | `home/service.ts`, `extrato.ts` |
| 18 | Home (`GET /home`): Resumo + saldos (card recolhível) + indicador de acerto (só com acerto ligado) + a vencer (`dueSoon`) + 10 recentes (só `occurredOn <= hoje`, sem parcelas futuras) + checklist de onboarding (`showChecklist` = sem conta e sem lançamento). | `home/service.ts` |
| 19 | Ocultar valores: `Money` é o único componente que formata leitura (`check:imports` proíbe `formatBRL`/`Intl currency` em `src/app` e `src/components` fora de `money*.tsx`); padrão OCULTO (snapshot de servidor sempre oculto, sem flash); máscara fixa `R$ •••••`; toque revela 5 s; mensagens de erro do servidor passam por `maskMoneyInText`; toasts de sucesso sem valor. Entradas (`MoneyInput`), %, datas e nomes ficam visíveis. | `components/money.tsx`, `lib/mask-money.ts` |
| 20 | Preferências só no navegador (`localStorage`, `try/catch`, fallback em memória), chave `fm:v1:u:<userId>:<pref>`: `hideValues` (padrão true), `balancesExpanded` (false), `homeSummaryOpen` (false); tema por dispositivo `fm:v1:theme` (system/light/dark, script anti-flash no head). Nunca dado financeiro; nada no servidor. | `lib/prefs.ts`, `lib/theme.ts` |
| 21 | Estados de UI (todas as telas): skeleton (sem spinner de página), vazio com ação, erro de leitura com "Tentar de novo", sem conexão = mutação bloqueada com texto fixo e formulário preservado (escrita offline adiada, ADR-004), enviando = botão desabilitado, `Idempotency-Key` gerada ao abrir o formulário e reusada nos reenvios, 409 = diálogo "Recarregar", validação por campo. TanStack Query: `staleTime` 30 s, `retry` 2 só para rede/5xx em leitura, mutação sem retry. Responsivo 375/1280 px, alvo de toque >= 44 px, contraste AA (teste). | `components/providers.tsx`, `lib/http.ts` |
| 22 | Stack em uso: Next 16 (App Router, Route Handlers REST; sem Server Actions para mutação financeira), React 19, Prisma 7 + driver `pg`, Zod 4, Auth.js 5 beta (sessão em banco), Tailwind 4, Radix Dialog, sonner, pino, Biome, Vitest 5, Playwright + playwright-bdd, Node 22, pnpm 11. Fora da stack real: pg-boss, Serwist/PWA, Recharts, Sentry, Testcontainers (ADR-001 desatualizado nisso). | `package.json` |
| 23 | Ambiente: dev local Docker (`db` 5442, `db-test` 5443 tmpfs, mailpit 1025/8025), app na porta 3100; login de teste (`AUTH_DEV_LOGIN`) só local; produção = Vercel + Prisma Postgres, cron diário de expurgo (sem worker/pg-boss); `AUTH_DEV_LOGIN`, `APP_HOMOLOG_MODE`, `APP_NOW_OVERRIDE` em deploy de produção/preview derrubam o boot e `/api/health` responde 503. Migração por `prisma migrate deploy` no build de produção. | `producao.md`, `ambiente-local.md`, ADR-031 |

## c) Invariantes
1. Saldo(conta) = Σ CREDIT - Σ DEBIT das linhas ativas (inclui OPENING; compra no cartão fora; pagamento de fatura debita a conta). Única função: `accountBalances`.
2. Totais de receita/despesa = só EXPENSE/INCOME ativos; transferência, acerto, abertura e pagamento de fatura nunca entram. Σ itens listados = totais (lista e totais usam `buildLedgerWhere`).
3. Banco impede `DELETE` em `transactions` (gatilho) e `UPDATE/DELETE` em `transaction_revisions`; CHECKs de forma (`tx_kind_shape_chk`, `tx_amount_chk`, `tx_split_kind_chk`); transferência tem exatamente uma perna de cada tipo (`tx_transfer_leg_uq`); pagamento de fatura ativo único.
4. Toda mutação grava revisão com `revision = version` resultante; operações de postagem rodam dentro da transação do `withApi`.
5. Receita nunca é "dividida" (`isSharedExpense=false`; enviar `true` = 400).
6. Nenhuma tela renderiza valor monetário em HTML de servidor.

## d) Limitações e riscos aceitos
| Item | Limitação | Razão |
| :-- | :-- | :-- |
| Busca `q` | Sem insensibilidade a acento (`unaccent` não instalada) | Aceito (D-GES-22); documentado no SDD-013 |
| Saldo inicial | Nunca editável; correção só via conciliação (AP2, não iniciada) | Decisão R1 |
| Resumo de mês futuro | Usa saldo ATUAL (não projeta meses intermediários) | TL-09, aceito |
| Fuso | Fixo em `America/Sao_Paulo` | ADR-010 R1 |
| `cutDay` | Sem UI | AP1 não iniciado |
| Orçamento/tetos/metas | Não existem (AP1) | Escopo: pós-v0 |
| Escrita offline / PWA | Não existe; só bloqueio com aviso | ADR-004 adiado |
| Conta: permissão | Qualquer membro arquiva/renomeia/reativa conta de outro titular | D-PO-02 (todos usam todas as contas) |
| Idempotência | Janela de 24 h; chave por usuário (não por família) | ADR-009 |
| Ocultar valores | Não protege dados (só a tela); MCP e exportação ignoram | D-GES-35 |
| Dev | Servidor de desenvolvimento lento na 1ª abertura de cada tela | Observado na homologação R2.1 |

## e) Em andamento / pendências
- Nada em implementação nesta área.
- E2E completo: havia falhas preexistentes (12 determinísticas alinhadas em DEV-100; 19 falhas na rodada DEV-96); estado atual da suíte E2E completa NÃO verificado neste consolidado. Últimos números registrados: 718 unit, 1106 int verdes (D-GES-60).
- Homologação visual pendente de achados da R2.1 (`_historico/stakeholder/homologacao-r21.md`): selo "Comum" com acerto desligado, FAB cobrindo ações no mobile; não confirmados como resolvidos.
- Divergência de produto a validar: assimetria à vista x parcela (competência) e limitação de acento na busca (D-GES-22).
- Não há tela de configuração do dia de corte nem de orçamento.

## f) Mapa de fontes
Código: `src/modules/transacoes/{service,mutations,extrato,ledger-where,schemas,repo,optimistic,hooks}.ts`; `contas/{service,archive,transfers,ledger,ledger-queries,lock,suggest-source,schemas}.ts`; `categorias/{service,schemas,repo}.ts`; `home/{service,repo,schemas,copy}.ts`; `lib/{money,dates,period,clock,apportion,prefs,mask-money,http}.ts`, `lib/api/{with-api,idempotency,errors,rate-limit}.ts`; UI `app/(app)/{extrato,contas,categorias,home-screen.tsx}`, `components/{money,money-input,transaction-drawer,quick-add}.tsx`; `prisma/schema.prisma`, `scripts/check-imports.ts`. Regra de "Só meu": `transacoes/ownership.ts` (ver so-meu.md).
Testes: integração `us-004-contas`, `us-005-006-lancamentos`, `us-007-extrato`, `us-010-transferencia`, `us-012-home`, `us-013-corrigir-lancamento`, `us-013b-mes-acertado`, `us-014-categorias`, `us-023-conta-origem`, `us-024-descricao-busca`, `us-025-resumo-do-mes`, `us-032-arquivar-conta`, `us-057-conta-reserva`, `with-api`, `sec039-idempotencia-escopo`, `sec031-idempotencia-excluidos`, `sec030-033-conta-excluida`; unit `lib/{money,period,dates-clock,apportion,prefs,theme,http-idempotency-key}`, `transacoes/{schemas,optimistic}`, `contas/*`, `categorias/schemas`, `ui/{money,contrast}`; E2E `tests/e2e/features/US-004..014, 023..027, 032, 036..038`.
Docs: SDD-000..007, 010, 012, 013 em `tech-lead/sdd/`; ADR-001, 004, 007, 009, 010, 013, 024, 031 em `tech-lead/adrs/`; `tech-lead/architecture/{modelo-de-dados,ambiente-local,producao}.md`; US-004..007, 012..014, 023..027, 032 em `product-owner/backlog/stories/`; decisões D-GES-10/11/16/22/26/35, D-PO-01/02/04; DEV-36, DEV-100, DEV-110.

Divergências docs x código (código vence):
1. SDD-001 §1 (GAP-1) diz `accountId` obrigatório em todo lançamento; no código é nulo em compra no cartão (SDD-008, CHECK `tx_kind_shape_chk`).
2. SDD-005/010 dizem Home com 5 recentes e "a pagar" com regra hoje+7; código: 10 recentes (`dueSoon` separado). SDD-010 §2 omite campos reais (`planned`, `unplannedInCents`, `projectedExpenseInCents`, `reservesInCents`, `dueSoon`, `homeSummaryOpen`), vindos de US-057/061/063.
3. SDD-000/ADR-001 listam pg-boss, PWA (Serwist), Recharts, Sentry, Testcontainers: nada disso está em `package.json`/`src`. Jobs = Vercel Cron; testes = `db-test` do compose.
4. ADR-005/ADR-026 (hospedagem adiada/Railway) superados por ADR-031; ADR-024 tem revisão 2.
5. Módulos `orcamento` e (parcialmente) `transacoes/index.ts`, `contas/index.ts` são arquivos vazios (`export {}`); o ADR-001 os cita como módulos de domínio.
6. `Family.timezone` e `Family.currency` existem no schema mas nenhum código os lê.
