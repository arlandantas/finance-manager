# Spec 05 — Acerto de contas e divisão

Atualizado: 2026-11-07

## Resumo
- Despesa dividida entra no acerto do mês; "Só meu", receita, transferência, acerto e pagamento de fatura não entram.
- Compra parcelada nunca é dividida (`INSTALLMENT_SPLIT_RELEASED=false`): parcela é "Só meu" e o Acerto avisa (US-052).
- Rateio (percentual e centavos por membro) é gravado no lançamento pela regra vigente na DATA da despesa; mudar a regra não reescreve o passado. Famílias novas nascem STORED; antigas só com `migrate:split`.
- Sobra de centavo fica com quem pagou (se peso > 0). O acerto sugere transferências para zerar o mês; registrar cria transferência entre contas; pode ser desfeito.
- Acerto opcional por família (só ADMIN liga/desliga; desligar não apaga nada).
- Modos no lançamento (US-043): "Só meu", "Pela regra da família" e "De outro jeito" (percentual por membro, 0% e 100% valem). Não existe: parcela dividida (US-042), "dividir" por categoria (US-044).
- Unidades: centavos inteiros (`amountInCents`); percentuais em bps (10000 = 100%); BigInt interno em `splitAmount`/`apportion`; sem float.

## Regras
### Rateio por lançamento (motor STORED)
| # | Regra | Fórmula / efeito |
| :-- | :-- | :-- |
| R1 | `splitAmount(amount, shares, pagador)` | `w = weight ?? bps`; `W = Σw` (>0, senão RangeError); `base_m = ⌊amount·w_m ÷ W⌋`; `sobra = amount − Σbase` (0..P−1, P = membros com w>0) |
| R2 | Destino da sobra | Pagador com `bps>0` recebe TODA a sobra. Senão 1 centavo a cada um dos `sobra` membros de maior resto (`amount·w mod W`), empate = menor ordinal. Só `bps>0`. Ordem de `shares` irrelevante |
| R3 | "Pela regra" (`resolveRuleShares`) | pesos do motor LEGACY no período da despesa (`legacyGroupWeights`), só >0; `bps = apportion(10000, pesos)` (maior resto, desempate menor ordinal); guarda também `weight` |
| R4 | EQUAL com N que não divide 10000 (3: 3334/3333/3333) | centavos saem de `weight` (1/1/1), não do `bps`: 90000÷3 = 30000×3 (DEV-49). `bps` gravado é só intenção |
| R5 | Gravação | `splitMode`: NONE / RULE / CUSTOM. `splitRuleVersionId` = regra vigente em `occurredOn` em RULE (informativo; nulo em CUSTOM). Uma linha em `transaction_splits` por membro com peso>0 |
| R6 | Editar valor/pagador de dividida | `rewriteSplitAmounts`: mesmos `bps`, centavos recalculados (DELETE+INSERT); RULE+EQUAL usa `weight=1` para bps>0. Editar a DATA não muda percentual nem `splitRuleVersionId` |
| R7 | Virar dividida / "Só meu" | Dividida: resolve regra na data e insere linhas. "Só meu": apaga linhas, `splitMode=NONE` |
| R8 | Quem escreve rateio | Só famílias STORED (`lockFamilySplit` lê o motor). LEGACY grava apenas `isSharedExpense` |
| R9 | Integridade no COMMIT | trigger deferida `tx_split_integrity`: NONE ⇒ 0 linhas; senão `Σbps=10000` e `Σamount=valor`. CHECK `tx_split_kind_chk`: `splitMode<>NONE ⇒ kind=EXPENSE e isSharedExpense`. Excluída mantém rateio |

