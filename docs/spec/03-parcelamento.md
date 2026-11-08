# Spec 03 — Parcelamento (compra parcelada no cartão, parcelas já pagas, aviso)

Atualizado: 2026-11-07

## Resumo
- Compra parcelada = compra no cartão em 2..24 parcelas. O valor informado é o TOTAL (sem juros); a sobra de centavos vai para a parcela 1. Cada parcela cai em UMA fatura (mês a mês) e conta no mês do fechamento dela (competência). O total consome o limite na hora; cada fatura paga libera só a sua parcela.
- Parcelas já pagas antes do app (US-065): informa-se quantas (0..N-1); só as restantes viram lançamentos, a partir da fatura aberta (ou da fechada ainda não paga). Nada é criado no passado.
- Parcelado pode ser dividido (US-042, `INSTALLMENT_SPLIT_RELEASED=true`): rateio igual em todas as parcelas, regra resolvida na data da compra; cada parcela entra no acerto do seu mês de competência. Os avisos da US-052 não aparecem mais.
- Ações do plano: criar, ver compra, excluir compra inteira (com Desfazer, só se TODAS as parcelas ativas estão em fatura aberta) e, por parcela (US-041), editar valor/categoria/descrição/observação ("Somente esta" ou "Esta e as próximas"), excluir e restaurar.

## Regras
| # | Regra | Onde |
| :-- | :-- | :-- |
| 1 | `installments` 1..24 (1 = à vista, sem plano). Só com `cardId`; com conta: 400 "Parcelas só valem para compra no cartão". | `schemas.ts` |
| 2 | Total >= nº de parcelas do plano completo (>= 1 centavo cada), senão 422 `INSTALLMENT_TOTAL_TOO_SMALL`. | `installment-create.ts` |
| 3 | `base = floor(total/N)`, TODA a sobra na parcela 1 (`splitInstallments`). Com P>=1 as restantes valem `base` (a sobra ficou na parcela 1, paga). | `installments.ts` |
| 4 | Parcela k na fatura `ref1 + (k-1)` meses, `ref1 = invoiceRefFor(data, fechamento)`; `occurredOn_k = addMonthsClamped(data original, k-1)` (fim de mês limitado, sempre da data original); uma parcela por fatura (ADR-020). | `installments.ts` |
| 5 | `competenceOn` das parcelas = `closingDate` da fatura, derivado no BANCO por gatilho (`tx_sync_competence`); sem plano = `occurredOn`. Período usa o predicado único `periodPredicate`. | migração `us040`, `ledger-where.ts` |
| 6 | Parcelas 2..N têm `occurredOn` futuro; "data não futura" vale só para a data de entrada. Home `recent`, `getDefaults` e `usageCountByMe` filtram `occurredOn <= hoje` (`notFutureFilter`). | `ledger-where.ts`, `repo.ts` |
| 7 | Criação atômica: trava de rateio da família, depois faturas em ordem CRESCENTE de `ref` (até 24), plano, N-P parcelas, revisão `CREATE` por parcela. Falha = nada gravado. `Idempotency-Key` cobre a compra inteira. | `installment-create.ts` |
| 8 | Fatura de qualquer parcela já PAGA: 422 `INVOICE_ALREADY_PAID`. Data futura: 422 `FUTURE_DATE_NOT_ALLOWED`. | idem |
| 9 | Limite: sem regra própria; `cardUsage` soma toda fatura sem pagamento ativo (inclui futuras). API ACEITA estourar (disponível negativo); UI avisa e pede "Confirmar mesmo assim". | `cartoes/queries.ts` |
| 10 | Parcelas herdam do plano: categoria, descrição, observação, pagador, autor (tags). Pagador padrão = quem lança. | `installment-create.ts` |

