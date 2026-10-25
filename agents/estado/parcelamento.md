# Estado vigente: Parcelamento (compra parcelada no cartão, parcelas já pagas, aviso do parcelado)

Atualizado: 2026-10-26 (código em `main` @ 205bac5). Fonte de verdade: código + testes (§f). Mudou a regra? Atualize ESTE arquivo no mesmo commit.

## a) Resumo para o usuário
- Compra parcelada = compra no cartão em 2..24 parcelas. O valor informado é o TOTAL (sem juros); a sobra de centavos vai para a parcela 1. Cada parcela cai em UMA fatura (mês a mês) e conta no mês do fechamento dessa fatura (competência). O total consome o limite do cartão na hora; cada fatura paga libera só a sua parcela.
- Parcelas já pagas antes do app (US-065): informa-se quantas (0..N-1); só as restantes viram lançamentos, a partir da fatura aberta (ou da fechada ainda não paga). Nada é criado no passado.
- Parcelado é SEMPRE "Só meu": dividir compra parcelada está BLOQUEADO (`INSTALLMENT_SPLIT_RELEASED=false`, US-042 não feita). O aviso "ainda não entram na divisão do acerto" aparece no formulário, no Acerto, no Resumo e em "Ver compra" (US-052).
- Só existem 3 ações no plano: criar, ver compra, excluir compra inteira (com Desfazer), e só se TODAS as parcelas ativas estão em fatura aberta. Editar, excluir ou restaurar UMA parcela NÃO existe (US-041 não feita; 422 `INSTALLMENT_NOT_EDITABLE`).
- Aberto: US-042 (dividir no acerto por parcela, toca o motor; Should na v0) e US-041 (editar/excluir parcela, cortável). Nenhuma em implementação.
- Decisões que dependem do usuário: se/quando liberar US-042 e US-041; ratificar DEV-48..50 (pedidos-ao-gestor).

## b) Regras vigentes
| # | Regra | Onde |
| :-- | :-- | :-- |
| 1 | `installments` 1..24 (1 = à vista, sem plano). Só com `cardId`; com conta: 400 "Parcelas só valem para compra no cartão". | `schemas.ts` |
| 2 | Total ≥ nº de parcelas do plano completo (≥ 1 centavo cada), senão 422 `INSTALLMENT_TOTAL_TOO_SMALL`. | `installment-create.ts` |
| 3 | Valores: `base = ⌊total÷N⌋`, TODA a sobra na parcela 1 (`splitInstallments`). Com P≥1 as restantes valem `base` (a sobra ficou na parcela 1, paga). | `installments.ts` |
| 4 | Parcela k na fatura `ref1 + (k-1)` meses, `ref1 = invoiceRefFor(data, fechamento)`; `occurredOn_k = addMonthsClamped(data original, k-1)` (fim de mês limitado, sempre da data original); uma parcela por fatura (ADR-020). | `installments.ts` |
| 5 | `competenceOn` das parcelas = `closingDate` da fatura, derivado no BANCO por gatilho (`tx_sync_competence`); sem plano = `occurredOn`. Consulta por período usa o predicado único (`periodPredicate`). | migração `us040`, `ledger-where.ts` |
| 6 | Parcelas 2..N têm `occurredOn` futuro; a validação "data não futura" vale só para a data de entrada. Home `recent`, `getDefaults` e `usageCountByMe` filtram `occurredOn <= hoje` (`notFutureFilter`). | `ledger-where.ts`, `repo.ts` |
| 7 | Criação atômica numa transação: trava de rateio da família, depois faturas em ordem CRESCENTE de `ref` (até 24), plano, N-P parcelas, revisão `CREATE` por parcela. Falha = nada gravado. `Idempotency-Key` cobre a compra inteira. | `installment-create.ts` |
| 8 | Fatura de qualquer parcela já PAGA: 422 `INVOICE_ALREADY_PAID`. Data futura: 422 `FUTURE_DATE_NOT_ALLOWED`. | idem |
| 9 | Limite: sem regra própria; `cardUsage` soma toda fatura sem pagamento ativo (inclui futuras). A API ACEITA estourar o limite (disponível negativo); a UI avisa e pede "Confirmar mesmo assim". | `cartoes/queries.ts` |
| 10 | Parcelas herdam do plano: categoria, descrição, observação, pagador, autor (tags, quando houver). Pagador padrão = quem lança. | `installment-create.ts` |

