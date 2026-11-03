# ADR-010 — Datas contábeis e período como função de `cutDay`

**Status:** aceito · **Data:** 2026-10 · **Autor:** arquiteto

## Contexto
Confirma a D-PO-03 (aprovada provisoriamente, D-GES-05): período não pode ser mês-calendário fixo, e um lançamento "de ontem" não pode mudar de dia por fuso.

## Decisão
1. **Data contábil = `DATE`** (`occurredOn`, `YYYY-MM-DD`) no fuso da família (`America/Sao_Paulo`, fixo no R1). Eventos de sistema (`createdAt`, `updatedAt`, `deletedAt`) são `timestamptz` UTC.
2. **"Hoje"** é calculado no servidor, no fuso da família, via `Clock` injetável; o servidor valida `occurredOn <= hoje`.
3. **Período é função:** `periodOf(date, cutDay = 1) → { key, start, end }`. `Family.cutDay` (1..28, padrão 1, `CHECK`) existe desde o R1, sem UI. Com `cutDay = d`, o período começa em `(ano, mês, d)` se `date.dia >= d`, senão no mês anterior; `end` = dia anterior ao próximo início; `key = "YYYY-MM"` do mês de início. Telas e rotas recebem `period=YYYY-MM`, nunca `from/to`.
4. Só `src/lib/period.ts` conhece a regra; extrato, Home e acerto a consomem.
5. **Dinheiro:** `amountInCents` inteiro seguro, `MAX_AMOUNT_IN_CENTS = 9_999_999_999`; banco `BIGINT`, convertido para `number` na borda do repositório com asserção de faixa.

## Consequências
- Expor `cutDay` na UI é só configuração. Testes de propriedade em `periodOf` com `cutDay` 1, 15 e 28, virada de ano e fevereiro.