### Modo "De outro jeito" (US-043, ADR-040)
| # | Regra |
| :-- | :-- |
| C1 | Contrato: `split` = `{mode:NONE}` / `{mode:RULE}` / `{mode:CUSTOM, shares:[{memberId,bps}]}` (≥2, sem repetição, Σ=10000: 400 "Os percentuais precisam somar 100%"). `split` e `isSharedExpense` juntos = 400; `isSharedExpense:true` legado == RULE; ausente == NONE. Vale em criar/editar despesa e criar/editar previsão |
| C2 | CUSTOM exige exatamente os membros ATIVOS (422 `SHARES_MEMBER_MISMATCH`); só famílias STORED (LEGACY: 422 `CUSTOM_SPLIT_UNAVAILABLE`; `defaults.split.modes` só lista CUSTOM em STORED). Linhas só com `bps>0`; centavos por `splitAmount` (sobra ao pagador com bps>0) |
| C3 | Editar: `split` troca o modo (apaga e regrava as linhas; RULE resolve na data da despesa); RULE sobre RULE e CUSTOM com os mesmos bps não mudam nada; `isSharedExpense:true` numa dividida mantém o modo. Mês acertado exige `confirmSettledPeriod`; acerto desligado = 422 `SETTLEMENT_DISABLED` ao dividir |
| C4 | `TransactionDTO.split = {mode, ruleVersionId, shares:[{member,bps,amountInCents}]}` (null em "Só meu"); revisão registra `split` (modo antes/depois) |
| C5 | Previsão: `planned_expenses.splitMode` + `splitShares` (JSON, só CUSTOM); `PlannedExpenseDTO.split`. A baixa herda: RULE resolvida na data do pagamento, CUSTOM copiado (exige membros ativos de novo) |

### Motor do acerto
| # | Regra | Detalhe |
| :-- | :-- | :-- |
| M1 | Entrada | `repo.sharedExpenses`: `kind=EXPENSE`, `isSharedExpense`, `deletedAt=null`, no período. Nunca transferência, abertura, receita |
| M2 | STORED (`computeSettlementStored`) | `quota_m = Σ splits.amountInCents`; `paid_m = Σ pagos`; sem rateio ou `Σ≠valor` lança `SplitInconsistentError` |
| M3 | LEGACY (`computeSettlementLegacy`, congelado) | agrupa por versão de regra vigente na data; `apportion(total_do_grupo, pesos)` (arredonda por GRUPO). Só famílias LEGACY |
| M4 | Saldo | `difference = paid − quota`; acerto: `adjustment(from) += valor`, `adjustment(to) −= valor`; `balance = difference + adjustment` |
| M5 | Membros do cálculo | presentes (`removedOn==null` ou `>=` início do período) + quem pagou/recebeu rateio no período. Ordem = `ordinal` (`joinedAt,id`), depois id |
| M6 | Sugestões (`suggestSettlements`) | guloso: maior devedor × maior credor (empate = menor ordinal), `min(d,c)`, no máx. N−1 |
| M7 | Status | <2 membros: NEEDS_MORE_MEMBERS; sem despesa e sem acerto: EMPTY; sugestões>0: PENDING; acerto ativo: SETTLED; senão BALANCED |
| M8 | Rótulo (US-022) | `explainByRules` (única, nos dois motores): segmentos por vigência; "Na prática neste mês" = `apportion(1000, cotas)` em décimos de %; aparece com ≥2 vetores distintos |
| M9 | Pendências (`pendingSettlementMonths`) | períodos com despesa comum (teto 120 meses; Home: janela de 12 antes do corrente); PENDING se sugestões>0 |
| M10 | Período | chave = mês de início do ciclo (`cutDay` 1..28, sem UI); `periodFilter` único para o ledger |

### Regra da família
| # | Regra |
| :-- | :-- |
| G1 | `SplitRuleVersion` append-only; vigente = maior `effectiveFrom <= data`, empate = `createdAt` mais recente (`ruleAt`). Padrão EQUAL desde 1970-01-01 |
| G2 | PUT `/split-rule` (só ADMIN): EQUAL ou PROPORTIONAL (todos os ATIVOS, Σ=10000, sem repetição); `effectiveFrom >=` início do período atual (`EFFECTIVE_FROM_IN_PAST`); sempre nova versão; `lockFamilySplit` |
| G3 | `stale`: regra PROPORTIONAL que não cobre exatamente os membros atuais ("Redefinir percentuais"; não-admin: "Peça a um Administrador") |
| G4 | Prévia POST `/split-rule/preview` (ADMIN, não grava): recalcula o mês atual via LEGACY; `impacto = Σ|Δ saldo| ÷ 2`; `affectedExpensesCount` = despesas com data `>= effectiveFrom`. Sugestão por renda: `apportion(100, rendas)·100` bps (renda não sai do navegador) |
| G5 | `parsePercentToBps` aceita "60", "33,33"; 0..100, até 2 casas |