US-065 (parcelas já pagas):
| # | Regra |
| :-- | :-- |
| 12 | Campo `paidBeforeApp` (inteiro 0..N-1; padrão 0). >0 com 1x: 400 "Parcelas já pagas só valem para compra parcelada"; ≥N: 400 "Informe menos parcelas pagas do que o total do parcelamento"; não inteiro: 400 "Informe um número inteiro de parcelas pagas". `.strict()` rejeita `paidBeforeAppCount`/`installmentNo` do cliente. |
| 13 | Modelo = contador `InstallmentPlan.paidBeforeAppCount` (ADR-027). Nenhuma linha para as pagas. Imutável (trigger `installment_plan_paid_before_immutable`); `CHECK 0 <= P < N`. |
| 14 | Com P≥1, `occurredOn` do pedido é a ÂNCORA da próxima parcela (padrão hoje = fatura aberta; a UI oferece também a fechada não paga anterior se estiver em `payableInvoices`, DEV-49). `plan.purchaseOn` = data da 1ª parcela LANÇADA; `purchaseOnKnown = (P==0)`. |
| 15 | Restar só 1 parcela é válido (plano com 1 linha N/N). Resposta: `transaction` = 1ª parcela lançada (no = P+1); `plan` completo. |
| 16 | Limite e exclusão olham só as lançadas; as pagas nunca entram em total, limite, Resumo, saldos nem acerto. `paidBeforeApp.amountInCents` é informativo (Σ das N primeiras). |
| 17 | Prévia: P=0 "Nx de R$ …"; P≥1 "Restam {N-P} parcelas de {valor} · a próxima ({P+1}/{N}) na fatura de {mês}" (singular se 1); linha extra quando `total % N != 0` ("diferença de centavos ficou na 1ª parcela, já paga"). |

Plano: ver, excluir, restaurar:
| # | Regra |
| :-- | :-- |
| 18 | `GET /installment-plans/:id`: plano + TODAS as parcelas (inclusive removidas) com situação da fatura HOJE (`OPEN/CLOSED/PAID`), `locked`, `lockedReason`, `canDelete`, `deleteBlockedReason` (`CARD_ARCHIVED`, `INVOICE_PAID`, `INVOICE_CLOSED`). Outra família: 404. Qualquer membro vê (inclui "Só meu"). |
| 19 | Excluir plano (`POST …/delete`, corpo com `version`): só se TODA parcela ativa está em fatura ABERTA (hoje ≤ fechamento e sem pagamento); senão 422 `INSTALLMENT_PLAN_LOCKED` ("Há parcelas em faturas já fechadas. Exclua só as parcelas abertas."), nada excluído. Já excluída: 409 `ALREADY_DELETED`; `version` velha: 409 `VERSION_CONFLICT`. |
| 20 | Exclusão carimba TODAS as linhas com o mesmo `deletedAt` (`deletionReason=DELETED`); revisão `DELETE` por parcela. |
| 21 | Desfazer (`POST …/restore`): devolve só as linhas com o carimbo do plano. Recusa: plano não excluído (422 `NOT_RESTORABLE`), cartão arquivado/excluído (422 `INVALID_REFERENCE`), fatura que ganhou pagamento (422 `INVOICE_PAID_LOCKED`). |
| 22 | Parcela individual: `PATCH`, `delete`, `restore` em linha com `installmentPlanId` = 422 `INSTALLMENT_NOT_EDITABLE` ("Esta parcela não pode ser alterada. Exclua a compra parcelada e lance de novo."). Guarda em `loadMutable` (mutations.ts). |
| 23 | Mês acertado: só parcelas com rateio (`isSharedExpense`) exigiriam `confirmSettledPeriod`; hoje não existem (código pronto, sem efeito). |
| 24 | Permissão ("Só meu", US-084): excluir/restaurar exige controle sobre todas as parcelas (`assertCanWriteParcels`, uma checagem por combinação pagador/autor/cartão/conta). Ver [so-meu.md](so-meu.md) §b. |
| 25 | Cartão: arquivar bloqueado com parcela ativa em fatura futura (`CARD_HAS_FUTURE_INSTALLMENTS`); restaurar/postar em cartão arquivado = `INVALID_REFERENCE`. `CardDTO.installmentsFutureInCents` e `InvoiceDTO.futureInstallmentsInCents` = Σ ativas em faturas `ref >` a de referência. |

