# Spec 02 — Cartões e faturas

Atualizado: 2026-10-30

## Resumo
- Cartão tem dia de fechamento e de vencimento (1..28). Compra até o dia de fechamento entra na fatura que fecha naquele mês; depois, na do mês seguinte. Fatura criada na primeira compra do ciclo; total, limite usado e situação (Aberta, Fechada, Paga, Atrasada) são sempre calculados, nunca gravados.
- Todos os membros usam todos os cartões e pagam/desfazem qualquer fatura. O titular "controla" os "Só meu" lançados no cartão (spec 01); só o titular atual troca o titular. O Administrador reatribui apenas na remoção/saída de membro.
- Pagar fatura = total integral (sem parcial/juros), só depois do fechamento, debita a conta escolhida; não é despesa (não muda totais nem acerto). Fatura paga trava suas compras até desfazer.
- Limite estourado e conta negativa NÃO bloqueiam (só aviso na tela). Dias do ciclo travam após a primeira fatura.
- Arquivar (qualquer membro) exige zero fatura pendente/aberta com compra/parcela futura; excluir só Administrador e só sem nenhuma compra.

## Regras
Ref = mês de fechamento "YYYY-MM". Hoje = `todayInFamilyTz` (America/Sao_Paulo). Datas ISO comparadas como texto.

| # | Regra | Fonte |
| :-- | :-- | :-- |
| 1 | `invoiceRefFor(data, closingDay)`: dia <= closingDay mantém o mês, senão mês+1. Dias do ciclo 1..28. | `cycle.ts`, `schemas.ts` |
| 2 | `closingDate = ref-closingDay`; `dueDate` = mesmo mês se dueDay > closingDay, senão mês seguinte. | `cycle.ts` |
| 3 | Situação: paga => PAID; hoje <= closingDate => OPEN; senão CLOSED; `isOverdue` = CLOSED e hoje > dueDate. | `invoiceStatus` |
| 4 | Fatura aberta hoje existe "virtual" (total 0) mesmo sem compras; `isFuture` = ref > aberta (parcelas materializadas). | `queries.ts`, `invoice-service.ts` |
| 5 | Compra no cartão = `Transaction` EXPENSE com `accountId` nulo, `cardId`, `invoiceId`; não altera saldo de conta; entra nos totais de despesa. | SDD-008 §1 |
| 5b | Crédito no acerto vai a quem comprou (`payerMemberId`), não a quem paga a fatura (D-GES-13). | ADR-014 |
| 6 | Compra com data futura: `FUTURE_DATE_NOT_ALLOWED`. Cartão arquivado/excluído não recebe compra (422 `INVALID_REFERENCE`). | `invoices.ts` |
| 7 | Uso = Σ compras ativas em faturas sem pagamento ativo; disponível = limite - uso, pode ser negativo. | `cardUsage` |
| 8 | Pagar: fatura CLOSED (`INVOICE_NOT_CLOSED`), total > 0 (`INVOICE_EMPTY`), `expectedTotalInCents` = total sob lock (409 `INVOICE_TOTAL_CHANGED`). | `payment-service.ts` |
| 8b | `paidOn` > fechamento e <= hoje (`PAYMENT_BEFORE_CLOSING`, `FUTURE_DATE_NOT_ALLOWED`); conta ativa da família. | `payment-service.ts` |
| 8c | Um pagamento ativo por fatura (índice parcial; 409 `INVOICE_ALREADY_PAID`). Sem verificação de titular: qualquer membro paga. | `payment-service.ts` |
| 9 | Pagamento = `INVOICE_PAYMENT` DEBIT na conta, `isSharedExpense=false`, autor = quem pagou (sem payer), descrição "Pagamento da fatura {cartão} - {mês/ano}". Fora de totais e acerto; linha neutra no Extrato; `NOT_EDITABLE`. | `payment-service.ts` |
| 10 | Desfazer pagamento (qualquer membro, exige `version`): marca `UNDONE`, revisão `UNDO`; saldo e uso voltam por derivação; 409 `INVOICE_NOT_PAID`/`VERSION_CONFLICT`. | `undoInvoicePayment` |
| 11 | Fatura paga: editar/excluir/restaurar compra dela, ou mover compra para/de ela => 422 `INVOICE_PAID_LOCKED`; compra nova que cai nela => `INVOICE_ALREADY_PAID`. | SDD-008 §4.6 |
| 12 | Editar `closingDay`/`dueDay` após existir qualquer fatura (mesmo sem compras ativas) => 422 `CYCLE_LOCKED`. Limite abaixo do usado é aceito. | `updateCard` |
| 13 | Nome do cartão único na família, inclusive arquivado (409 `DUPLICATE_CARD_NAME`); exclusão libera o nome. | `service.ts`, US-033 |
| 14 | Arquivar (qualquer membro, `version`) bloqueia por: fatura fechada/vencida não paga (`CARD_HAS_UNPAID_INVOICE`), aberta com compras (`CARD_HAS_OPEN_PURCHASES`), parcelas futuras (`CARD_HAS_FUTURE_INSTALLMENTS`). Reativar livre. US-054: `GET /cards/:id/archive-check` => `{ blockers[] }` (`code`, `message`, `amountInCents?`, `ref?`) pela mesma `cardArchiveBlockers` do `archive`; o diálogo lista todos, desabilita a confirmação e o 422 continua a defesa. | `archive.ts` |
| 14b | Excluir: só ADMIN e só sem transação alguma (`CARD_HAS_HISTORY`). | `archive.ts` |
| 15 | Titular: padrão = quem cria; deve ser membro ativo (`INVALID_REFERENCE`). Trocar: só o titular ATUAL (403 `CARD_OWNER_ONLY`); grava `FamilyEvent CARD_OWNER_CHANGED`. Demais campos: qualquer membro. | `updateCard`, SEC-042/047 |
| 16 | Remoção/saída de titular: cartão com fatura pendente/aberta exige reatribuir (`CARD_NEEDS_OWNER`); sem pendência é arquivado; reatribuição pelo Admin é a única troca de titular sem ser o titular. | `familia/removal.ts` |
| 17 | "A pagar": fonte única `collectOpenPayables` (faturas abertas e fechadas não pagas, total > 0, mais previstas); fatura não é paga pela lista, só "Ver fatura". Faturas pagas com vencimento no período compõem "Previstas" do Resumo (`paidInvoicesDueIn`). | `previstas/payables.ts` |
| 18 | Aviso do parcelado fora do acerto: texto único `INSTALLMENT_SPLIT_NOTICE`, exibido com acerto ligado e flag `INSTALLMENT_SPLIT_RELEASED=false`; flag `true` remove os avisos. | `installment-copy.ts` |

