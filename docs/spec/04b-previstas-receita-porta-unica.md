# Spec 04b — Previstas: receita prevista, saldo previsto, resumo por conta, porta única

Atualizado: 2026-11-07
Base de previstas/séries: [04](04-previstas-series.md).

## Resumo
- Receita prevista (US-051): mesma tabela com `kind`; "Receber" gera a receita real; Resumo ganha "A receber" e saldo previsto completo.
- Resumo por conta no A pagar (US-060): `byAccount` derivado dos mesmos itens de `collectOpenPayables`.
- Porta única (US-090/091): "Já aconteceu / Vai acontecer" e "Repetir todo mês" no `TransactionDrawer`, orquestrada no cliente.

## Regras
Receita prevista (US-051, SDD-017, ADR-023):
| # | Regra | Fonte |
| :-- | :-- | :-- |
| 19 | `planned_expenses.kind` (`EXPENSE` padrão, `INCOME`), IMUTÁVEL (`PATCH` com `kind` => 400 por `.strict()`); categoria do mesmo tipo (`INVALID_REFERENCE`); `isSharedExpense=false` sempre (schema 400 "Receita não é dividida" + CHECK `planned_income_not_shared_chk`); nunca entra no acerto. | `schemas.ts`, `service.ts`, migração `20261031020000_us051_previstas_receita` |
| 19b | Mesma máquina, `version`, travas e regras "Só meu" da despesa: receita prevista nasce "Só meu"; só responsável/controladores editam e recebem. | `service.ts` |
| 20 | "Receber" (`pay` com `kind=INCOME`): `createIncomeCore` (`allowArchivedCategory`), `accountId` = destino, `paidOn` <= hoje, valor efetivo livre, `payerMemberId` = quem recebeu (padrão responsável); desfazer = mesma mecânica. | `transacoes/service.ts` |
| 20b | Excluir/restaurar a receita gerada => 422 `LINKED_TO_PLANNED` com mensagem de receita. Mensagens por kind em `plannedCopy`. | `copy.ts`, `mutations.ts` |
| 20c | `payPlannedExpense` mantém, para receita, todas as travas de pagador/"Só meu" da despesa (receita só é recebida por quem controla a prevista; DEV-173). | `service.ts` |
| 21 | "A pagar" só `kind=EXPENSE` (filtro em `listOpen*`). `GET /planned-expenses` aceita `kind=EXPENSE\|INCOME\|ALL` (padrão EXPENSE). `GET /receivables?period=` = INCOME PREVISTO do período (+ atrasadas no mês corrente), atrasadas primeiro. | `repo.ts`, `payables.ts`, `rules.ts` |
| 22 | Resumo: `toReceive` (`null` sem receita pendente no recorte), `projectedBalanceInCents = saldo atual - A pagar + A receber`, `projectedBalanceFormula`. Receita pendente fora de `incomeInCents`/extrato/acerto; baixa move o valor para a receita do mês do recebimento. | `home/service.ts`, `rules.ts#projectedBalance` |
| 22b | Rótulo com receitas: "Saldo atual, menos o que falta pagar, mais o que falta receber". MCP `resumo` herda o saldo previsto. | `home/copy.ts` |
| 23 | UI: `/previstas` (título "Previstas") com abas A pagar / A receber / Pagas e recebidas (`?tab=receber\|pagas`); drawer com tipo Despesa/Receita (só no cadastro); `pay-drawer` variante "Receber" (conta de destino, sem aviso de negativo); linha "A receber" no Resumo da Home com "Receber" e selo "Atrasada". | `previstas-screen.tsx`, `planned-drawer.tsx`, `pay-drawer.tsx`, `home-screen.tsx` |
| 24 | Exportação traz `tipo` (EXPENSE\|INCOME) em cada prevista. | `privacidade/export*.ts` |

Resumo por conta (US-060, SDD-029):
- `GET /payables` ganhou `byAccount` (`previstas/by-account.ts`, derivada dos MESMOS `items` do `collectOpenPayables`); Σ `dueInCents` das linhas = `totals.dueInCents` = `toPay.totalInCents`. Inclui "Só meu" alheio (Q-U24); `paymentAccountId` no item; rota em `RepeatableRead`; `listAccountBalances` em `contas/service.ts`.
- Fatura soma na conta pagadora ATIVA do cartão (US-089); sem conta ou conta arquivada = "Sem conta definida". `previstas_do_mes` (MCP) não muda.
- UI `previstas/by-account-block.tsx`: grade responsiva única, "Falta R$ X" com ícone, filtro por conta no cliente com chip, rodapé "Total"; `contas/hooks.ts` invalida `["payables"]`.
- Texto da lista vazia segue "Nenhuma conta a pagar neste mês" (DEV-144, US-018).