### Acerto opcional, "dividir" e rótulo
| # | Regra |
| :-- | :-- |
| O1 | `Family.settlementEnabled` (padrão true). PATCH `/family/settings` só ADMIN, com `version`; desligar com pendência em qualquer mês exige `confirmPending` (409 `SETTLEMENT_PENDING`). Religar restaura |
| O2 | Desligado: rotas de acerto/regra = 409 `SETTLEMENT_DISABLED`; gravar dividida = 422 `SETTLEMENT_DISABLED` (`assertCanShare`); dividida existente permanece |
| O3 | "Só meu" por padrão em lançamento, cartão e previsão (US-030). Lançamento, previsão e edição usam o seletor (radiogroup) "Só meu" / "Pela regra da família (50% / 50%)" / "De outro jeito" (`SplitModeSelector`; soma ≠ 100% desabilita salvar; "De outro jeito" só com `modes` CUSTOM e fora de série); só com acerto ligado e ≥2 ativos. Assinatura mantém o interruptor (`splitSwitchLabel`) |
| O4 | Linguagem neutra (`SPLIT_COPY`): sem a palavra "deve"; ex.: "Para equilibrar o mês: A transfere R$ X para B" |
| O5 | Indicador da Home: `current` PENDING/IN_ORDER (null em EMPTY/NEEDS_MORE_MEMBERS); `previous` = meses pendentes na janela de 12 |

