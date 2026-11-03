# Spec 04 — Previstas e séries (despesas previstas, recorrência, baixa/estorno)

Atualizado: 2026-11-02
Receita prevista, saldo previsto, resumo por conta e porta única: ver [04b](04b-previstas-receita-porta-unica.md). Matriz de propriedade/controle: spec 01.

## Resumo
- Prevista = compromisso futuro, sem efeito no saldo, extrato, totais ou acerto até a baixa. Nasce "Só meu" por padrão (D-GES-15).
- Baixa cria a despesa real pelo mesmo serviço do lançamento (valor efetivo livre, data até hoje) e marca PAGO; estorno desfaz a despesa (UNDONE) e devolve a PREVISTO. Prevista paga não se edita nem exclui.
- Série (recorrência) é mensal e materializada: 12 meses à frente, gerada de forma preguiçosa ao abrir Início/A pagar/Previstas/Resumo/MCP. Editar a série reescreve só as futuras pendentes não alteradas; baixadas e "alteradas" sobrevivem. Encerrar remove futuras pendentes.
- Séries exigem conta de pagamento (conta bancária, não cartão); previsão avulsa, opcional.

## Regras
| # | Regra | Fonte |
| :-- | :-- | :-- |
| 1 | Criar: descrição 2..100, valor > 0 (centavos), categoria de DESPESA ativa, vencimento padrão = hoje (fuso da família), responsável padrão = quem cria, `isSharedExpense` padrão false, observação <= 500. Nenhuma escrita no ledger. | `schemas.ts`, `service.ts` |
| 2 | Atrasada = PREVISTO com vencimento < hoje (vencer hoje não é atraso). Derivada, não gravada. | `rules.ts` |
| 3 | Editar/excluir exigem `version`: divergente => 409 `VERSION_CONFLICT` (msg "alterada por <nome>"); PAGO => 422 `PLANNED_PAID_LOCKED`. Ordem: existe, trava, versão, status. Edição sem diferença efetiva => 200 sem subir `version`. Exclusão lógica (`deletedAt`). | `loadForChange` |
| 4 | Baixa: exige `accountId` da família; `paidOn` padrão hoje, futura => 422 `FUTURE_DATE_NOT_ALLOWED`; `amountInCents` efetivo (padrão = previsto); pagador padrão = responsável. | `payPlannedExpense` |
| 4b | Categoria arquivada depois ainda baixa. Já PAGO => 409 `PLANNED_ALREADY_PAID`. Conta pode ficar negativa (201). Diferença = pago - previsto (previsão mantém o previsto; o pago vive só na Transaction). | `schemas.ts` |
| 5 | Baixa e estorno tomam `lockFamilySplit` primeiro (ADR-021 §2), na mesma transação da despesa gerada e do `markPaid`; falha em qualquer passo => nada persiste. Idempotência por chave no POST. | `service.ts` |
| 6 | Estorno: marca a despesa UNDONE, revisão `UNDO`, `markUnpaid`; repetir => 409 `PLANNED_NOT_PAID`; depois cabe nova baixa. Exige controle sobre a prevista E sobre a despesa gerada (SEC-044d). | `undoPlannedPayment` |
| 7 | Despesa gerada pela baixa: excluir/restaurar pelo extrato => 422 `LINKED_TO_PLANNED` ("Use Desfazer pagamento"); corrigir o valor no extrato é permitido e reflete em "previsto x pago". | `mutations.ts` |
| 8 | Dividida (`isSharedExpense=true`) exige acerto ligado (`assertCanShare`) e a baixa entra no acerto pelo valor efetivo e data do pagamento; "Só meu" fica fora do acerto. | `service.ts` |
| 9 | Série: `dayOfMonth` 1..31 (29..31 cai no último dia do mês), `startMonth` entre o mês atual e +11, fim `NONE` ou `COUNT` 1..120 (`endMonth = start + N - 1`). `paymentAccountId` obrigatório na criação. | `recurring-schemas.ts`, `recurrence.ts` |
| 10 | Geração: horizonte 12 meses a partir do mês corrente (`HORIZON`), `ensureRecurrenceHorizon` idempotente sob `lockFamily`; unicidade (família, série, mês) sem filtro de `deletedAt` => ocorrência excluída nunca é recriada. | `recurring-service.ts`, `@@unique` |
| 10b | Cada ocorrência copia os dados da série; conta arquivada depois => `paymentAccountId` null na ocorrência gerada. | `materialize` |
| 11 | Editar série (`effectiveFrom` >= mês atual): atualiza a série e reescreve ocorrências PREVISTO com `occurrenceMonth >= from` E vencimento >= hoje E `isException=false`; as além do novo fim são excluídas; PAGO e exceções ficam. Depois completa o horizonte. | `updateSeries` |
| 11b | `GET .../impact` informa `affectedCount`, `keptPaidCount`, `keptExceptionCount`, `endCount`. | `seriesImpact` |
| 12 | Exceção: mudar qualquer campo (exceto observação) de uma ocorrência a marca `isException=true` ("alterada"); não é reescrita por edições da série. | `updatePlannedExpense` |
| 13 | Encerrar: `markEnded`; exclui as PREVISTO com vencimento >= hoje que o ator controla; baixadas e atrasadas ficam; encerrar de novo => 409 `SERIES_ENDED`; editar série encerrada => 409. | `endSeries` |
| 14 | "A pagar" = fonte única `collectOpenPayables` (previstas PREVISTO não excluídas + faturas não pagas com total > 0). Tela e Resumo recortam por período (vencimento no período; no corrente, + atrasados anteriores). | `payables.ts`, `rules.ts` |
| 14b | Início usa janela [hoje, hoje+7] + atrasados, máx. 10 itens. Ordem: atrasados, vencimento, título. | `payables.ts` |
| 15 | Resumo do mês: "Despesas" = projeção = faturas do período + previstas em aberto + baixas de prevista + não previstas (sem cartão e sem vínculo); resultado segue o realizado. | `home/service.ts`, `extrato.ts` |
| 16 | Remoção de membro: previstas/séries do removido são reatribuídas a um destino válido (`plannedTo`); sem destino válido a revisão da remoção recusa. | `familia/removal.ts` |
| 17 | MCP: só leitura (`previstas_do_mes`, mesma base de "A pagar"); nenhuma ferramenta altera previstas (SEC-038). | `mcp/tools/previstas.ts` |
| 18 | Propriedade/controle (quem edita, baixa, estorna, encerra; captura; ex-membro): spec 01 (`assertCanWritePlanned`, `assertPlannedNoCapture`, `assertPlannedControllerLimits`, `assertPlannedResultAllowed`, `ownerStanding`). | `ownership.ts` |

