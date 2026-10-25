# Estado vigente: Acerto de contas e divisão (rateio, centavos, acerto, mês acertado, desfazer)

Atualizado: 2026-10-26. Fonte de verdade: código + testes (§f). Mudou a regra? Atualize ESTE arquivo no mesmo commit. "Só meu" (fora do acerto) está em [so-meu.md](so-meu.md); parcelamento em [parcelamento.md](parcelamento.md).

## a) Resumo para o usuário
- Despesa dividida ("comum") entra no acerto do mês; "Só meu", receita, transferência, acerto e pagamento de fatura não entram. Compra parcelada nunca é dividida hoje (`INSTALLMENT_SPLIT_RELEASED=false`): parcela é "Só meu" e o Acerto avisa.
- Cada lançamento dividido grava o rateio (percentual e centavos por membro) no momento do lançamento, pela regra da família vigente na DATA da despesa. Mudar a regra depois nunca reescreve lançamentos antigos. Famílias novas já nascem com o motor STORED.
- Sobra de centavo fica com quem pagou (se participa com peso > 0). O acerto sugere quem transfere quanto para zerar o mês; registrar o acerto cria uma transferência entre contas; pode ser desfeito.
- Acerto de contas é opcional por família (só o Administrador liga/desliga; desligar não apaga nada).
- NÃO existe ainda: percentual escolhido por lançamento ("De outro jeito"/CUSTOM, US-043), parcela dividida (US-042), lembrar "dividir" por categoria (US-044). Esperam a "janela de reversão" da migração (§e).
- Decisões que dependem do usuário: liberar a janela de reversão / ordem US-042..044 (§e); confirmar se produção já rodou `migrate:split` (não consta nos docs).

## b) Regras vigentes
Unidades: valores em centavos inteiros (`amountInCents`); percentuais em basis points (bps, 10000 = 100%). BigInt interno em `splitAmount`/`apportion`; sem float.

### b.1 Rateio por lançamento (motor STORED)
| # | Regra | Fórmula / efeito |
| :-- | :-- | :-- |
| R1 | `splitAmount(amount, shares, pagador)` | peso `w = weight ?? bps`; `W = Σ w` (> 0, senão RangeError); `base_m = ⌊amount·w_m ÷ W⌋`; `sobra = amount − Σ base` (0..P−1, P = membros com w > 0) |
| R2 | Destino da sobra | Pagador com `bps > 0`: recebe TODA a sobra. Senão: 1 centavo a cada um dos `sobra` membros de maior resto (`amount·w mod W`), empate = menor ordinal. Só entram membros com `bps > 0`. Ordem de `shares` é irrelevante |
| R3 | Vetor "Pela regra" (`resolveRuleShares`) | pesos do motor LEGACY para o período da despesa (membros presentes, `legacyGroupWeights`), só pesos > 0; `bps = apportion(10000, pesos)` (maior resto, desempate menor ordinal); guarda também `weight` |
| R4 | EQUAL com N que não divide 10000 (3 membros: 3334/3333/3333) | os centavos saem de `weight` (1/1/1), não do `bps`: 90000 ÷ 3 = 30000×3 (DEV-49). `bps` gravado é só a intenção |
| R5 | Gravação | `transactions.splitMode`: NONE (Só meu) / RULE; CUSTOM existe no enum mas NENHUM código o grava. `splitRuleVersionId` = regra vigente em `occurredOn` (informativo). Uma linha em `transaction_splits` por membro com peso > 0 |
| R6 | Editar valor ou pagador de dividida | `rewriteSplitAmounts`: mesmos `bps`, centavos recalculados (DELETE+INSERT); em origem RULE+EQUAL usa `weight=1` para bps > 0. Editar a DATA NÃO muda percentual nem `splitRuleVersionId` |
| R7 | Virar dividida / virar "Só meu" | Dividida: resolve regra na data (`occurredOn` novo, se mudou) e insere linhas. "Só meu": apaga linhas, `splitMode=NONE` |
| R8 | Quem escreve rateio | Só famílias STORED (`lockFamilySplit` lê o motor). LEGACY grava apenas `isSharedExpense` |
| R9 | Integridade no COMMIT | trigger deferida `tx_split_integrity`: `splitMode=NONE ⇒ 0 linhas`; senão `Σ bps = 10000` e `Σ amountInCents = valor`. CHECK `tx_split_kind_chk`: `splitMode<>NONE ⇒ kind=EXPENSE e isSharedExpense`. Despesa excluída também mantém rateio (restore) |