Porta única (US-090/091, SDD-031):
- Orquestração no cliente, sem rota/serviço novos: `src/modules/lancamento/door.ts` (puro: `serviceOf`, `availability`, `buildSubmission`, `validateSubmission`) + `use-door-submit.ts`. NOW -> `POST /transactions`; LATER -> `POST /planned-expenses`; LATER + "Todo mês" -> `POST /recurring-expenses`.
- `TransactionDrawer`: "Quando?" (`SegmentedChoice`), linha de efeito `aria-live`, "Vencimento" fora de "Mais detalhes" em LATER, "Repetir: Não | Todo mês" (Dia, Começa em, Termina), aviso "Padrão deste modo: Só meu"; `door-parts.tsx` (`WhenSwitch`, `RepeatFields`). Botões "Salvar despesa/receita/previsão".
- "Vai acontecer" indisponível (aria-disabled + dica visível que recebe o foco) em Receita e com cartão.
- Chave de idempotência regerada ao mudar de serviço, salvo após falha de rede (seletor travado): `useDoorKey` (SDD-031 §8.1-7).
- Chave repetida devolve 422 `IDEMPOTENCY_KEY_REUSED`, não 409; futura em NOW devolve "Para contas futuras, use Despesa prevista" (DEV-159).

Transferência prevista (US-100, US-100b e US-101 servidor e US-101b telas da série implementadas; ADR-037):
- Tabela própria `planned_transfers` (não é `kind` de `planned_expenses`): origem ≠ destino, contas ativas da família, valor > 0, vencimento, descrição opcional, `PREVISTA | EFETIVADA`, `version`, exclusão lógica; atrasada = `PREVISTA` e `dueOn < hoje`. Sem "Só meu": qualquer membro ativo cadastra, edita, exclui e efetiva.
- Sem efeito até efetivar: fora de saldo, extrato, totais, acerto, "A pagar", Resumo e MCP. Só o resumo por conta soma `plannedTransfersInCents` (- na origem, + no destino; coluna "Transferências previstas" só quando há); Σ `dueInCents` = total do "A pagar" segue.
- Efetivar = transferência real (`createTransferGroup`, valor/data efetivos, data <= hoje) + `EFETIVADA` na mesma transação (`lockFamilySplit` → prevista `FOR UPDATE` → contas). Desfazer a transferência devolve `PREVISTA`. Efetivada não edita nem exclui. Conta arquivada impede efetivar; conta com prevista pendente ou série ativa não arquiva (`ACCOUNT_HAS_PLANNED_TRANSFERS`).
- Série mensal `recurring_transfers` (US-101; migração `20261107000400_us101_recurring_transfers`, expand; CHECKs `recurring_transfer_*`, `planned_transfer_series_chk`, único `(familyId, seriesId, occurrenceMonth)` sem filtro de exclusão): origem e destino obrigatórios e diferentes, contas ativas, `startMonth` entre o mês atual e +11, dia 1..31 (29-31 cai no último dia), fim `NONE|COUNT`. `ensureRecurrenceHorizon` também chama `materializeTransfers` (mesmo atalho e `lockFamily`; `createMany skipDuplicates`); série com conta arquivada/excluída não gera (defesa; arquivar é bloqueado na 101b) e completa quando a conta volta. Ocorrência = `planned_transfers` com `seriesId`/`occurrenceMonth`/`isException`; efetivar cada uma isolada (US-100). Mudar valor/contas/data de uma ocorrência a marca `isException` (só descrição não). Editar (`effectiveFrom` >= mês atual): reescreve `PREVISTA` com mês >= from, vencimento >= hoje e sem exceção; além do novo fim, exclui; efetivadas e exceções ficam. Encerrar: exclui `PREVISTA` com vencimento >= hoje (inclui exceções); atrasadas e efetivadas ficam; repetir ou editar encerrada => 409 `SERIES_ENDED`. Editar com conta (nova ou atual) arquivada => 422 `INVALID_REFERENCE`. `GET /planned-transfers` e `GET /recurring-transfers` chamam o gancho de geração antes de listar (`prepare`). Ordem de travas: advisory da família → série → ocorrências `FOR UPDATE` (id) → contas. Sem "Só meu": qualquer membro ativo opera; ex-membro autor não bloqueia nada.
- Rotas da série (`/recurring-transfers`, POST com `Idempotency-Key`, corpos `.strict()`): GET/POST; `/[id]` GET (`?impactFrom=YYYY-MM` devolve `impact` `{affectedCount, keptRealizedCount, keptExceptionCount, endCount}`) e PATCH; `/[id]/end`. Código: `previstas/{transfer-series,transfer-series-generate,transfer-series-dto,transfer-series-repo}.ts`. Exportação LGPD: `transferenciasRecorrentes` e, nas previstas, `recorrenciaId`/`mesOcorrencia`/`alterada`. Exclusão da família: `recurring_transfers` em `FAMILY_TABLES_DELETE_ORDER`. Testes: `tests/integration/us-101-transferencia-recorrente.int.test.ts`, `tests/unit/previstas/transfer-series.test.ts` (varredura de datas).
- Servidor (US-100): `previstas/{transfer-schemas,transfer-repo,transfer-service}.ts`; rotas `/planned-transfers` (GET, POST), `/[id]` (GET, PATCH), `/[id]/delete`, `/[id]/realize` (POST com `Idempotency-Key`; `Create`/`Update`/`Realize` `.strict()`). Erros: `INVALID_REFERENCE` (conta inativa/alheia), `VERSION_CONFLICT` ("alterada por {nome}"), `PLANNED_TRANSFER_REALIZED_LOCKED` (422), `PLANNED_TRANSFER_ALREADY_REALIZED` (409), `ACCOUNT_ARCHIVED_LOCKED`, `FUTURE_DATE_NOT_ALLOWED`. `undoTransferGroup` reabre a prevista (`reopenByGroup`). Migração `20261107000300_us100_planned_transfers` (expand, CHECKs `planned_transfer_*`). Testes: `tests/integration/us-100-transferencia-prevista.int.test.ts`; `lock-coverage` cobre `realizePlannedTransfer`.
- Entrada só pela tela Previstas (aba "Transferências", `?tab=transferencias`); a porta única não ganha transferência nesta fase.
- Telas (US-100b): `previstas/{transfers-tab,planned-transfer-drawer,realize-transfer-drawer}.tsx` + `modules/previstas/transfer-hooks.ts` (invalida `planned-transfers`, `payables`, `accounts`, `transactions`, `home`; `useUndoTransfer` também invalida `planned-transfers`). Lista: origem → destino, `Money`, vencimento, selos "Atrasada"/"Efetivada"; no mês corrente traz as atrasadas de meses anteriores; efetivada só "Ver transferência" (Extrato). Efetivar: valor padrão o previsto, data padrão hoje (máx. hoje), aviso de origem negativa.
- Resumo por conta: `transfer-extras.ts` (`plannedTransferExtras`) alimenta `extras` de `buildByAccount` com o mesmo recorte do "A pagar" (período; corrente + atrasadas); lado de conta arquivada não entra; coluna "Transferências previstas" (sinal visível) só quando `columns.plannedTransfers`. `totals`, `toPay`, Home e MCP não mudam.
- Telas da série (US-101b): `planned-transfer-drawer.tsx` ganha "Repetir: Não | Todo mês" (`RepeatFields` via `transfer-repeat.tsx`; Dia, Começa em, Termina; sem "Vencimento"); "Todo mês" faz `POST /recurring-transfers` ("Salvar transferência mensal"; chave regerada ao alternar). Lista: selo "Todo mês"; menu "Editar série" (`transfer-series-edit.tsx`, aviso "Muda N; ficam M efetivadas e K alteradas" via `?impactFrom=` do mês atual, antes de salvar; 409 "alterada por {nome}" com "Recarregar") e "Encerrar série" (`transfer-series-end.tsx`, confirmação com contagem). Forma pura: `previstas/transfer-series-form.ts`; hooks em `transfer-hooks.ts` (`useCreate/Update/EndTransferSeries`, `useTransferSeries`, `useTransferSeriesImpact`). Ações de série valem para o mês atual em diante (série encerrada: mensagem, sem salvar). Testes: `tests/unit/previstas/transfer-series-form.test.ts`, `tests/integration/us-101b-arquivar-conta-com-serie.int.test.ts`, E2E `US-100-transferencia-prevista.feature` + `US-101b-transferencia-mensal.steps.ts`.
- Arquivar conta (`contas/archive.ts`): `PREVISTA` não excluída que usa a conta => blocker `ACCOUNT_HAS_PLANNED_TRANSFERS` (archive-check e 422; série ativa = não encerrada e sem fim passado, mensagem "Encerre a transferência mensal ou troque a conta", que vence a da prevista), lido dentro do `FOR UPDATE` da conta; criar prevista na conta exige `FOR SHARE` (concorrência resolvida pelo lock). Diálogo `contas/archive-account-drawer.tsx` lista todos os impedimentos e desabilita "Arquivar".

