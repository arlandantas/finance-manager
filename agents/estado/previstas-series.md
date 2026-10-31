# Estado vigente: Previstas e séries (despesas previstas, recorrência, baixa/estorno)

Atualizado: 2026-10-26 (após D-GES-61). Fonte de verdade: código + testes (§f). Mudou a regra? Atualize ESTE arquivo no mesmo commit. A matriz de propriedade/controle ("Só meu", Dono, DC, Admin-ex) NÃO é repetida aqui: ver [so-meu.md](so-meu.md).

## a) Resumo para o usuário
- Prevista = compromisso futuro de DESPESA, sem efeito no saldo, extrato, totais ou acerto até a baixa. Nasce "Só meu" por padrão (D-GES-15). Receita prevista NÃO existe no código (US-051/SDD-017 só especificadas; ver §e).
- Baixa cria a despesa real pelo mesmo serviço do lançamento (valor efetivo livre, data até hoje) e marca a prevista PAGO; estorno desfaz a despesa (UNDONE) e devolve a PREVISTO. Prevista paga não se edita nem exclui.
- Série (recorrência) é mensal e materializada: 12 meses à frente, gerada de forma preguiçosa ao abrir Início/A pagar/Previstas/Resumo/MCP. Editar a série reescreve só as futuras pendentes não alteradas; baixadas e "alteradas" sobrevivem. Encerrar remove futuras pendentes.
- Séries exigem conta de pagamento (conta bancária, não cartão); previsão avulsa, opcional.
- Aberto: receita prevista e saldo previsto (US-051) não implementados; sem decisão do usuário pendente nesta área. SEC-055/057 (riscos aceitos) tocam baixa/série (ver [so-meu.md](so-meu.md) §d).

