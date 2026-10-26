# Estado vigente: Cartões e faturas

Atualizado: 2026-10-26 (após D-GES-61). Fonte de verdade: código + testes (§f). Mudou a regra? Atualize ESTE arquivo no mesmo commit.

## a) Resumo para o usuário
- Cartão tem dia de fechamento e de vencimento (1..28). Compra até o dia de fechamento entra na fatura que fecha naquele mês; depois, na do mês seguinte. A fatura é criada na primeira compra do ciclo; total, limite usado e situação (Aberta, Fechada, Paga, Atrasada) são sempre calculados, nunca gravados.
- Todos os membros usam todos os cartões e pagam/desfazem qualquer fatura. O titular do cartão deixou de ser só informativo: ele "controla" os "Só meu" lançados no cartão (ver [so-meu.md](so-meu.md)); só o titular atual troca o titular. O Administrador reatribui apenas na remoção/saída de membro.
- Pagar a fatura é sempre o total integral (sem pagamento parcial/juros), só depois do fechamento, e debita a conta escolhida; não é despesa (não muda totais nem acerto). Compras de fatura paga ficam travadas até desfazer o pagamento.
- Limite estourado e conta negativa NÃO bloqueiam (só aviso na tela). Dias do ciclo ficam travados após a primeira fatura.
- Arquivar cartão (qualquer membro) exige zero fatura pendente/aberta com compra/parcela futura; excluir só Administrador e só sem nenhuma compra.
- Aberto: parcelado ainda fora do acerto (US-042 não liberada, flag `INSTALLMENT_SPLIT_RELEASED=false`); UI nunca verificada no navegador após as rodadas de segurança do "Só meu".
- Decisões que dependem do usuário: veto a D-GES-57 (só o titular troca titular); definir se/quando liberar a US-042 (rateio por parcela).

## b) Regras vigentes
Siglas: Ref = mês de fechamento "YYYY-MM". Hoje = `todayInFamilyTz` (America/Sao_Paulo). Datas ISO comparadas como texto.

| # | Regra | Fonte |
| :-- | :-- | :-- |
| 1 | `invoiceRefFor(data, closingDay)`: dia <= closingDay mantém o mês, senão mês+1. Dias do ciclo 1..28 | `cycle.ts`, `schemas.ts` |
| 2 | `closingDate = ref-closingDay`; `dueDate` = mesmo mês se dueDay > closingDay, senão mês seguinte | `cycle.ts` |
| 3 | Situação: paga => PAID; hoje <= closingDate => OPEN; senão CLOSED; `isOverdue` = CLOSED e hoje > dueDate | `invoiceStatus` |
| 4 | Fatura aberta hoje existe "virtual" (total 0) mesmo sem compras; `isFuture` = ref > aberta (parcelas materializadas) | `queries.ts`, `invoice-service.ts` |
| 5 | Compra no cartão = `Transaction` EXPENSE com `accountId` nulo, `cardId`, `invoiceId`; não altera saldo de conta; entra nos totais de despesa. Crédito no acerto vai a quem comprou (`payerMemberId`), não a quem paga a fatura | SDD-008 §1, D-GES-13 |
| 6 | Compra com data futura: recusada (`FUTURE_DATE_NOT_ALLOWED`). Cartão arquivado/excluído não recebe compra (422 `INVALID_REFERENCE`) | `invoices.ts` |
| 7 | Uso do cartão = Σ compras ativas em faturas sem pagamento ativo; disponível = limite - uso, pode ser negativo | `cardUsage` |
| 8 | Pagar: fatura precisa estar CLOSED (`INVOICE_NOT_CLOSED`), total > 0 (`INVOICE_EMPTY`), `expectedTotalInCents` igual ao total sob lock (`409 INVOICE_TOTAL_CHANGED`), `paidOn` > fechamento e <= hoje (`PAYMENT_BEFORE_CLOSING`, `FUTURE_DATE_NOT_ALLOWED`), conta ativa da família. Um pagamento ativo por fatura (índice parcial; `409 INVOICE_ALREADY_PAID`). Sem verificação de titular: qualquer membro paga | `payment-service.ts` |
| 9 | Pagamento = `INVOICE_PAYMENT` DEBIT na conta, `isSharedExpense=false`, autor = quem pagou, descrição "Pagamento da fatura {cartão} - {mês/ano}". Fora de totais e acerto; no Extrato é linha neutra. Não editável/excluível (`NOT_EDITABLE`) | `payment-service.ts` |
| 10 | Desfazer pagamento (qualquer membro, exige `version`): marca `UNDONE`, revisão `UNDO`; saldo e uso voltam por derivação; `409 INVOICE_NOT_PAID`/`VERSION_CONFLICT` | `undoInvoicePayment` |
| 11 | Fatura paga: editar/excluir/restaurar compra dela, ou mover compra para/de ela => `422 INVOICE_PAID_LOCKED`; compra nova que cai nela => `INVOICE_ALREADY_PAID` | SDD-008 §4.6 |
| 12 | Editar `closingDay`/`dueDay` após existir qualquer fatura (mesmo sem compras ativas) => `422 CYCLE_LOCKED`. Limite abaixo do usado é aceito | `updateCard` |
| 13 | Nome do cartão único na família, inclusive arquivado (`409 DUPLICATE_CARD_NAME`); exclusão libera o nome | `service.ts`, US-033 |
| 14 | Arquivar (qualquer membro, `version`): bloqueia por fatura fechada/vencida não paga (`CARD_HAS_UNPAID_INVOICE`), fatura aberta com compras (`CARD_HAS_OPEN_PURCHASES`), parcelas futuras (`CARD_HAS_FUTURE_INSTALLMENTS`). Reativar livre. Excluir: só ADMIN e só sem transação alguma (`CARD_HAS_HISTORY`) | `archive.ts` |
| 15 | Titular: padrão = quem cria; titular deve ser membro ativo (`INVALID_REFERENCE`). Trocar titular: só o titular ATUAL (`403 CARD_OWNER_ONLY`); grava `FamilyEvent CARD_OWNER_CHANGED`. Demais campos do cartão editáveis por qualquer membro | `updateCard`, SEC-042/047 |
| 16 | Remoção/saída de membro titular: cartão com fatura pendente/aberta exige reatribuir (`CARD_NEEDS_OWNER`); sem pendência é arquivado; reatribuição pelo Administrador é a única troca de titular sem ser o titular | `familia/removal.ts` |
| 17 | "A pagar": fonte única `collectOpenPayables` (faturas abertas e fechadas não pagas, total > 0, mais previstas); fatura não é paga pela lista, só "Ver fatura". Faturas pagas com vencimento no período compõem "Previstas" do Resumo (`paidInvoicesDueIn`) | SDD-018 §2, `previstas/payables.ts` |
| 18 | Aviso do parcelado fora do acerto: texto único `INSTALLMENT_SPLIT_NOTICE`, exibido com acerto ligado e flag `false`; flag `true` remove todos os avisos | SDD-018 §1, `installment-copy.ts` |