## Invariantes
1. Receita prevista nunca entra em `incomeInCents`, extrato, saldo atual nem acerto antes do recebimento; `kind` nunca muda.
2. Σ `byAccount` = total do A pagar (fonte única, sem segunda consulta).
3. A porta única não cria rota nem regra de servidor; as regras de 04 e spec 01 valem iguais.

## Riscos aceitos
- DEV-168: sem CHECK `planned_income_no_split_chk` (SDD-017 §5), pois `planned_expenses` não tem `splitMode`; vale o CHECK `planned_income_not_shared_chk` + schema.
- DEV-169: coluna "A receber" do resumo por conta (`extras` de `buildByAccount`) NÃO preenchida (segue 0/oculta).
- DEV-170: lista "A receber" do Resumo sempre visível (até 5 itens); "Receber" abre o `pay-drawer` na própria Home. DEV-171: `projectedBalance` mora em `previstas/rules.ts` (teste em `tests/unit/home/`). DEV-172: título da tela "Contas a pagar" -> "Previstas".
- DEV-158 (Gherkin US-090: botão "Salvar despesa"; E2E usa "hoje 12/10" via relógio), DEV-160 (`TransactionDrawer` ~800 linhas, acima do alvo 550; só `door-parts` extraído), DEV-145 (cenário "Valores ocultos" ganhou Dado de saldo/a pagar).
- Dívida: `PlannedDrawer` e "Nova despesa prevista" intactos (convergir com a porta única).