Aviso do parcelado (US-052, SDD-018 §1):
| # | Regra |
| :-- | :-- |
| 26 | Texto único `INSTALLMENT_SPLIT_NOTICE` ("Compras parceladas ainda não entram na divisão do acerto. Elas contam como Só meu até uma próxima versão.") em `installment-copy.ts`; nenhum outro lugar o escreve. |
| 27 | `showInstallmentNotice = acertoLigado && !INSTALLMENT_SPLIT_RELEASED`. Locais: faixa abaixo de "Dividir" no drawer com 2x+ (interruptor desabilitado, "Disponível em breve para compras parceladas"); Acerto; indicador "i" no Resumo (`installmentsOutside`); "Ver compra" (linha "Fora do acerto"). |
| 28 | `countInstallmentsOutside`: parcelas `EXPENSE`, `isSharedExpense=false`, ativas, no período do acerto (competência). Só leitura, fora de `computeSettlement`; `null` com acerto desligado ou flag liberado. |

## c) Invariantes
1. Plano nunca entra em `SUM`; só as linhas (Extrato, fatura, totais e acerto não ganham tabela nova).
2. Σ lançadas + Σ pagas = total original; Σ lançadas = Σ `splitInstallments(total,N).slice(P)`; `no` contíguos P+1..N, refs consecutivas.
3. Nenhuma parcela de plano recém-criado com competência anterior à fatura âncora.
4. `usedInCents` do cartão sobe exatamente Σ lançadas; excluir o plano devolve o mesmo valor; Desfazer o recompõe.
5. `paidBeforeAppCount` nunca muda após o INSERT (trigger).
6. Parcela criada SEMPRE com `isSharedExpense=false` (hardcoded em `installment-create.ts`); `isSharedExpense=true` com parcelas = 422 `SETTLEMENT_DISABLED` (acerto desligado) ou `INSTALLMENT_SPLIT_UNAVAILABLE`.
7. Travas sempre na ordem plano ➜ faturas por `ref` crescente (sem deadlock em compras simultâneas no cartão).
8. `familyId` da sessão em toda consulta; plano/cartão de outra família = 404/`INVALID_REFERENCE`.
9. Parcela não entra em detecção de recorrentes, agregados da IA nem sugestão de categoria (filtro `installmentPlanId IS NULL`).
10. Exportação LGPD inclui `planoParcelasId`, `parcela`, `parcelas` por linha.

## d) Limitações e riscos aceitos
| ID | Limitação | Razão |
| :-- | :-- | :-- |
| L-1 | Parcelado fora do acerto (Só meu forçado) | Rateio por parcela exige o motor STORED/EN-002 e janela de reversão (D-GES-23, TL-11); aviso visível em vez de antecipar a US-042 (D-PO-49) |
| L-2 | Sem editar/excluir parcela avulsa | US-041 cortável; contorno = excluir a compra inteira (aberta) e lançar de novo |
| L-3 | Fatura fechada ou paga trava a exclusão do plano inteiro | Regra de integridade da fatura; a US-041 deveria permitir excluir "só as abertas" |
| L-4 | Excluir plano exige TODAS em fatura aberta, mas a edição de compra única (US-016b) trava só a paga | Diferença conhecida (TL-12), a confirmar na homologação |
| L-5 | API aceita estourar o limite | Decisão de produto (aviso na UI, não bloqueio) |
| L-6 | Seletor "fatura anterior" omite fechada com total zero (o servidor aceitaria) | DEV-49 (sem rota nova) |
| L-8 | Acerto/`personal` passa a contar a parcela restante no aviso informativo; saldos do acerto não mudam | DEV-48 (ratificar) |

## e) Em andamento / pendências
- Nada em implementação.
- US-042 (3 pts, Must no backlog, Should na v0): ligar `INSTALLMENT_SPLIT_RELEASED=true` exige motor `family.splitEngine=STORED` e testes marcados `@depende-us-042` / `@depends-US-041`; ao ligar, os avisos da US-052 somem sem tocar em tela e `defaults.split.installmentsAvailable` vira true. A criação hoje grava `isSharedExpense:false`: precisa de rateio por parcela no serviço.
- US-041 (5 pts): editar valor/descrição/categoria/observação ("Somente esta" | "Esta e as próximas", `EditInstallmentSchema`, `INSTALLMENT_LOCKED`) e excluir/restaurar parcela. Hoje só o esboço no SDD-014 §4.10/§8.
- Usuário: ratificar DEV-48..50; decidir ordem US-042/US-041 (ordem técnica: US-042 ➜ US-043 ➜ US-041).
- Não verificado: UI do drawer/“Ver compra” no navegador após as mudanças de "Só meu"; fatura PAID/OPEN de parcela em cartão cujo titular saiu da família.

