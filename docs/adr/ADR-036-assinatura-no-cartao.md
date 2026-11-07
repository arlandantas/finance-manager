# ADR-036 — Assinatura mensal no cartão: tabela própria, lançamento preguiçoso e valor por vigência

**Status:** aceito · **Data:** 2026-11-07 · **Autor:** arquiteto

## Contexto
Assinatura (Netflix, Spotify) é uma compra real no cartão a cada mês, sem o usuário lançar (US-096..099). A série de previstas (ADR-025) materializa `planned_expenses` 12 meses à frente, mas compra no cartão não admite data futura nem fica "prevista" fora do ledger com total de fatura. Misturar as duas na mesma tabela obrigaria todos os leitores de séries a filtrar o cartão.

## Decisão
1. **Tabela própria `card_subscriptions`** (não reusa `recurring_expenses`): `cardId`, `description`, `categoryId`, `payerMemberId`, `isSharedExpense` (US-099), `dayOfMonth` 1..31, `firstChargeOn` (DATE, primeira cobrança >= dia do cadastro), `endMonth` (fim após N), `nextChargeOn` (atalho; nulo quando não há próxima), `endedAt/endedOn/endedByMemberId`, `authorMemberId`, `version`. Reaproveita as funções puras de data de `previstas/recurrence.ts` (dia 29..31 = último dia).
2. **Valor por vigência:** `card_subscription_amounts` append-only (`fromMonth`, `amountInCents > 0`); valor do mês M = maior `fromMonth <= M`, empate = `createdAt` mais recente (mesmo padrão da regra de divisão, ADR-011). Reajuste nunca reescreve cobrança lançada.
3. **Registro de cobrança `subscription_charges`** com chave única `(familyId, subscriptionId, chargeMonth)` sem filtro: `status` `POSTED | SKIPPED_INVOICE_PAID | SKIPPED_CARD_ARCHIVED`, `transactionId` (único, FK composta), `isAmended`. Garante "nunca duplica nem ressuscita", inclusive cobrança excluída no Extrato.
4. **Lançamento preguiçoso, sem cron:** `ensureSubscriptionCharges` roda em transação curta antes das leituras (mesmo gancho de `ensureRecurrenceHorizonStandalone`). Atalho: só age se existe assinatura ativa com `nextChargeOn <= hoje`. Travas: `lockFamilySplit` primeiro, depois advisory `subscriptions:{familyId}`, depois o caminho normal do cartão (`createExpenseCore`: cartão `FOR SHARE`, fatura `FOR UPDATE`). No máx. 12 cobranças por chamada (o restante na próxima leitura).
5. **A cobrança é uma compra à vista comum** (`createExpenseCore` com opção `subscription`): `occurredOn` = dia da cobrança, fatura pelo ciclo do cartão, `origin = SUBSCRIPTION` (novo valor de `TransactionOrigin`, migração de enum separada), autor = `authorMemberId` da assinatura, pagador = `payerMemberId`. As travas de propriedade (spec 01) rodam no cadastro/edição da assinatura, não no lançamento automático. Fatura já paga => `SKIPPED_INVOICE_PAID`, sem erro.
6. **Encerrar** vale a partir de hoje: nenhuma cobrança com data > `endedOn`; reativar = cadastrar nova.

## Consequências
- Zero mudança nas consultas de previstas, "A pagar" e acerto: só existem compras reais; "Assinaturas previstas neste ciclo" é cálculo informativo, nunca somado ao total.
- Uma escrita curta no caminho de leitura (mitigada pelo atalho e índice `(familyId, endedAt, nextChargeOn)`). Família sem acesso por meses recebe as cobranças atrasadas na próxima abertura, cada uma na fatura do seu ciclo.
- Descartados: `cardId` em `recurring_expenses`; ocorrência prevista materializada; job diário.