## Fontes (código/testes)
Código: `src/modules/previstas/{by-account,payables,rules,repo,copy,service}.ts`; `transacoes/{service,mutations}.ts`; `home/{service,copy}.ts`; `contas/{service,hooks}.ts`; `mcp/tools/previstas.ts`; `privacidade/export*.ts`; `src/modules/lancamento/{door,use-door-submit}.ts`; `src/components/{transaction-drawer,door-parts}.tsx`; `src/app/(app)/previstas/{previstas-screen,planned-drawer,pay-drawer,by-account-block}.tsx`, `home-screen.tsx`; migração `20261031020000_us051_previstas_receita`.
Testes: `tests/unit/home/projected-balance.test.ts`, `tests/unit/previstas/{copy-receivables,by-account}.test.ts`, `tests/integration/us-100b-resumo-e-arquivo.int.test.ts`, E2E `US-100-transferencia-prevista.feature`, `tests/unit/lancamento/{door.test.ts,use-door-submit.test.tsx}`; `tests/integration/us-051-receitas-previstas.int.test.ts`, `us-060-resumo-por-conta`, `us-090-091-porta-unica.int.test.ts`; E2E `US-051-receitas-previstas-e-saldo-previsto.feature`, `US-060*`, `US-090*`, `US-091*` (+ steps).
Âncoras: US-051/060/090/091; SDD-017, SDD-029, SDD-031; ADR-023 (receita por kind).

## Perguntas ao usuário
- Decidido (arquiteto): transferência prevista para conta de reserva NÃO muda o saldo previsto do Resumo; aparece só na tela Previstas.
- Escopo: a porta única ("Vai acontecer"/"Repetir todo mês") NÃO cobre transferência prevista; só a tela Previstas. Confirmar ou pedir história extra.

## Pendências
- US-051 implementada; aguarda validação do Gestor. Testes ESCRITOS e NÃO executados (por instrução do usuário); só lint, typecheck e check:imports rodaram. Regressão de previstas/Resumo/acerto, QA executor e exploratório (UI, claro/escuro, 375/desktop) NÃO rodaram. Migração (expand: enum, coluna com DEFAULT, índice, CHECK) a aplicar em produção antes do código.
- US-060 (TASK-054) e US-090/091 (TASK-095/096) implementadas, aguardam validação do Gestor. US-090/091 verificadas no navegador real (dev, claro/escuro, 375 e desktop).
- Não verificado: BDD US-018/US-019 rodado; testes citados foram lidos, não executados.
- Divergência doc x código: SDD-017 mantém sufixo `-esboco` mas é SDD completo implementado.