### b.2 Motor do acerto
| # | Regra | Detalhe |
| :-- | :-- | :-- |
| M1 | Entrada | `repo.sharedExpenses`: `kind=EXPENSE`, `isSharedExpense=true`, `deletedAt=null`, no período. Nunca transferência, abertura, receita |
| M2 | STORED (`computeSettlementStored`) | `quota_m = Σ splits.amountInCents`; `paid_m = Σ valores pagos`; despesa sem rateio ou `Σ≠valor` lança `SplitInconsistentError` (nunca soma errado) |
| M3 | LEGACY (`computeSettlementLegacy`, congelado) | agrupa despesas por versão de regra vigente na data; `apportion(total_do_grupo, pesos)` (arredonda por GRUPO, não por lançamento). Só roda em famílias ainda LEGACY |
| M4 | Saldo | `difference = paid − quota`; acertos: `adjustment(from) += valor`, `adjustment(to) −= valor`; `balance = difference + adjustment` |
| M5 | Membros do cálculo | presentes (`removedOn == null` ou `>= início do período`) mais quem pagou/recebeu rateio no período (crédito preservado). Ordem canônica = `ordinal` (posição por `joinedAt,id`), depois id |
| M6 | Sugestões (`suggestSettlements`) | guloso: maior devedor × maior credor (empate = menor ordinal), `min(d,c)`, no máx. N−1 |
| M7 | Status | `<2` membros: NEEDS_MORE_MEMBERS; sem despesa e sem acerto: EMPTY; sugestões > 0: PENDING; há acerto ativo: SETTLED; senão BALANCED |
| M8 | Rótulo (US-022) | `explainByRules` (única implementação, usada nos dois motores): segmentos por vigência no período; linha "Na prática neste mês" = `apportion(1000, cotas)` em décimos de %. Aparece se houver ≥ 2 vetores distintos |
| M9 | Pendências (`pendingSettlementMonths`) | varre períodos com despesa comum (teto 120 meses; Home usa janela de 12 meses antes do corrente); mês é PENDING se sugestões > 0 |
| M10 | Período | chave = mês de início do ciclo (`cutDay` 1..28, sem UI); `periodFilter` único para o ledger |

### b.3 Regra da família (percentual sugerido)
| # | Regra |
| :-- | :-- |
| G1 | `SplitRuleVersion` append-only; vigente = maior `effectiveFrom <= data`, empate = `createdAt` mais recente (`ruleAt`). Padrão inicial EQUAL desde 1970-01-01 |
| G2 | PUT `/split-rule` (só ADMIN): EQUAL ou PROPORTIONAL; PROPORTIONAL exige todos os membros ATIVOS, Σ = 10000, sem repetição; `effectiveFrom >= início do período atual` (`EFFECTIVE_FROM_IN_PAST`); sempre nova versão; toma `lockFamilySplit` |
| G3 | `stale`: regra vigente PROPORTIONAL que não cobre exatamente os membros atuais (aviso "Redefinir percentuais"; não-admin vê "Peça a um Administrador") |
| G4 | Prévia (POST `/split-rule/preview`, ADMIN, não grava): recalcula o mês atual com a regra candidata via motor LEGACY (`computeSettlement`): `impacto = Σ|Δ saldo| ÷ 2`, `affectedExpensesCount` = despesas com data >= `effectiveFrom`. Sugestão pela renda: `apportion(100, rendas)·100` bps (renda não sai do navegador) |
| G5 | Percentual: `parsePercentToBps` aceita "60", "33,33"; 0..100, até 2 casas |

### b.4 Acerto opcional, "dividir" e rótulo
| # | Regra |
| :-- | :-- |
| O1 | `Family.settlementEnabled` (padrão true). PATCH `/family/settings` só ADMIN, com `version`; desligar com valor pendente em qualquer mês exige `confirmPending` (409 `SETTLEMENT_PENDING`). Não apaga nada; religar restaura |
| O2 | Desligado: rotas de acerto/regra respondem 409 `SETTLEMENT_DISABLED`; gravar despesa dividida = 422 `SETTLEMENT_DISABLED` (`assertCanShare`); dividida já existente permanece |
| O3 | "Dividir" vem desligado ("Só meu") por padrão em lançamento, cartão e previsão (US-030); o interruptor só aparece com acerto ligado e ≥ 2 membros ativos; rótulo `splitSwitchLabel`: "Só meu" / "Divisão igual (50% / 50%)" / "Divisão proporcional (...)" (igual se bps diferem ≤ 1) |
| O4 | Linguagem neutra (`SPLIT_COPY`): sem a palavra "deve"; ex.: "Para equilibrar o mês: A transfere R$ X para B" |
| O5 | Indicador da Home: `current` PENDING/IN_ORDER (null em EMPTY/NEEDS_MORE_MEMBERS), `previous` = meses anteriores pendentes na janela de 12 |