## b) Regras vigentes
| # | Regra | Fonte |
| :-- | :-- | :-- |
| 1 | Criar: descrição 2..100, valor > 0 (centavos), categoria de DESPESA ativa, vencimento padrão = hoje (fuso da família), responsável padrão = quem cria, `isSharedExpense` padrão false, observação <= 500. Nenhuma escrita no ledger. | `schemas.ts`, `service.ts` createPlannedExpense |
| 2 | Atrasada = PREVISTO com vencimento < hoje (vencer hoje não é atraso). Derivada, não gravada. | `rules.ts` |
| 3 | Editar/excluir exigem `version` (otimista): divergente => 409 `VERSION_CONFLICT` (msg "alterada por <nome>"); PAGO => 422 `PLANNED_PAID_LOCKED`. Ordem fixa: existe, trava, versão, status. Edição sem diferença efetiva => 200 sem subir `version`. Exclusão é lógica (`deletedAt`). | `service.ts` loadForChange |
| 4 | Baixa: exige `accountId` da família; `paidOn` padrão hoje, futura => 422 `FUTURE_DATE_NOT_ALLOWED`; `amountInCents` efetivo (padrão = previsto); pagador padrão = responsável. Categoria arquivada depois ainda baixa. Já PAGO => 409 `PLANNED_ALREADY_PAID`. Conta pode ficar negativa (201). Diferença = pago - previsto (a previsão mantém o valor previsto; o pago vive só na Transaction). | `payPlannedExpense`, `schemas.ts` |
| 5 | Baixa e estorno tomam `lockFamilySplit` primeiro (ADR-021 §2), na mesma transação da despesa gerada e do `markPaid`; falha em qualquer passo => nada persiste. Idempotência por chave no POST. | `service.ts`, `us-019-baixa.int.test.ts` |
| 6 | Estorno: marca a despesa UNDONE, grava revisão `UNDO`, `markUnpaid`; repetir => 409 `PLANNED_NOT_PAID`; depois cabe nova baixa. Exige controle sobre a prevista E sobre a despesa gerada (SEC-044d). | `undoPlannedPayment` |
| 7 | Despesa gerada pela baixa: excluir/restaurar pelo extrato => 422 `LINKED_TO_PLANNED` ("Use Desfazer pagamento"); corrigir o valor no extrato é permitido e reflete em "previsto x pago". | `transacoes/mutations.ts`, teste us-019 |
| 8 | Dividida (`isSharedExpense=true`) exige acerto ligado (`assertCanShare`) e a baixa entra no acerto pelo valor efetivo e data do pagamento; "Só meu" fica fora do acerto. | `service.ts`, teste us-019 |
| 9 | Série: `dayOfMonth` 1..31 (29..31 cai no último dia do mês), `startMonth` entre o mês atual e +11, fim `NONE` ou `COUNT` 1..120 (`endMonth = start + N - 1`). `paymentAccountId` obrigatório na criação. | `recurring-schemas.ts`, `recurrence.ts`, `createSeries` |
| 10 | Geração: horizonte 12 meses a partir do mês corrente (`HORIZON`), `ensureRecurrenceHorizon` idempotente sob `lockFamily`; unicidade (família, série, mês) sem filtro de `deletedAt` => ocorrência excluída nunca é recriada. Cada ocorrência copia os dados da série; conta arquivada depois => `paymentAccountId` null na ocorrência gerada. | `recurring-service.ts` materialize, schema `@@unique` |
| 11 | Editar série (`effectiveFrom` >= mês atual): atualiza a série e reescreve as ocorrências PREVISTO com `occurrenceMonth >= from` E vencimento >= hoje E `isException=false`; as além do novo fim são excluídas; PAGO e exceções ficam. Depois completa o horizonte. `GET .../impact` informa `affectedCount`, `keptPaidCount`, `keptExceptionCount`, `endCount`. | `updateSeries`, `seriesImpact` |
| 12 | Exceção: mudar qualquer campo (exceto observação) de uma ocorrência de série a marca `isException=true` ("alterada"); não é reescrita por edições da série. | `updatePlannedExpense` |
| 13 | Encerrar: `markEnded`; exclui as PREVISTO com vencimento >= hoje que o ator controla; baixadas e atrasadas ficam; encerrar de novo => 409 `SERIES_ENDED`; editar série encerrada => 409. | `endSeries` |
| 14 | "A pagar" = fonte única `collectOpenPayables` (previstas PREVISTO não excluídas + faturas não pagas com total > 0); tela e Resumo recortam por período (vencimento no período; no corrente, + atrasados anteriores); Início usa janela [hoje, hoje+7] + atrasados, máx. 10 itens. Ordem: atrasados, vencimento, título. | `payables.ts`, `rules.ts` |
| 15 | Resumo do mês: "Despesas" = projeção = faturas do período + previstas em aberto + baixas de prevista + não previstas (sem cartão e sem vínculo); resultado segue o realizado. | `home/service.ts`, `transacoes/extrato.ts` expenseComposition |
| 16 | Remoção de membro: previstas/séries do removido são reatribuídas a um destino válido (`plannedTo`); sem destino válido a revisão da remoção recusa. | `familia/removal.ts` |
| 17 | MCP: só leitura (`previstas_do_mes`, mesma base de "A pagar"); nenhuma ferramenta altera previstas (SEC-038). | `mcp/tools/previstas.ts`, teste sec038 |
| 18 | Propriedade/controle de prevista e série (quem edita, baixa, estorna, encerra; captura; ex-membro): seguem [so-meu.md](so-meu.md) §b/§c (`assertCanWritePlanned`, `assertPlannedNoCapture`, `assertPlannedControllerLimits`, `assertPlannedResultAllowed`, `ownerStanding`). | `transacoes/ownership.ts` |

Rotas (`src/app/api/v1/`): `planned-expenses` (GET lista, POST), `planned-expenses/[id]` (GET, PATCH), `[id]/delete` (POST), `[id]/pay`, `[id]/undo-payment`; `payables`; `recurring-expenses` (GET, POST), `[id]` (GET, PATCH), `[id]/impact`, `[id]/end`. Lista, Início, A pagar, Resumo e MCP chamam `ensureRecurrenceHorizonStandalone` antes da leitura.

## c) Invariantes
1. Prevista só existe para despesa; nunca toca saldo/extrato/acerto antes da baixa. CHECKs no banco: valor > 0; `PAGO` <=> `paidTransactionId` não nulo; excluída só se PREVISTO; `seriesId` nulo <=> `occurrenceMonth` nulo; `deletedAt`/`deletedByMemberId` juntos.
2. O valor pago vem sempre da Transaction vinculada (fonte única); a previsão guarda só o previsto.
3. Baixa e despesa gerada são atômicas (mesma transação); `paidTransactionId` é único.
4. (família, série, mês) é único mesmo com exclusão lógica: geração é idempotente, sem duplicar, sem ressuscitar.
5. Toda mutação de prevista/série confere `version`; 409 não grava nada.
6. Travas de propriedade rodam antes da mutação e dentro da transação (ver [so-meu.md](so-meu.md) §c).
7. `familyId` em toda consulta; prevista, conta, pagador ou membro de outra família => 404/422.

