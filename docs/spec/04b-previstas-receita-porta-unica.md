# Spec 04b — Previstas: receita prevista, saldo previsto, resumo por conta, porta única

Atualizado: 2026-11-02
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
Testes: `tests/unit/home/projected-balance.test.ts`, `tests/unit/previstas/{copy-receivables,by-account}.test.ts`, `tests/unit/lancamento/{door.test.ts,use-door-submit.test.tsx}`; `tests/integration/us-051-receitas-previstas.int.test.ts`, `us-060-resumo-por-conta`, `us-090-091-porta-unica.int.test.ts`; E2E `US-051-receitas-previstas-e-saldo-previsto.feature`, `US-060*`, `US-090*`, `US-091*` (+ steps).
Âncoras: US-051/060/090/091; SDD-017, SDD-029, SDD-031; ADR-023 (receita por kind).

## Pendências
- US-051 implementada; aguarda validação do Gestor. Testes ESCRITOS e NÃO executados (por instrução do usuário); só lint, typecheck e check:imports rodaram. Regressão de previstas/Resumo/acerto, QA executor e exploratório (UI, claro/escuro, 375/desktop) NÃO rodaram. Migração (expand: enum, coluna com DEFAULT, índice, CHECK) a aplicar em produção antes do código.
- US-060 (TASK-054) e US-090/091 (TASK-095/096) implementadas, aguardam validação do Gestor. US-090/091 verificadas no navegador real (dev, claro/escuro, 375 e desktop).
- Não verificado: BDD US-018/US-019 rodado; testes citados foram lidos, não executados.
- Divergência doc x código: SDD-017 mantém sufixo `-esboco` mas é SDD completo implementado.
