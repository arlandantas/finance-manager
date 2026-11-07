# Spec 12 — Assinaturas no cartão

Atualizado: 2026-11-07. Estado: **US-096 implementada (servidor: modelo, cadastro, lançamento)**; 096b, 096c, 096d, 097, 098, 099 não iniciadas. Decisão: ADR-036. Cartões e faturas: spec 02. Propriedade: spec 01.

## Resumo
- Assinatura = compra mensal fixa num cartão (Netflix, Spotify) que o app lança sozinho no dia da cobrança, como compra à vista normal na fatura do ciclo.
- Antes do dia nada existe no ledger; a fatura aberta só mostra, à parte, "Assinaturas previstas neste ciclo" (nunca somado ao total).
- Reajuste vale a partir de um mês ainda não cobrado; corrigir uma cobrança é editar a compra no Extrato ("alterada"); encerrar vale a partir de hoje.
- Nasce "Só meu"; dividida (US-099) entra no acerto de cada mês pelo rateio gravado na cobrança.

## Regras
| # | Regra | História |
| :-- | :-- | :-- |
| 1 | Campos: cartão ativo da família, descrição 2..100, valor 1..9.999.999.999 centavos, categoria de DESPESA ativa, pagador (padrão quem cria), dia 1..31 (29..31 = último dia em meses curtos), início entre o mês atual e +11, fim "sem fim" ou após 1..120 cobranças | 096 |
| 2 | Primeira cobrança = primeiro dia de cobrança >= dia do cadastro a partir do mês de início (nunca retroativa) | 096 |
| 3 | Lançamento preguiçoso ao abrir Início, A pagar, Previstas, Resumo, Cartões, Fatura, Extrato e MCP: cada mês vencido (dia <= hoje) vira `Transaction` EXPENSE no cartão, `origin = SUBSCRIPTION`, `occurredOn` = dia da cobrança, fatura por `invoiceRefFor`; até 12 por chamada; atrasadas entram cada uma na sua fatura | 096, 096b |
| 4 | Registro único por (família, assinatura, mês) em `subscription_charges`: nunca duplica (inclusive `Promise.all`) nem recria cobrança excluída no Extrato | 096 |
| 5 | Fatura do ciclo já paga: cobrança pulada (`SKIPPED_INVOICE_PAID`) com aviso "Cobrança de {mês} não lançada: fatura paga"; cartão arquivado: `SKIPPED_CARD_ARCHIVED` | 096, 096c |
| 6 | Limite e total da fatura contam só cobranças lançadas; limite estourado não bloqueia; sem "parcela x/y" | 096 |
| 7 | Arquivar cartão com assinatura ativa: impedimento `CARD_HAS_ACTIVE_SUBSCRIPTIONS` (archive-check e 422) | 096b |
| 8 | Remoção de membro: assinaturas em que ele é pagador vão a `plannedTo`; cartão dele com assinatura ativa exige reatribuir (`CARD_NEEDS_OWNER`) | 096b |
| 9 | Valor por vigência (`card_subscription_amounts`): mês M usa o maior `fromMonth <= M`; reajuste com `fromMonth` já cobrado => 422 `EFFECTIVE_FROM_ALREADY_CHARGED`; cobranças lançadas nunca são reescritas | 097 |
| 10 | Corrigir a cobrança do mês = `PATCH /transactions/:id`; marca `isAmended`; fatura paga => `INVOICE_PAID_LOCKED` | 097 |
| 11 | Encerrar: lança antes o que vence até hoje; depois nada com data > `endedOn`; encerrada não edita nem encerra (409 `SUBSCRIPTION_ENDED`); reativar = cadastrar nova. Dia e cartão não mudam | 097 |
| 12 | Controle: "Só meu" segue a compra no cartão (titular/pagador, spec 01), checado no cadastro e na edição; o lançamento automático não confere o ator de novo. Dividida: qualquer membro edita | 096, 097 |
| 13 | Lista: total mensal = Σ valor do mês corrente das ativas no filtro; `byCard`; abas Ativas/Encerradas; informativo | 098 |
| 14 | Dividida: exige acerto ligado (`SETTLEMENT_DISABLED`); rateio pela regra vigente no dia da cobrança; acerto desligado no lançamento => cobrança "Só meu" com `sharedDowngraded`; crédito ao pagador, não a quem paga a fatura; alternar vale da próxima cobrança | 099 |

## Invariantes
1. Assinatura nunca soma duas vezes: ou está em "previstas neste ciclo" (não lançada) ou no total da fatura (lançada).
2. `subscription_charges.status = POSTED` ⇔ `transactionId` não nulo; um registro por mês.
3. `lockFamilySplit` é a primeira trava do cadastro, da edição e do lançamento; depois advisory `subscriptions:{familyId}`, depois cartão/fatura.
4. `familyId` em toda consulta; cartão, categoria ou membro de outra família => 404/422.

## Riscos aceitos
- Sem cron: família que não abre o app recebe as cobranças atrasadas na próxima abertura (cada uma na fatura do seu ciclo, possivelmente já fechada e não paga).
- Assinatura encerrada no mesmo dia da cobrança mantém a cobrança do dia.

## Implementação (US-096)
- Migrações `20261107000000_us096_enum_origin_subscription` (enum sozinha) e `20261107000100_us096_card_subscriptions` (tabelas, CHECKs, únicos, FKs compostas; reversão no topo do SQL).
- `ensureSubscriptionCharges(tx, ctx)`: atalho sem trava; senão `lockFamilySplit` → advisory → relê; ordem de id, até 12 por chamada; mês já em `subscription_charges` só avança `nextChargeOn`. `...Standalone`: uma transação por assinatura vencida; falha é logada sem PII e não quebra a leitura. Ganchos nas demais leituras: US-096b.
- Cobrança = `createExpenseCore` com `subscription` (origem `SUBSCRIPTION`, autor da assinatura, revisão CREATE com esse autor, categoria arquivada aceita, sem checar ator × pagador). Cartão arquivado/excluído: `SKIPPED_CARD_ARCHIVED`; fatura do ciclo com pagamento ativo: `SKIPPED_INVOICE_PAID`.
- Cadastro: ordem `lockFamilySplit` → advisory → cartão ativo `FOR SHARE`; categoria inativa/outra família `INVALID_REFERENCE`, de receita `CATEGORY_KIND_MISMATCH`; pagador pela `assertPersonalForSelf` (403 como na compra). `currentAmountInCents` antes da 1ª cobrança = valor da 1ª vigência.
- Testes: `tests/unit/assinaturas/schedule.test.ts`, `tests/integration/us-096-assinatura-lancamento.int.test.ts`, `lock-coverage` cobre `createSubscription` e `ensureSubscriptionCharges`.

## Perguntas ao usuário
- Nenhuma bloqueante. Hipóteses assumidas (reversíveis, ADR-036): primeira cobrança não retroativa; encerrar não lança cobrança futura do mês corrente.

## Fontes
Código (US-096): `src/modules/assinaturas/{schemas,schedule,repo,service,charges}.ts`, `createExpenseCore(opts.subscription)`, rota `POST|GET /api/v1/subscriptions` (GET lança o vencido antes de ler). Planejado: `manage,list,hooks`, demais rotas, telas `src/app/(app)/cartoes/[id]/subscription-drawer.tsx`, `src/app/(app)/assinaturas/`.