US-065 (parcelas já pagas):
| # | Regra |
| :-- | :-- |
| 12 | Campo `paidBeforeApp` (inteiro 0..N-1; padrão 0). >0 com 1x: 400 "Parcelas já pagas só valem para compra parcelada"; >=N: 400 "Informe menos parcelas pagas do que o total do parcelamento"; não inteiro: 400 "Informe um número inteiro de parcelas pagas". `.strict()` rejeita `paidBeforeAppCount`/`installmentNo`. |
| 13 | Modelo = contador `InstallmentPlan.paidBeforeAppCount` (ADR-027). Nenhuma linha para as pagas. Imutável (trigger `installment_plan_paid_before_immutable`); `CHECK 0 <= P < N`. |
| 14 | Com P>=1, `occurredOn` do pedido é a ÂNCORA da próxima parcela (padrão hoje = fatura aberta; UI oferece também a fechada não paga anterior se estiver em `payableInvoices`, DEV-49). `plan.purchaseOn` = data da 1ª parcela LANÇADA; `purchaseOnKnown = (P==0)`. |
| 15 | Restar só 1 parcela é válido (plano com 1 linha N/N). Resposta: `transaction` = 1ª parcela lançada (no = P+1); `plan` completo. |
| 16 | Limite e exclusão olham só as lançadas; as pagas nunca entram em total, limite, Resumo, saldos nem acerto. `paidBeforeApp.amountInCents` é informativo (Σ das N primeiras). |
| 17 | Prévia: P=0 "Nx de R$ ..."; P>=1 "Restam {N-P} parcelas de {valor} · a próxima ({P+1}/{N}) na fatura de {mês}" (singular se 1); linha extra quando `total % N != 0` ("diferença de centavos ficou na 1ª parcela, já paga"). |