Conta pagadora padrão (US-089, SDD-030), regra 19:
| # | Regra |
| :-- | :-- |
| 19a | `CreditCard.paymentAccountId` anulável (FK composta `(familyId, paymentAccountId)`, `RESTRICT`), opcional no cadastro/edição (uuid; `null` remove; omitido não mexe). |
| 19b | SÓ SUGERE: pré-seleção em "Pagar fatura" (precedência: escolha manual > pagadora ativa > sugestão US-023; texto "Conta pagadora do cartão") e "Sai da conta {nome}" em "A pagar". `payInvoice` nunca lê o campo. |
| 19c | Valida conta ativa da família só quando o valor muda (`lockAccountsForPosting`, 422 `INVALID_REFERENCE` `paymentAccountId`); no lock, conta antes de cartão. |
| 19d | Conta arquivada: vínculo mantido, `CardDTO.paymentAccount.archived=true`, UI avisa e esvazia o seletor; `A pagar`/`byAccount` ignoram (cai em "Sem conta definida"); reativar restaura. |
| 19e | Excluir a conta limpa o vínculo (`version+1`, evento por cartão `reason: ACCOUNT_DELETED`). Evento `CARD_PAYER_ACCOUNT_CHANGED` só em mudança (ids e nomes). Troca não altera pagamentos feitos. |
| 19f | `AccountDTO.payerForCards` alimenta o aviso ao arquivar/excluir conta. MCP `payWith` só para PLANNED. Export LGPD `cartoes[].contaPagadoraId`. |

Idempotência: criar cartão, pagar e desfazer usam `Idempotency-Key`. Concorrência: `FOR SHARE` no cartão ao criar fatura; `FOR UPDATE` na fatura em toda escrita que muda conteúdo (duas faturas em ordem crescente de ref).
Rotas `/api/v1/cards` (GET/POST), `/cards/:id` (GET/PATCH), `/archive`, `/unarchive`, `/delete`, `/invoices`, `/invoices/:ref`, `/pay`, `/undo-payment`; telas `/cartoes`, `/cartoes/[id]?ref=`.