### b.5 Registrar acerto, mês acertado, desfazer
| # | Regra |
| :-- | :-- |
| A1 | POST `/settlements` (`registerSettlement`): `lockFamilySplit` primeiro, depois advisory lock por (família, período). Membros e contas da família (conta inexistente: 404); contas diferentes; membros diferentes; data não futura |
| A2 | Permissão: o devedor, o credor ou ADMIN (senão 403) |
| A3 | Validação contra o cálculo ATUAL: precisa existir sugestão exatamente `from→to` (senão 422 `SETTLEMENT_NOT_DUE`); `valor <= sugerido` (senão 422 `SETTLEMENT_EXCEEDS_DUE`, `dueInCents`). Acerto parcial permitido |
| A4 | Efeito: `TransferGroup kind=SETTLEMENT` com `settlementPeriod`, `from/toMember` e 2 pernas (TRANSFER_OUT/IN) em contas escolhidas; descrição "Acerto de contas - Mês" (com ano se diferente do corrente). Nunca é despesa; ajusta apenas o saldo (M4) |
| A5 | Mês acertado = período com acerto ATIVO (`hasActiveSettlement`). Editar valor/data/pagador/divisão, excluir ou restaurar despesa comum desse mês exige `confirmSettledPeriod`; sem ele 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED`. O saldo é recalculado; pode inverter o sentido (sugestão contrária) |
| A6 | Desfazer: POST `/transfers/:groupId/undo` com `version` do grupo (qualquer membro; sem checagem de papel). Marca grupo e 2 pernas `deletedAt` (`UNDONE`), revisão `UNDO`; 409 `ALREADY_UNDONE`/`VERSION_CONFLICT`; recusa se conta arquivada (`ACCOUNT_ARCHIVED_LOCKED`); toma `lockFamilySplit`. Acerto/transferência não são editáveis (só desfazer) |
| A7 | Transferência comum (`createTransfer`): contas diferentes, valor > 0, data não futura, nota <= 500; não entra no acerto |

## c) Invariantes
1. `Σ_m amount = valor` e `Σ bps = 10000` em todo lançamento dividido (trigger, R9). `Σ cotas = total comum`, `Σ diferença = 0`, `Σ saldo = 0`.
2. `lockFamilySplit` (`FOR SHARE`) é a PRIMEIRA trava de toda escrita que cria/altera/exclui/restaura despesa comum, grava regra, registra/desfaz acerto, baixa previsão ou mexe em parcela (ADR-021 §2); `tests/unit/split/lock-coverage.test.ts` varre o código.
3. Regra e rateio são imutáveis para o passado: mudar regra não reescreve lançamentos.
4. Despesa de família STORED sempre tem rateio; falta ou Σ errado = erro explícito, não soma silenciosa.
5. Isolamento por `familyId` em todas as consultas e FKs compostas (ADR-013).
6. Motor LEGACY é código congelado, oráculo do backfill; não alterar.

## d) Limitações e riscos aceitos
| ID | Limitação | Razão |
| :-- | :-- | :-- |
| L1 | Arredondamento difere entre motores: LEGACY por grupo de regra, STORED por lançamento (ex.: 3 × R$ 100,01 a 50/50 pagos por A: LEGACY 150,02/150,01; STORED 150,03/150,00) | RN-018.3 (sobra com o pagador); a migração preservou os números históricos por alocação exata (ADR-021) |
| L2 | Lançamento novo excluído/restaurado ou antigo migrado pode ter centavos distintos do que o LEGACY daria | idem; restaurados entram no mundo STORED (ADR-021 §6) |
| L3 | Rótulo (`explainByRules`) usa vigência por data mesmo em STORED, não `splitRuleVersionId` | equivalente enquanto só existe modo RULE; revisar quando CUSTOM existir |
| L4 | Acerto aceita qualquer conta da família como destino/origem (SEC-056, D-GES-61) e pode mover crédito de ex-membro (SEC-054/055) | aceito pelo Gestor; sujeito a veto do usuário (ver so-meu.md §d) |
| L5 | Quem voltou à família e divide item antigo aparece 2x no acerto (SEC-053) | aceito, info |
| L6 | Parcelas de compra parcelada ficam fora do acerto (aviso US-052) | US-042 depende da janela de reversão |
| L7 | Qualquer membro pode desfazer qualquer acerto | decisão original de US-013b; sem registro de veto |
| L8 | Mês acertado não trava: edição só pede confirmação | decisão US-013b (acerto é conciliação, não fechamento) |

## e) Em andamento / pendências
- R3-A (EN-002a/b, TASK-046/047) implementada; "janela de reversão em curso" (tasks-board.md): >= 7 dias desde a migração em produção, `pnpm migrate:split --verify` limpo e um fechamento de mês conferido pelo Stakeholder. Não há registro de que a janela tenha sido encerrada nem de que `migrate:split` rodou em produção (o build só roda `prisma migrate deploy`; a migração de dados é manual).
- Bloqueados pela janela: US-042 (parcela dividida), US-043 (modo CUSTOM, "De outro jeito"), US-044 (por categoria), migração de contrato `us043_modo_custom` (CHECK `isSharedExpense = (splitMode<>NONE)`, `splitMode` em previstas; ainda inexistente em `prisma/migrations`). Reversão nível 2 (`--rollback --purge`) só enquanto não houver CUSTOM, parcela dividida nem contrato.
- Gestor deve decidir encerrar a janela (e o usuário confirmar o fechamento de mês conferido).
- Previstas/séries: `splitMode`/`splitShares` em previstas ainda não existem; baixa de prevista dividida usa `createExpenseCore` (Pela regra na data da baixa).

## f) Mapa de fontes
Código: `src/modules/split/` (`split-amount.ts` rateio; `settlement-{common,legacy,stored}.ts` e `settlement.ts` motores/despachante; `rules.ts`; `service.ts` carregamento, regra, `registerSettlement`; `write.ts` escrita do rateio; `lock.ts`; `guard.ts`; `explain.ts`; `preview.ts`; `pending.ts`; `indicator.ts`; `backfill.ts`, `migrate-family.ts`; `labels.ts`, `copy.ts`, `shares-label.ts`), `src/lib/apportion.ts`, `src/modules/contas/transfers.ts` (acerto/transferência/desfazer), `src/modules/transacoes/{service,mutations}.ts` (`requireSettledConfirmation`, rateio na criação/edição), `src/modules/familia/{settings,repo}.ts`, `scripts/migrate-split.ts`, UI `src/app/(app)/acerto/`. Esquema: `transaction_splits`, `transactions.splitMode`, `families.splitEngine/settlementEnabled`, migração `20261005150000_en002_percentual_por_lancamento`.
Testes: unit `tests/unit/split/{split-amount (V1..V10, 2000 casos), settlement (S1..S16), settlement-stored, backfill, rules, explain, preview, copy, lock-coverage}`; integração `tests/integration/{us-009-acerto,us-010-transferencia,us-011-registrar-acerto,us-013b-mes-acertado,us-022-rotulo-regra,us-028-acerto-opcional,us-029-indicador-acerto,us-052-parcelado-fora-do-acerto,en002a-stored,en002-constraints,en002-harness,en002-migracao,us-008-regra-divisao,us-030*}`.
Docs (histórico): [SDD-002](../tech-lead/sdd/SDD-002-split-e-acerto.md), [SDD-011](../tech-lead/sdd/SDD-011-acerto-opcional-rotulo-e-previa.md), [SDD-015](../tech-lead/sdd/SDD-015-percentual-por-lancamento-e-migracao-esboco.md), [ADR-011](../tech-lead/adrs/ADR-011-regra-de-divisao-versionada.md), [ADR-016](../tech-lead/adrs/ADR-016-percentual-gravado-por-lancamento.md), [ADR-021](../tech-lead/adrs/ADR-021-protocolo-de-migracao-e-corte-do-motor-do-acerto.md); US-008, 009/009b, 010, 011, 013/013b, 022, 028, 029, 030, 031, 052, 053, EN-002, 042..044 em `product-owner/backlog/stories/`; TASK-046/047 em `developer/tasks/tasks-board.md`; DEV-47/49 e TL-07/10/11/18 em `manager/pedidos-ao-gestor.md`; D-GES-17/21/23/24 em `manager/decisoes-do-gestor.md`.

Divergências docs x código (código vence):
1. ADR-016 §1 diz `CHECK(isSharedExpense = (splitMode<>NONE))` e §5 "origem BACKFILL"/`--rollback` simples; vigente (errata/ADR-021 §4): só `splitMode<>NONE ⇒ isSharedExpense`; reversão em 2 níveis.
2. ADR-016 §2/SDD-015 §4.1: `base = ⌊amount·bps÷10000⌋`; código usa `weight ?? bps` (DEV-49; EQUAL com N=3).
3. ADR-016 §6: duas implementações de `explain` (vigência e rateio gravado); código tem só a por vigência (L3).
4. ADR-016 §4/SDD-015: "famílias novas nascem STORED" confere (`familia/repo.ts`); famílias antigas só viram com `migrate:split`.
5. SDD-015 §4.3 fala em baixa e parcelas gravando rateio; parcela dividida e CUSTOM não existem no código (`INSTALLMENT_SPLIT_RELEASED=false`, nenhum escritor de CUSTOM).
6. SDD-002 §5.2/§6 descrevem o painel da R1; textos e rótulo foram substituídos pelo SDD-011 (neutro, "Valor a acertar", indicador, ponderado).
7. US-013b/SDD-002 podem sugerir restrição a quem desfaz; código não verifica papel (A6/L7).