Plano: ver, excluir, restaurar:
| # | Regra |
| :-- | :-- |
| 18 | `GET /installment-plans/:id`: plano + TODAS as parcelas (inclusive removidas) com situação da fatura HOJE (`OPEN/CLOSED/PAID`), `locked`, `lockedReason`, `canDelete`, `deleteBlockedReason` (`CARD_ARCHIVED`, `INVOICE_PAID`, `INVOICE_CLOSED`). Outra família: 404. Qualquer membro vê (inclui "Só meu"). |
| 19 | Excluir (`POST …/delete`, corpo com `version`): só se TODA parcela ativa está em fatura ABERTA (hoje <= fechamento e sem pagamento); senão 422 `INSTALLMENT_PLAN_LOCKED` ("Há parcelas em faturas já fechadas. Exclua só as parcelas abertas."). Já excluída: 409 `ALREADY_DELETED`; `version` velha: 409 `VERSION_CONFLICT`. |
| 20 | Exclusão carimba TODAS as linhas com o mesmo `deletedAt` (`deletionReason=DELETED`); revisão `DELETE` por parcela. |
| 21 | Desfazer (`POST …/restore`): devolve só as linhas com o carimbo do plano. Recusa: plano não excluído (422 `NOT_RESTORABLE`), cartão arquivado/excluído (422 `INVALID_REFERENCE`), fatura que ganhou pagamento (422 `INVOICE_PAID_LOCKED`). |
| 22 | Parcela individual (US-041, `installment-edit.ts`; as rotas desviam por `isInstallmentParcel`). `PATCH` com `scope` ("ONLY_THIS"/"THIS_AND_NEXT"), `version` e `planVersion`: campos `amountInCents`, `categoryId`, `description`, `note` (data e nº de parcelas não editam) => 200 `{ transactions[] (só as alteradas), plan, card }`. Sem `scope` e campo financeiro: 400 (`loadMutable`); só `tags` segue o caminho de tags. |
| 22a | Travas: família, plano `FOR UPDATE`, faturas em `ref` crescente. `version`/`planVersion` velhos: 409 `VERSION_CONFLICT` ("Esta compra foi alterada por {Nome}. Recarregue para continuar."). Parcela em fatura fechada ou paga: 422 `INSTALLMENT_LOCKED`; em "Esta e as próximas" as seguintes travadas são puladas (a escolhida travada recusa). Sem diferença: 200, sem `version+1`. Cada parcela alterada: `version+1` e revisão `UPDATE`; `plan.version+1`. |
| 22b | `POST /transactions/:id/delete` (só fatura aberta; senão `INSTALLMENT_LOCKED`; já excluída 409 `ALREADY_DELETED`) e `restore` (recusa fatura paga: `INVOICE_PAID_LOCKED`; plano excluído: `NOT_RESTORABLE`). Resposta traz `transaction`, `plan`, `card`. A parcela excluída fica `REMOVED` em "Ver compra"; o Desfazer do plano não a devolve (carimbo diferente). |
| 23 | Mês acertado: parcela com rateio (`isSharedExpense`) exige `confirmSettledPeriod` ao mudar valor, excluir ou restaurar (409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED`); mudança de valor recalcula os centavos com os mesmos `bps` (`rewriteSplitAmounts`). Vale para parcela dividida (US-042); excluir uma parcela recalcula o acerto do mês dela. |
| 24 | Permissão ("Só meu", US-084): excluir/restaurar exige controle sobre todas as parcelas (`assertCanWriteParcels`, uma checagem por combinação pagador/autor/cartão/conta). Ver spec 01. |
| 25 | Cartão: arquivar bloqueado com parcela ativa em fatura futura (`CARD_HAS_FUTURE_INSTALLMENTS`); restaurar/postar em cartão arquivado = `INVALID_REFERENCE`. `CardDTO.installmentsFutureInCents` e `InvoiceDTO.futureInstallmentsInCents` = Σ ativas em faturas `ref >` a de referência. |

Divisão do parcelado (US-042; antes, aviso da US-052):
| # | Regra |
| :-- | :-- |
| 26 | `split` (`NONE`/`RULE`/`CUSTOM`) ou `isSharedExpense:true` (== RULE) vale na compra parcelada. O rateio (`resolveSplit` na data da compra/âncora) é gravado igual em CADA parcela: `splitMode`, `splitRuleVersionId`, linhas `transaction_splits` com `bps` e centavos por parcela (`splitAmount`, sobra a quem pagou). Famílias LEGACY gravam só `isSharedExpense` (CUSTOM: 422 `CUSTOM_SPLIT_UNAVAILABLE`); acerto desligado: 422 `SETTLEMENT_DISABLED`. |
| 27 | Crédito do acerto = `payerMemberId` da parcela; quem paga a fatura não muda nada. Mudar a regra depois não reescreve parcelas gravadas. `GET /settlement/expenses` traz `installment {no,count}` ("Geladeira 1/3"). |
| 28 | Aviso `INSTALLMENT_SPLIT_NOTICE`/`showInstallmentNotice` e `installmentsOutside` ficam no código só atrás da flag: com `true` não aparecem (`defaults.split.installmentsAvailable=true`; `installmentsOutside` sempre `null`). |

## Invariantes
1. Plano nunca entra em `SUM`; só as linhas (Extrato, fatura, totais e acerto não ganham tabela nova).
2. Σ lançadas + Σ pagas = total original; Σ lançadas = Σ `splitInstallments(total,N).slice(P)`; `no` contíguos P+1..N, refs consecutivas.
3. Nenhuma parcela de plano recém-criado com competência anterior à fatura âncora.
4. `usedInCents` sobe exatamente Σ lançadas; excluir o plano devolve o mesmo valor; Desfazer o recompõe.
5. `paidBeforeAppCount` nunca muda após o INSERT (trigger).
6. Parcela dividida: `isSharedExpense=true`, Σ `bps`=10000 e Σ centavos = valor da parcela (trigger do rateio); acerto desligado = 422 `SETTLEMENT_DISABLED`.
7. Travas sempre na ordem plano -> faturas por `ref` crescente (sem deadlock).
8. `familyId` da sessão em toda consulta; plano/cartão de outra família = 404/`INVALID_REFERENCE`.
9. Parcela fora de detecção de recorrentes, agregados da IA e sugestão de categoria (filtro `installmentPlanId IS NULL`).
10. Exportação LGPD inclui `planoParcelasId`, `parcela`, `parcelas` por linha.

## Riscos aceitos
| ID | Limitação | Razão |
| :-- | :-- | :-- |
| L-3 | Fatura fechada ou paga trava a exclusão do plano inteiro | Integridade da fatura; contorno: excluir parcela a parcela (US-041) |
| L-4 | Excluir plano exige TODAS em fatura aberta, mas edição de compra única (US-016b) trava só a paga | Diferença conhecida (TL-12), a confirmar |
| L-5 | API aceita estourar o limite | Decisão de produto (aviso na UI) |
| L-6 | Seletor "fatura anterior" omite fechada com total zero (servidor aceitaria) | DEV-49 |
| L-8 | Acerto/`personal` conta a parcela restante no aviso informativo; saldos do acerto não mudam | DEV-48 (ratificar) |

## Fontes (código/testes)
Código: `src/modules/cartoes/{installments,installment-copy,queries,archive,invoice-service}.ts`; `transacoes/{installment-create,installment-manage,installment-edit,installment-schemas,installment-plan,mutations,schemas,service,ledger-where,repo}.ts`; `split/{service,shared-expenses,repo,indicator,schemas}.ts`; `transacoes/{installment-parcels,installment-state}.ts`; API `src/app/api/v1/installment-plans/[id]/{route,delete/route,restore/route}.ts` e `POST /transactions`; `prisma/schema.prisma` (`InstallmentPlan`); migrações `20261005140000_us040_parcelamento`, `20261024120000_us065_parcelas_anteriores`.
UI: `src/components/{transaction-drawer,installment-preview,installment-plan-dialog}.tsx`; `src/app/(app)/extrato/{edit-installment-form,detail-dialogs,transaction-detail-fields}.tsx`; `src/app/(app)/{home-screen,acerto/acerto-screen,extrato/ledger-row,extrato/transaction-detail-drawer,cartoes/[id]/invoice-screen}.tsx`.
Testes: `tests/unit/cartoes/installments.test.ts`, `tests/unit/split/installment-copy.test.ts`; integração `us-042-parcelado-dividido`, `us-041-gerenciar-parcelas`, `us-040a-parcelamento`, `us-040b-plano`, `us-040b-competencia`, `us-040-gatilho-competencia`, `us-052-parcelado-fora-do-acerto`, `us-065-parcelas-ja-pagas`, `us-016a-compra-cartao`, `sec021-so-meu-dono`, `us084-so-meu-controle`, `sec042-046-so-meu-reteste`, `sec017b-exportar-dados`; E2E `US-042-compra-parcelada-dividida`, `US-041-gerenciar-compra-parcelada`, `US-040a-compra-parcelada`, `US-040b-competencia-e-exclusao`, `US-065-parcelas-ja-pagas-na-entrada`; fábrica `tests/support/installment-factory.ts`.
Âncoras: US-040/041/042/052/065; SDD-014, SDD-018 §1, SDD-020; ADR-014/017/020/027.

## Pendências
- US-042 entregue (flag ligada). Parcelas antigas "Só meu" seguem assim; dividir só vale na criação (editar o rateio da parcela não existe).
- US-041 entregue. Editar parcela não muda categoria/descrição do plano (só das parcelas); excluir a última parcela ativa deixa o plano com `activeCount` 0 (sem excluir o plano).
- Usuário: ratificar DEV-48..50.
- Não verificado: UI do drawer/"Ver compra" no navegador após mudanças de "Só meu"; fatura PAID/OPEN de parcela em cartão cujo titular saiu.
- Divergências doc x código: SDD-014 §4.8 cita `assertEditableTransaction` (inexistente; real: `loadMutable` em `mutations.ts`); SDD-014 traz US-041/042 como contrato aprovado mas só 040a/040b/065 existem.