Idempotência: criar cartão, pagar e desfazer usam `Idempotency-Key`. Concorrência: lock `FOR SHARE` no cartão ao criar fatura, `FOR UPDATE` na fatura em toda escrita que muda conteúdo (duas faturas em ordem crescente de ref). Rotas: `/api/v1/cards` (GET/POST), `/cards/:id` (GET/PATCH), `/archive`, `/unarchive`, `/delete`, `/invoices`, `/invoices/:ref`, `/pay`, `/undo-payment`; telas `/cartoes`, `/cartoes/[id]?ref=`.

## c) Invariantes
1. Compra no cartão nunca altera `accountBalances`; pagamento da fatura altera só o saldo da conta (-total) e nunca `ledgerTotals` nem acerto.
2. `usedInCents` = Σ totais das faturas não pagas; pagar reduz exatamente o total; desfazer restaura.
3. No máximo um pagamento ativo por fatura (índice `tx_invoice_payment_active_uq`); `closingDate < dueDate`; ref = mês de `closingDate`.
4. `invoiceId`/`familyId`/`authorMemberId`/`status` nunca vêm do cliente (`.strict()`); cartão/fatura/conta de outra família => 404 ou `INVALID_REFERENCE`.
5. Só o titular atual troca o titular (fora da remoção de membro); a troca sempre gera evento. Titular = papel de autorização do "Só meu" (DC), lido na hora da ação.
6. Cartão arquivado nunca fica com compra aberta (corrida arquivar x comprar coberta por lock).
7. "Total que o usuário viu" (`expectedTotalInCents`) é conferido dentro do lock antes de debitar.

## d) Limitações e riscos aceitos
| ID | Risco / limitação | Razão |
| :-- | :-- | :-- |
| D-PO-09 | Sem pagamento parcial, juros ou multa | Escopo: valor é sempre o total derivado |
| D-PO-08 | Limite estourado e conta negativa não bloqueiam | Reflete a vida real; aviso e confirmação só na UI |
| D-PO-07 | Ciclo travado mesmo se a única compra foi excluída | Conservador; evita reclassificar faturas já materializadas |
| D-PO-02 | Qualquer membro paga/desfaz fatura e usa qualquer cartão | Modelo de confiança familiar; titular só governa "Só meu" e a troca de titular |
| SEC-052 | Remoção: Admin pode ficar com cartão e controlar "Só meu" de ativos ali lançados | Aceito (info), aviso na revisão (SEC-046) |
| SEC-046 | Remoção dá ao Admin controle dos "Só meu" nas contas/cartões reatribuídos | Aceito + aviso |
| D-GES-57 | Admin não troca titular fora da remoção (revisa D-GES-53) | Evita captura de "Só meu" pelo Admin; sujeito a veto do usuário |
| US-042 | Parcelado conta como "Só meu" no acerto e subestima créditos; formulário desabilita "Dividir" com 2+ parcelas | Rateio por parcela depende de EN-002; flag `INSTALLMENT_SPLIT_RELEASED=false` |
| SDD-008 | Importação de fatura (US-066..069) adiada (R5) | D-GES-28/33 |
Todos os de segurança sujeitos a veto do usuário.