## d) Limitações e riscos aceitos
| ID | Risco | Razão do aceite |
| :-- | :-- | :-- |
| SEC-055 | Estornar a baixa e dar nova baixa move o crédito de ex-membro | D-GES-61: inerente ao livro-caixa; defesa = histórico |
| SEC-057 | Editar série de removido devolve ocorrências ao ex-membro | Só registrado; "encerrar e criar outra" resolve |
| SEC-045 | `endSeries` pula ocorrências "Só meu" alheias sem avisar | Encerrar não contorna a regra de excluir; sem erro por design |
| L-1 | Geração só ocorre quando alguém abre as telas/MCP (sem cron) | Idempotente e barata; evita job; consequência: série sem uso fica sem horizonte até o próximo acesso |
| L-2 | Série não suporta periodicidade que não seja mensal, nem valores diferentes por mês | Escopo v0 (ADR-025); exceções individuais cobrem o caso |
| L-3 | Editar a série não altera ocorrências já vencidas (< hoje) nem "alteradas" | Evita reescrever o passado/ajustes manuais; `impact` mostra o que fica |

## e) Em andamento / pendências
- Nada em implementação nesta área.
- US-090/US-091 (porta única "Já aconteceu / Vai acontecer" e "Repetir todo mês"): **SDD-031 pronto, aprovadas p/ Dev (5 + 3 = 8 pts)**; não iniciadas. Contrato: **orquestração no cliente, sem rota nova nem mudança de serviço** (`src/modules/lancamento/door.ts` puro + `useDoorSubmit`): NOW -> `POST /transactions`, LATER -> `POST /planned-expenses`, LATER + todo mês -> `POST /recurring-expenses`; "Vai acontecer" indisponível no cartão e na receita (até a US-051); chave de idempotência por serviço; `PlannedDrawer` e "Nova despesa prevista" permanecem; botão "Salvar despesa/receita" (US-085) e "Salvar previsão". No código os dois modos já nascem "Só meu". Detalhes: [SDD-031](../tech-lead/sdd/SDD-031-porta-unica-lancar-ou-prever-us-090-091.md).
- US-060 (resumo por conta no A pagar): **implementada (TASK-054), aguardando validação do Gestor**. `GET /payables` ganhou `byAccount` (função pura `previstas/by-account.ts`, derivada dos MESMOS `items` do `collectOpenPayables`; Σ `dueInCents` das linhas = `totals.dueInCents` = `toPay.totalInCents`), inclui "Só meu" alheio (Q-U24), `paymentAccountId` no item, rota em `RepeatableRead`, `listAccountBalances` em `contas/service.ts`. Fatura cai em "Sem conta definida" até a US-089 (ponto único de troca em `payables.ts`, comentário `// US-089`; cenário `it.todo`/`@pendente-us-089`, excluído do E2E em `playwright.config.ts`). `previstas_do_mes` (MCP) não muda. UI: `previstas/by-account-block.tsx` (grade responsiva única, "Falta R$ X" com ícone, filtro por conta no cliente com chip, rodapé "Total"); `contas/hooks.ts` invalida `["payables"]`. Desvios: DEV-144 (texto da lista vazia segue "Nenhuma conta a pagar neste mês", por causa da US-018) e DEV-145 (cenário "Valores ocultos" ganhou o Dado de saldo/a pagar para existir "Falta").
- US-051 / SDD-017 (receitas previstas e saldo previsto, ADR-023, estimativa 5, Could, primeiro corte da R3): status na US: "Aprovada p/ Dev, não iniciada" (2026-10-25); NADA no código (sem `kind` em `PlannedExpense`, nenhum INCOME em `previstas/`). Detalhar o SDD antes de implementar.
- Verificação da UI de Previstas/pay-drawer/planned-drawer no navegador: ver pendência equivalente em [so-meu.md](so-meu.md) §e.
- Não verificado: BDD (`tests/e2e/features/US-018`, `US-019`) rodado nesta consolidação; testes citados em §f foram lidos, não executados.