## f) Mapa de fontes
Código: `modules/cartoes/{installments,installment-copy,queries,archive,invoice-service}.ts`; `modules/transacoes/{installment-create,installment-manage,installment-plan,mutations,schemas,service,ledger-where,repo}.ts`; `modules/split/{service,repo,indicator,schemas}.ts` (aviso/`installmentsOutside`); API `app/api/v1/installment-plans/[id]/{route,delete/route,restore/route}.ts` e `POST /transactions`; UI `components/{transaction-drawer,installment-preview,installment-plan-dialog}.tsx`, `app/(app)/{home-screen,acerto/acerto-screen,extrato/ledger-row,extrato/transaction-detail-drawer,cartoes/[id]/invoice-screen}.tsx`; `prisma/schema.prisma` (`InstallmentPlan`); migrações `20261005140000_us040_parcelamento`, `20261024120000_us065_parcelas_anteriores`.
Testes: `tests/unit/cartoes/installments.test.ts`, `tests/unit/split/installment-copy.test.ts`; integração `us-040a-parcelamento`, `us-040b-plano`, `us-040b-competencia`, `us-040-gatilho-competencia`, `us-052-parcelado-fora-do-acerto`, `us-065-parcelas-ja-pagas`, `us-016a-compra-cartao`, `sec021-so-meu-dono`/`us084-so-meu-controle`/`sec042-046-so-meu-reteste`/`d-ges-59-…` (parcelas e dono), `sec017b-exportar-dados`; E2E `US-040a-compra-parcelada`, `US-040b-competencia-e-exclusao`, `US-065-parcelas-ja-pagas-na-entrada` (features + steps); fábrica `tests/support/installment-factory.ts`.
Docs: US [040](../product-owner/backlog/stories/US-040-compra-parcelada-no-cartao.md), [041](../product-owner/backlog/stories/US-041-gerenciar-compra-parcelada.md), [042](../product-owner/backlog/stories/US-042-parcelado-dividido-no-acerto-por-parcela.md), [052](../product-owner/backlog/stories/US-052-aviso-visivel-parcelado-fora-do-acerto.md), [065](../product-owner/backlog/stories/US-065-parcelas-ja-pagas-na-entrada.md); SDD [014](../tech-lead/sdd/SDD-014-parcelamento-esboco.md), [018 §1](../tech-lead/sdd/SDD-018-aviso-do-parcelado-e-fonte-unica-do-a-pagar.md), [020](../tech-lead/sdd/SDD-020-parcelas-ja-pagas-na-entrada.md); ADR [014](../tech-lead/adrs/ADR-014-cartao-e-fatura-no-ledger.md), [017](../tech-lead/adrs/ADR-017-parcelamento-no-cartao-e-competencia.md), [020](../tech-lead/adrs/ADR-020-parcela-na-k-esima-fatura-e-competencia-no-banco.md), [027](../tech-lead/adrs/ADR-027-parcelas-anteriores-ao-app.md).

| Regra | Origem |
| :-- | :-- |
| Parcelamento na R3 (não R2.1) | D-GES-17/21/23/25, D-PO-33/34/43/45, TL-02/07/11/12 |
| Aviso agora, sem antecipar US-042 | D-PO-49, US-052 |
| Parcelas já pagas | D-GES-29/31/34, D-PO-54..56, DEV-48..50 |

Divergências docs x código (código vence):
1. SDD-014 (arquivo `-esboco`) traz US-042/US-041 como contrato "Aprovado para Desenvolvimento", mas só 040a/040b e (via SDD-020) 065 existem; US-041 e US-042 NÃO estão implementadas.
2. SDD-014 §4.8 cita a guarda `assertEditableTransaction`; não existe. Real: `loadMutable` em `mutations.ts` (lança `INSTALLMENT_NOT_EDITABLE`).
3. Status das US-040/052/065 ("Esboçada", "Refinada, aguarda SDD") estão desatualizados: todas implementadas (DEV-48..50, D-GES-34).
4. SDD-018 §2 (US-055, "A pagar") não pertence a esta área; ver Previstas.
