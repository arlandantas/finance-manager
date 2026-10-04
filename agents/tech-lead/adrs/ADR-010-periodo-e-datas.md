# ADR-010: Datas contábeis e período como função de `cutDay` (confirma D-PO-03)

## Status
Aceito (Tech Lead). **Confirma a D-PO-03** (aprovada provisoriamente pelo Gestor, D-GES-05). Corrige a sugestão de data do SDD-001 original.

## Decisão
1. **Data contábil = `DATE`** (`occurredOn`, formato `YYYY-MM-DD`), interpretada no fuso da família (`America/Sao_Paulo`, fixo no R1). **Não** é `timestamptz`: um lançamento "de ontem" não pode mudar de dia por fuso. Eventos de sistema (`createdAt`, `updatedAt`, `deletedAt`) são `timestamptz` UTC.
2. **"Hoje"** é sempre calculado **no servidor**, no fuso da família, a partir do `Clock` injetável (SDD-000 §8). O cliente envia a data escolhida; o servidor valida `occurredOn <= hoje`.
3. **Período é função, nunca mês-calendário fixo no código:** `periodOf(date, cutDay = 1) → { key, start, end }`. `Family.cutDay` (inteiro 1..28, padrão 1, `CHECK`) existe no modelo desde o R1, **sem UI**. Com `cutDay = d`: o período que contém `date` começa em `(ano, mês, d)` se `date.dia >= d`, senão no mês anterior; `end` = dia anterior ao início do período seguinte; `key = "YYYY-MM"` do **mês de início**. Com `cutDay = 1` equivale ao mês-calendário. Toda tela/rota recebe `period=YYYY-MM` (a chave), nunca `from/to` hardcoded.
4. Apenas as funções de `src/lib/period.ts` conhecem a regra; extrato, Home e acerto as consomem. O AP1 (NEED-005) só expõe `cutDay` na UI e nenhum outro código muda.
5. **Dinheiro:** `amountInCents` inteiro seguro (`Number.isSafeInteger`), limite `MAX_AMOUNT_IN_CENTS = 9_999_999_999` (R$ 99.999.999,99); banco `BIGINT`, convertido para `number` na borda do repositório (asserção de faixa).

## Consequências
- A mudança do AP1 é de configuração. Testes de propriedade em `periodOf` com `cutDay` 1, 15 e 28, virada de ano e fevereiro.