## f) Mapa de fontes
Código (`src/modules/previstas/`): `service.ts` (CRUD, baixa, estorno), `recurring-service.ts` (série, geração, impacto, encerrar), `recurrence.ts` (aritmética de meses, `monthsToGenerate`), `rules.ts` (atraso, recortes de A pagar), `payables.ts` (coletor único), `schemas.ts`, `recurring-schemas.ts`, `repo.ts`, `recurring-repo.ts`, `hooks.ts`, `recurring-hooks.ts`. Fora do módulo: `transacoes/ownership.ts`, `transacoes/service.ts` (`createExpenseCore`, `personalFromPlanned`), `transacoes/mutations.ts` (`LINKED_TO_PLANNED`), `transacoes/extrato.ts`, `home/service.ts`, `familia/removal.ts`, `privacidade/export.ts`, `mcp/tools/previstas.ts`. Banco: `prisma/schema.prisma` (`PlannedExpense`, `RecurringExpense`), migrations `20261004200822_us018_previstas`, `20261006120000_v0_recorrencia_e_conta_prevista`. UI: `src/app/(app)/previstas/{previstas-screen,planned-drawer,pay-drawer}.tsx`.
Testes: `tests/unit/previstas/{recurrence,rules,by-account}.test.ts`; `tests/integration/` `us-018-despesa-prevista`, `us-019-baixa`, `us-058-059-recorrencia`, `us-061-063-inicio-previstas`, `us-060-resumo-por-conta`, `sec038-previstas-captura`, mais as de "Só meu" listadas em [so-meu.md](so-meu.md) §f; BDD em `tests/e2e/features/US-018*`, `US-019*`, `US-060*`.
Docs: [SDD-031](../tech-lead/sdd/SDD-031-porta-unica-lancar-ou-prever-us-090-091.md) (US-090/091, porta única, a implementar), [SDD-029](../tech-lead/sdd/SDD-029-resumo-por-conta-no-a-pagar-us-060.md) (US-060, `byAccount`, implementado), [SDD-009](../tech-lead/sdd/SDD-009-despesas-previstas.md) (previstas e baixa), [SDD-019](../tech-lead/sdd/SDD-019-recorrencia-conta-de-pagamento-e-polimento-v0.md) (recorrência, conta de pagamento), [SDD-017](../tech-lead/sdd/SDD-017-cor-e-receitas-previstas-esboco.md) (receita prevista, não implementada); ADR-015 (prevista como entidade), ADR-023 (receita por kind), ADR-025 (recorrência materializada); US-018, US-019, US-058, US-059, US-051 em `product-owner/backlog/stories/`; FLUXO-005.

| Regra | Origem |
| :-- | :-- |
| Prevista nasce "Só meu" | D-GES-15, D-PO-16, US-030 |
| "A pagar" por vencimento no mês (sem regra hoje+7 na tela) | D-GES-26, DEV-35/36, SDD-018 |
| Resumo: Despesas = projeção | US-063, D-TL-v0-2 |
| Captura, controle, ex-membro, baixa de ex-membro | SEC-026/038/043..045/051, D-GES-48/50/53/55/59, DEV-135 |
| Riscos aceitos | D-GES-61, SEC-055/057 |

Divergências docs x código (código vence):
1. Status das US-018/019/058/059 corrigido em 2026-10-25 para "Implementada (TASK-xxx)". Pendentes de fato: US-051 (não iniciada) e US-060 implementada depois (TASK-054, `byAccount` no código).
2. SDD-009 descreve baixa com pagador padrão = responsável; no código, quando o responsável é ex-membro sem retorno o pagador é quem realiza a baixa (DEV-135) e quem voltou paga em nome do vínculo atual.
3. SDD-009/US-025 citam "A pagar" com regra hoje+7; vigente por vencimento no período (D-GES-26); hoje+7 só na janela do Início (US-061).
4. SDD-017 mantém o sufixo `-esboco` no nome, mas diz ser SDD completo; o código não o implementa.
5. SDD-028 §11 (baixa do Admin-ex "pagador = responsável ou Admin"): ver divergências 1..3 de [so-meu.md](so-meu.md) §f.
