# ADR-025 — Despesa recorrente mensal como série com ocorrências materializadas

**Status:** aceito (estende ADR-015; substitui o job diário do ADR-003) · **Data:** 2026-10-05 · **Autor:** arquiteto

## Contexto
Despesa fixa mensal gera previstas por 12 meses, renova sem duplicar, permite editar a série sem tocar no passado, editar uma ocorrência isolada e encerrar a série. A prevista já tem baixa/desfazer e entra no acerto pelo fluxo existente.

## Decisão
Série + ocorrências **materializadas** em `planned_expenses` (alternativa virtual descartada: risco de divergência no total de "A pagar").
- Tabela `recurring_expenses` (série); em `planned_expenses`: `seriesId`, `occurrenceMonth` (DATE, dia 1), `isException`.
- **Chave única** `(familyId, seriesId, occurrenceMonth)` **sem filtro de exclusão**: ocorrência excluída ou baixada nunca é recriada.
- **Geração idempotente e preguiçosa, sem cron:** `ensureRecurrenceHorizon(familyId)` roda em transação curta antes das leituras de Início, A pagar, Previstas e Resumo, e na criação/edição da série. Atalho: só age se há série ativa com `generatedThroughMonth < mês corrente + 11`. Insere com `createMany({ skipDuplicates: true })` sob `pg_advisory_xact_lock` por família.
- Datas civis (`DATE`) no fuso da família; dia 29–31 vence no último dia do mês.
- O acerto não muda: a ocorrência copia `isSharedExpense` da série e só entra no acerto quando a baixa cria a `Transaction` (inclusive `lockFamilySplit`).

## Consequências
- Zero mudança nas consultas de previstas e no motor do acerto; sem infraestrutura de job (família inativa só gera ao abrir o app).
- Até 12 linhas por série ativa; uma escrita curta no caminho de leitura, mitigada pelo atalho e por índice `recurring_expenses(familyId, endedAt, generatedThroughMonth)`.
- Outras periodicidades exigirão `frequency` na série.
