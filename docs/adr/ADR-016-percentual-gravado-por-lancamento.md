# ADR-016 — Percentual de divisão gravado por lançamento (rateio por membro)

**Status:** aceito (emenda ADR-011; errata em ADR-021) · **Data:** 2026-10-04 · **Autor:** arquiteto

## Contexto
O acerto usava a regra vigente na data, com maior resto **por grupo de regra**. O produto quer o percentual definido e gravado no lançamento ("Só meu / Pela regra / De outro jeito"), N > 2 membros e ex-membros. Arredondar por lançamento difere em centavos do arredondamento por grupo, então é preciso gravar o **resultado** em centavos, sem mudar nenhum número já homologado.

## Decisão
1. **Modelo:** `Transaction.splitMode` (`NONE | RULE | CUSTOM`, padrão `NONE`), `splitRuleVersionId` (informativo) e `TransactionSplit(transactionId, familyId, memberId, bps, amountInCents)` com PK `(transactionId, memberId)`. `NONE` ⇔ sem linhas ("Só meu"). `isSharedExpense` permanece e acompanha `splitMode <> 'NONE'`.
2. Invariantes por constraint trigger deferrable: `Σ bps = 10000` e `Σ amountInCents = Transaction.amountInCents`; só `kind = EXPENSE`. `bps` é a intenção; `amountInCents` é o valor exato da cota (pode diferir ±1 centavo). FKs compostas; `Member` não é apagado, então ex-membros mantêm o rateio.
3. **Arredondamento (lançamentos novos):** `base_m = ⌊amount × bps_m ÷ 10000⌋`; a sobra (0..N−1 centavos) vai ao **pagador, se participa com bps > 0**; senão ao participante de maior resto (desempate: ordem canônica, ADR-011).
4. `SplitRuleVersion` continua append-only, mas só **sugere** o percentual no formulário e indica `stale`; deixa de calcular cotas após o corte. Mudar a regra nunca reescreve lançamentos.
5. **Dois motores** selecionados por `Family.splitEngine` (`LEGACY` | `STORED`): LEGACY congelado e intacto (oráculo); STORED soma `TransactionSplit.amountInCents` por membro. O corte é reversível por uma coluna.
6. **Migração** (script TS, etapa do deploy; protocolo completo e errata no ADR-021): expandir, fotografar o resultado LEGACY por família/período, preencher rateios reproduzindo exatamente as cotas LEGACY, comparar com o snapshot (qualquer divergência de 1 centavo ⇒ rollback da família e deploy falha), virar a chave. Idempotente, atômica por família, reversível.
7. Rótulo ponderado (`explainPeriodSplit`) tem duas implementações que devem dar o mesmo número.
8. Editar o valor de lançamento `RULE/CUSTOM` recalcula centavos com os mesmos `bps`; editar a data não troca o percentual; mês acertado segue a confirmação de edição em período acertado; concorrência por `version`.

## Consequências
- Números homologados preservados (ex.: out/2026 total comum R$ 3.169,90, cota R$ 1.584,95).
- Regressão com ≥ 200 famílias aleatórias e dados homologados como casos nomeados. `isSharedExpense` fica redundante (remoção futura).
- Parcelas herdam o rateio da compra (ADR-017); `splitMode` e tabela de rateio entram só em famílias STORED.