## e) Em andamento / pendências
- Nada em implementação nesta área.
- US-042 (rateio por parcela) e US-041 seguem "Aprovada p/ Dev, não iniciada"; US-040/065 constam como "Implementada" nas US desde 2026-10-25 (ver [parcelamento.md](parcelamento.md)).
- UI de cartões e fatura nunca verificada no navegador após as correções de titular (SEC-042/047).
- Não verificado: `pay-drawer`/Fatura mostrando compras "Só meu" alheias a todos (a API lista para todos, como o Extrato); não confirmado na tela.
- Usuário: veto a D-GES-57; decisão sobre liberar US-042.

## f) Mapa de fontes
Código: `src/modules/cartoes/{cycle,schemas,service,queries,invoices,invoice-service,payment-service,archive,installments,installment-copy,repo,hooks}.ts`; `previstas/payables.ts` (A pagar); `familia/removal.ts` (cartões na remoção); `transacoes/{service,mutations}.ts` (compra no cartão, `INVOICE_PAID_LOCKED`); rotas `src/app/api/v1/cards/**`; UI `src/app/(app)/cartoes/{cartoes-screen,card-drawer}.tsx`, `[id]/{invoice-screen,pay-invoice-drawer}.tsx`.
Testes: `tests/unit/cartoes/{cycle,schemas,installments}.test.ts`, `tests/unit/split/installment-copy.test.ts`; `tests/integration/` `us-015-cartoes`, `us-016a-compra-cartao`, `us-016b-corrigir-compra`, `us-017a-fatura`, `us-017b-pagar-fatura`, `us-033-arquivar-cartao`, `us-055-a-pagar-fonte-unica`, `sec042-046-so-meu-reteste`, `sec047-050-reteste-rodada6`; E2E `tests/e2e/steps/US-015..017*`.
Docs: [SDD-008](../tech-lead/sdd/SDD-008-cartoes-fatura.md); [SDD-018](../tech-lead/sdd/SDD-018-aviso-do-parcelado-e-fonte-unica-do-a-pagar.md); [SDD-012](../tech-lead/sdd/SDD-012-manutencao-de-cadastros.md) (arquivar); [SDD-014](../tech-lead/sdd/SDD-014-parcelamento-esboco.md); US em `product-owner/backlog/stories/`: US-015, US-016/016b, US-017/017b, US-033, US-052, US-055; ADR-014 (cartão e fatura no ledger); [decisoes-po-r21-r3.md](../_historico/product-owner/backlog/decisoes-po-r21-r3.md) (D-PO-17).

| Regra | Origem |
| :-- | :-- |
| Compra/fatura no ledger; crédito a quem comprou | ADR-014, D-GES-12/13, D-PO-05..10 |
| Pagamento integral, fatura paga travada | US-017b, D-PO-09 |
| Arquivar/excluir cartão | US-033, SDD-012 §4.9, D-PO-17 |
| A pagar fonte única | US-055, SDD-018 §2 |
| Aviso do parcelado | US-052, SDD-018 §1 |
| Titular do cartão = papel de autorização | SEC-042/047, D-GES-53/57, DEV-124/131 |
| Remoção de titular | US-035, SEC-046, D-GES-53 |
| Importação de fatura adiada | D-GES-28/33 |

Divergências docs x código (código vence):
1. SDD-008 §1 ("titular informativo; sem `role`", D-PO-02) e "Sem cartão arquivável": superadas por SEC-042/047 (titular autoriza "Só meu") e por US-033/SDD-012 (arquivar/excluir existe).
2. SDD-008 §4.4 passo 2/6 e §2 não citam arquivado (`INVALID_REFERENCE` via `getOrCreateInvoice`, US-033) nem `CARD_OWNER_ONLY`.
3. SDD-008 §4.5 diz `payerMemberId: null` no pagamento; o código grava só `authorMemberId` e `isSharedExpense=false` (sem payer).
4. D-GES-53 (Admin troca titular via SEC-042) superada por D-GES-57: o código nega ao Admin fora da remoção.
5. Status das US corrigido em 2026-10-25 (US-040, 052, 055, 065 "Implementada"; US-041/042 "Aprovada p/ Dev, não iniciada").
6. SDD-018 §2.4 diz "Faturas ... sem pagar na lista": confere com o código (link "Ver fatura").