## Invariantes
1. Compra no cartão nunca altera `accountBalances`; pagamento da fatura altera só o saldo da conta (-total) e nunca `ledgerTotals` nem acerto.
2. `usedInCents` = Σ totais das faturas não pagas; pagar reduz exatamente o total; desfazer restaura.
3. No máximo um pagamento ativo por fatura (índice `tx_invoice_payment_active_uq`); `closingDate < dueDate`; ref = mês de `closingDate`.
4. `invoiceId`/`familyId`/`authorMemberId`/`status` nunca vêm do cliente (`.strict()`); cartão/fatura/conta de outra família => 404 ou `INVALID_REFERENCE`.
5. Só o titular atual troca o titular (fora da remoção); a troca sempre gera evento. Titular = DC do "Só meu", lido na hora da ação.
6. Cartão arquivado nunca fica com compra aberta (corrida arquivar x comprar coberta por lock).
7. `expectedTotalInCents` é conferido dentro do lock antes de debitar.

## Riscos aceitos
Os de segurança sujeitos a veto do usuário.

| ID | Risco / limitação | Razão |
| :-- | :-- | :-- |
| D-PO-09 | Sem pagamento parcial, juros ou multa | Valor é sempre o total derivado |
| D-PO-08 | Limite estourado e conta negativa não bloqueiam | Aviso e confirmação só na UI |
| D-PO-07 | Ciclo travado mesmo se a única compra foi excluída | Evita reclassificar faturas materializadas |
| D-PO-02 | Qualquer membro paga/desfaz fatura e usa qualquer cartão | Confiança familiar; titular só governa "Só meu" e a troca de titular |
| SEC-052/046 | Remoção: Admin pode ficar com cartão e controlar "Só meu" ali lançados | Aceito + aviso na revisão da remoção |
| D-GES-57 | Admin não troca titular fora da remoção | Evita captura de "Só meu"; sujeito a veto |
| US-042 | Parcelado conta como "Só meu" no acerto e subestima créditos; formulário desabilita "Dividir" com 2+ parcelas | Flag `INSTALLMENT_SPLIT_RELEASED=false`; depende de EN-002 |
| SDD-008 | Importação de fatura (US-066..069) adiada | D-GES-28/33 |

## Fontes (código/testes)
Código: `src/modules/cartoes/{cycle,schemas,service,queries,invoices,invoice-service,payment-service,archive,installments,installment-copy,repo,hooks}.ts`; `previstas/payables.ts`; `familia/removal.ts`; `transacoes/{service,mutations}.ts`; `contas/{archive,service,lock}.ts`; rotas `src/app/api/v1/cards/**`; UI `src/app/(app)/cartoes/{cartoes-screen,card-drawer}.tsx`, `[id]/{invoice-screen,pay-invoice-drawer}.tsx`.
Testes unit: `tests/unit/cartoes/{cycle,schemas,installments}.test.ts`, `tests/unit/split/installment-copy.test.ts`, `tests/unit/contas/use-source-account.test.ts`, `tests/unit/familia/event-labels.test.ts`.
Integração (`tests/integration/`): `us-089-conta-pagadora`, `us-015-cartoes`, `us-016a-compra-cartao`, `us-016b-corrigir-compra`, `us-017a-fatura`, `us-017b-pagar-fatura`, `us-033-arquivar-cartao`, `us-055-a-pagar-fonte-unica`, `sec042-046-so-meu-reteste`, `sec047-050-reteste-rodada6`. E2E `tests/e2e/steps/US-015..017*`, `US-089-*`.
Âncoras: SDD-008, SDD-012 (arquivar), SDD-014, SDD-018, SDD-030; ADR-014 (cartão e fatura no ledger); US-015/016/017/033/052/055/089.

## Pendências
- US-089 implementada (TASK-092), aguarda validação do Gestor; migrações `20261030010000_us089_enum_family_event_card_payer` e `20261030010100_us089_card_payment_account`. Não verificada no navegador real (só E2E).
- US-042 (rateio por parcela) "Aprovada p/ Dev, não iniciada"; US-041 entregue (ver spec 03).
- Assinaturas no cartão (US-096..099, ADR-036) planejadas na [spec 12](12-assinaturas.md): novo impedimento de arquivar `CARD_HAS_ACTIVE_SUBSCRIPTIONS` e `origin = SUBSCRIPTION` em compras.
- UI de cartões e fatura nunca verificada no navegador após correções de titular (SEC-042/047); `pay-drawer`/Fatura mostrando "Só meu" alheios a todos (API lista para todos, como o Extrato) não confirmado na tela.
- Usuário: veto a D-GES-57; decidir se/quando liberar US-042.
- Divergências doc x código (código vence): SDD-008 diz "titular informativo" e "sem cartão arquivável" (superado por SEC-042/047 e US-033); SDD-008 §4.5 diz `payerMemberId: null` no pagamento (código grava só `authorMemberId` + `isSharedExpense=false`).