### Registrar acerto, mês acertado, desfazer
| # | Regra |
| :-- | :-- |
| A1 | POST `/settlements` (`registerSettlement`): `lockFamilySplit` primeiro, depois advisory lock (família, período). Membros/contas da família (conta inexistente 404); contas e membros diferentes; data não futura |
| A2 | Permissão: devedor, credor ou ADMIN (senão 403) |
| A3 | Valida contra o cálculo ATUAL: precisa existir sugestão exata `from→to` (422 `SETTLEMENT_NOT_DUE`); `valor <= sugerido` (422 `SETTLEMENT_EXCEEDS_DUE`, `dueInCents`). Acerto parcial permitido |
| A4 | `TransferGroup kind=SETTLEMENT` com `settlementPeriod`, `from/toMember`, 2 pernas (TRANSFER_OUT/IN); descrição "Acerto de contas - Mês" (ano se diferente do corrente). Nunca é despesa; só ajusta saldo (M4) |
| A5 | Mês acertado = período com acerto ATIVO (`hasActiveSettlement`). Editar valor/data/pagador/divisão, excluir ou restaurar despesa comum exige `confirmSettledPeriod` (409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED`). Saldo recalculado, pode inverter sentido |
| A6 | Desfazer: POST `/transfers/:groupId/undo` com `version` (qualquer membro, sem checar papel). Marca grupo e pernas `deletedAt` (`UNDONE`), revisão `UNDO`; 409 `ALREADY_UNDONE`/`VERSION_CONFLICT`; recusa conta arquivada (`ACCOUNT_ARCHIVED_LOCKED`); `lockFamilySplit`. Acerto/transferência só se desfazem |
| A7 | Transferência comum (`createTransfer`): contas diferentes, valor>0, data não futura, nota ≤500; não entra no acerto |
| A8 | Membro sem conta (US-093a): é `MemberInput` comum; selo "Sem acesso ao app"; destino do acerto LIVRE (sem `SETTLEMENT_DESTINATION_IS_DEBTOR`). U2 (sobra ao pagador) só no rateio gravado; LEGACY/backfill dá ao menor ordinal; entrada por PERÍODO (`joinedOn <= fim`), não pela data da despesa (DEV-161) |
| A9 | Baixa de prevista dividida usa `createExpenseCore` e herda o rateio (C5) |

## Invariantes
1. `Σ amount = valor` e `Σ bps = 10000` por lançamento dividido (R9); `Σ cotas = total comum`, `Σ diferença = 0`, `Σ saldo = 0`.
2. `lockFamilySplit` (`FOR SHARE`) é a PRIMEIRA trava de toda escrita que cria/altera/exclui/restaura despesa comum, grava regra, registra/desfaz acerto, baixa previsão ou mexe em parcela (ADR-021); `lock-coverage.test.ts` varre o código.
3. Regra e rateio imutáveis para o passado.
4. Despesa de família STORED sempre tem rateio; falta ou Σ errado = erro explícito.
5. Isolamento por `familyId` em consultas e FKs compostas (ADR-013).
6. Motor LEGACY congelado (oráculo do backfill); não alterar.

## Riscos aceitos
| ID | Limitação | Razão |
| :-- | :-- | :-- |
| L1 | Arredondamento difere: LEGACY por grupo, STORED por lançamento (3×R$100,01 a 50/50 pagos por A: LEGACY 150,02/150,01; STORED 150,03/150,00) | RN-018.3; migração preservou números históricos (ADR-021) |
| L2 | Lançamento novo excluído/restaurado ou migrado pode ter centavos distintos do LEGACY | restaurados entram no mundo STORED |
| L3 | `explainByRules` usa vigência por data, não `splitRuleVersionId`; lançamentos CUSTOM não entram no rótulo | rótulo descreve a regra, não exceções por lançamento |
| L4 | Acerto aceita qualquer conta da família (SEC-056, D-GES-61) e pode mover crédito de ex-membro (SEC-054/055) | aceito; sujeito a veto |
| L5 | Quem voltou à família e divide item antigo aparece 2x (SEC-053) | info |
| L6 | Parcelas fora do acerto (aviso US-052) | Encerra com a US-042 (ADR-040) |
| L7 | Qualquer membro desfaz qualquer acerto | decisão US-013b |
| L8 | Mês acertado não trava: edição só pede confirmação | acerto é conciliação, não fechamento |
| L9 | Destino do acerto livre (SEC-059b) | decisão D-GES-66 |

## Fontes
Código: `src/modules/split/` (`split-input`, `custom-input`, `split-amount`, `settlement-{common,legacy,stored}`, `settlement`, `rules`, `service`, `write`, `lock`, `guard`, `explain`, `preview`, `pending`, `indicator`, `backfill`, `migrate-family`, `labels`, `copy`, `shares-label`), `src/lib/apportion.ts`, `src/modules/contas/transfers.ts`, `src/modules/transacoes/{service,mutations,split-edit}.ts` (`requireSettledConfirmation`), `src/modules/previstas/split.ts`, `src/components/split-mode-selector.tsx`, `src/modules/familia/{settings,repo}.ts`, `scripts/migrate-split.ts`, `src/app/(app)/acerto/`. Esquema: `transaction_splits`, `transactions.splitMode`, `families.splitEngine/settlementEnabled`, migrações `20261005150000_en002_percentual_por_lancamento`, `20261107000500_us043_modo_custom`.
Testes: `tests/unit/split/{split-input,split-amount,settlement,settlement-stored,backfill,rules,explain,preview,copy,lock-coverage}`; `tests/integration/{us-043-dividir-no-lancamento,us-009-acerto,us-010-transferencia,us-011-registrar-acerto,us-013b-mes-acertado,us-022-rotulo-regra,us-028-acerto-opcional,us-029-indicador-acerto,us-052-parcelado-fora-do-acerto,en002a-stored,en002-constraints,en002-harness,en002-migracao,us-008-regra-divisao,us-030*,us-093a-titular-e-seletores,us-093a-harness-acerto-sem-conta}`.
Ancoras: SDD-002/011/015/034, ADR-011/016/021 (vigente: só `splitMode<>NONE ⇒ isSharedExpense`; reversão em 2 níveis; `base` usa `weight ?? bps`).

## Pendências
- Janela de reversão dispensada pelo usuário (ADR-040, 2026-11-07): sem produção nem dados reais. US-043 entregue; faltam US-041, US-042 e US-044, nessa ordem.
- Migração `us043_modo_custom` criou `splitMode`/`splitShares` em previstas (+ CHECK `planned_split_chk`). O CHECK `transactions: isSharedExpense=(splitMode<>NONE)` NÃO entrou: `families.splitEngine` e as fábricas de teste ainda nascem LEGACY (grava `isSharedExpense` sem modo). Entra quando toda família for STORED.
- Rollback nível 2 (`--rollback --purge`) não vale mais (existe CUSTOM).