Rotas (`src/app/api/v1/`): `planned-expenses` (GET, POST), `[id]` (GET, PATCH), `[id]/delete`, `[id]/pay`, `[id]/undo-payment`; `payables`; `receivables`; `recurring-expenses` (GET, POST), `[id]` (GET, PATCH), `[id]/impact`, `[id]/end`. Lista, Início, A pagar, Resumo e MCP chamam `ensureRecurrenceHorizonStandalone` antes da leitura.

## Invariantes
1. Nunca toca saldo/extrato/acerto antes da baixa. CHECKs no banco: valor > 0; `PAGO` <=> `paidTransactionId` não nulo; excluída só se PREVISTO; `seriesId` nulo <=> `occurrenceMonth` nulo; `deletedAt`/`deletedByMemberId` juntos.
2. O valor pago vem sempre da Transaction vinculada; a previsão guarda só o previsto.
3. Baixa e despesa gerada são atômicas; `paidTransactionId` é único.
4. (família, série, mês) único mesmo com exclusão lógica: geração idempotente, sem duplicar, sem ressuscitar.
5. Toda mutação confere `version`; 409 não grava nada.
6. Travas de propriedade rodam antes da mutação e dentro da transação (spec 01).
7. `familyId` em toda consulta; prevista, conta, pagador ou membro de outra família => 404/422.

## Riscos aceitos
| ID | Risco | Razão do aceite |
| :-- | :-- | :-- |
| SEC-055 | Estornar a baixa e dar nova baixa move o crédito de ex-membro | D-GES-61: inerente ao livro-caixa; defesa = histórico |
| SEC-057 | Editar série de removido devolve ocorrências ao ex-membro | Só registrado; "encerrar e criar outra" resolve |
| SEC-045 | `endSeries` pula ocorrências "Só meu" alheias sem avisar | Encerrar não contorna a regra de excluir; sem erro por design |
| L-1 | Geração só quando alguém abre telas/MCP (sem cron) | Idempotente e barata; série sem uso fica sem horizonte até o próximo acesso |
| L-2 | Só periodicidade mensal, sem valores diferentes por mês | Escopo v0 (ADR-025); exceções individuais cobrem |
| L-3 | Editar a série não altera ocorrências vencidas (< hoje) nem "alteradas" | Evita reescrever o passado; `impact` mostra o que fica |

## Fontes (código/testes)
Código (`src/modules/previstas/`): `service.ts`, `recurring-service.ts`, `recurrence.ts` (`monthsToGenerate`), `rules.ts`, `payables.ts`, `schemas.ts`, `recurring-schemas.ts`, `repo.ts`, `recurring-repo.ts`, `hooks.ts`, `recurring-hooks.ts`. Fora: `transacoes/{ownership,service,mutations,extrato}.ts` (`createExpenseCore`, `personalFromPlanned`), `home/service.ts`, `familia/removal.ts`, `privacidade/export.ts`, `mcp/tools/previstas.ts`.
Banco: `prisma/schema.prisma` (`PlannedExpense`, `RecurringExpense`); migrations `20261004200822_us018_previstas`, `20261006120000_v0_recorrencia_e_conta_prevista`. UI: `src/app/(app)/previstas/{previstas-screen,planned-drawer,pay-drawer}.tsx`.
Testes: `tests/unit/previstas/{recurrence,rules,by-account}.test.ts`; `tests/integration/` `us-018-despesa-prevista`, `us-019-baixa`, `us-058-059-recorrencia`, `us-061-063-inicio-previstas`, `us-060-resumo-por-conta`, `sec038-previstas-captura` e as de "Só meu" (spec 01); BDD `tests/e2e/features/US-018*`, `US-019*`, `US-060*`.
Âncoras: SDD-009, SDD-019, SDD-018; ADR-015 (prevista como entidade), ADR-025 (recorrência materializada); US-018/019/058/059; FLUXO-005; D-GES-26 ("A pagar" por vencimento no período), US-063/D-TL-v0-2 (Resumo = projeção).

## Pendências
- Sem decisão do usuário pendente. Verificação da UI de Previstas/pay-drawer/planned-drawer no navegador: ver spec 01.
- Divergências doc x código (código vence): SDD-009 diz pagador da baixa = responsável; no código, responsável ex-membro sem retorno => pagador = quem realiza (DEV-135); SDD-009/US-025 citam "A pagar" com regra hoje+7 (vigente: por vencimento no período; hoje+7 só no Início, US-061).
