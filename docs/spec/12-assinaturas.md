# Spec 12 — Assinaturas no cartão

Atualizado: 2026-11-07. Estado: **US-096, 096b e 096c implementadas (servidor e telas do cartão, fatura e Extrato)**; 096d, 097, 098, 099 não iniciadas. Decisão: ADR-036. Cartões e faturas: spec 02. Propriedade: spec 01.

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

## Visibilidade e controle (spec 01)
- Lista, bloco do cartão, "previstas neste ciclo" e selo no Extrato são visíveis a todos os membros da família, como o Extrato ("Todos veem"); só a exportação omite "Só meu" alheio.
- Altera quem pagou, o dono do cartão e quem lançou; ninguém cadastra em nome de outro (a UI desabilita os outros membros em "Quem gastou"; servidor 403 `PERSONAL_ON_BEHALF_FORBIDDEN`; exceção: Admin para dono sem conta).

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
- `ensureSubscriptionCharges(tx, ctx)`: atalho sem trava; senão `lockFamilySplit` → advisory → relê; ordem de id, até 12 por chamada; mês já em `subscription_charges` só avança `nextChargeOn`. `...Standalone`: uma transação por assinatura vencida; falha é logada sem PII e não quebra a leitura. 
- Cobrança = `createExpenseCore` com `subscription` (origem `SUBSCRIPTION`, autor da assinatura, revisão CREATE com esse autor, categoria arquivada aceita, sem checar ator × pagador). Cartão arquivado/excluído: `SKIPPED_CARD_ARCHIVED`; fatura do ciclo com pagamento ativo: `SKIPPED_INVOICE_PAID`.
- Cadastro: ordem `lockFamilySplit` → advisory → cartão ativo `FOR SHARE`; categoria inativa/outra família `INVALID_REFERENCE`, de receita `CATEGORY_KIND_MISMATCH`; pagador pela `assertPersonalForSelf` (403 como na compra). `currentAmountInCents` antes da 1ª cobrança = valor da 1ª vigência.
- Testes: `tests/unit/assinaturas/schedule.test.ts`, `tests/integration/us-096-assinatura-lancamento.int.test.ts`, `lock-coverage` cobre `createSubscription` e `ensureSubscriptionCharges`.

## Implementação (US-096b)
- Gancho: `ensureRecurrenceHorizonStandalone` chama `ensureSubscriptionChargesStandalone` (Início, A pagar, Previstas, Resumo, MCP); `prepare` em `GET /cards`, `GET /cards/{id}/invoices/{ref}` e `GET /transactions`. Falha logada, leitura 200.
- `cardArchiveBlockers`: uma entrada `CARD_HAS_ACTIVE_SUBSCRIPTIONS` com a contagem na mensagem, dentro do lock `FOR UPDATE` do cartão.
- Remoção (`familia/removal-subscriptions.ts`): assinaturas ativas do pagador removido vão a `plannedTo` (`updateMany` por pagador, `version + 1`; sem `updatedByMemberId` na tabela); cartão com assinatura ativa exige reatribuir, reconferido após o `FOR UPDATE` do arquivamento; `removalReview.subscriptions` lista as assinaturas.
- Exportação: `familiaAtual.assinaturas[]` (ids, sem nomes de terceiros). "Só meu" de outra pessoa (não dividida, pagador não sou eu) não sai, como previstas e recorrentes.
- Teste: `tests/integration/us-096b-assinatura-integracao.int.test.ts`.

## Implementação (US-096c)
- Hooks `assinaturas/hooks.ts` (`useSubscriptions`, `useCreateSubscription`; invalida subscriptions, cards, card, invoice, transactions, home).
- Tela do cartão: `subscriptions-block.tsx` (bloco "Assinaturas do cartão", aviso de `recentSkips`, estados skeleton/vazio/erro) e `subscription-drawer.tsx` ("Nova assinatura", nasce "Só meu", frase "Primeira cobrança em {data}, na fatura de {mês}" via `firstChargeOn` + `invoiceRefFor`, offline bloqueia salvar).
- Fatura ABERTA: "Assinaturas previstas neste ciclo" = `projectedInCycle(subs, ref, closingDay)` (Σ valor das ativas cuja `nextChargeOn` cai no ciclo); só informativa, some quando a cobrança é lançada (invariante 1).
- Extrato: `TransactionDTO.isSubscription` (`transacoes/origin.ts`) e selo "Assinatura" na linha, sem "parcela x/y".
- Testes: `tests/unit/assinaturas/schedule.test.ts`, E2E `US-096-assinatura-no-cartao.feature`.

## Perguntas ao usuário
- Nenhuma bloqueante. Hipóteses assumidas (reversíveis, ADR-036): primeira cobrança não retroativa; encerrar não lança cobrança futura do mês corrente.

## Fontes
Código (US-096): `src/modules/assinaturas/{schemas,schedule,repo,service,charges}.ts`, `createExpenseCore(opts.subscription)`, rota `POST|GET /api/v1/subscriptions` (GET lança o vencido antes de ler). Telas (US-096c): `src/app/(app)/cartoes/[id]/{subscription-drawer,subscriptions-block}.tsx`. Planejado: `manage,list`, demais rotas, `src/app/(app)/assinaturas/`.
