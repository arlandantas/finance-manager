# ADR-025: Despesa recorrente mensal como série com ocorrências materializadas

## Status
Aceito (Tech Lead), 2026-10-05. Detalhado no [SDD-019](../sdd/SDD-019-recorrencia-conta-de-pagamento-e-polimento-v0.md) §3. Estende o [ADR-015](ADR-015-despesa-prevista-como-entidade-propria.md).

## Contexto
US-058 pede uma despesa fixa mensal que gera previstas por 12 meses, renova sem duplicar, permite editar a série sem tocar no passado, editar uma ocorrência isolada e encerrar a série. A prevista já tem baixa/desfazer (US-019) que cria a despesa real e entra no acerto pelo fluxo existente.

## Opções
1. **Série + ocorrências materializadas em `planned_expenses`** (`seriesId`, `occurrenceMonth`). Tudo que já lê previstas (A pagar, Resumo, Início, baixa, desfazer, ocultar valores) funciona sem mudança.
2. **Gerar sob demanda (virtual)**, materializando só ao editar/baixar. Menos linhas, mas toda consulta de previstas precisaria mesclar virtuais + reais, exceções e exclusões "lápide": alto risco de divergência no total do "A pagar" (US-055).

## Decisão
Opção 1.
- Tabela `recurring_expenses` (série) e, em `planned_expenses`, `seriesId` + `occurrenceMonth` (DATE, dia 1) + `isException`.
- **Chave única** `(familyId, seriesId, occurrenceMonth)` **sem filtro de exclusão**: uma ocorrência excluída ou baixada nunca é recriada.
- **Geração idempotente e preguiçosa (sem cron)**: `ensureRecurrenceHorizon(familyId)` roda numa transação curta de escrita **antes** das leituras de Início, A pagar, Previstas e Resumo, e na criação/edição da série. Atalho barato: só faz algo se existir série ativa com `generatedThroughMonth < mês corrente + 11`. Insere com `createMany({ skipDuplicates: true })` (ON CONFLICT DO NOTHING) sob `pg_advisory_xact_lock` por família; duas abas ou dois membros simultâneos não duplicam (a unicidade é a garantia; a trava só evita trabalho repetido).
- **Datas civis** (`DATE`) no fuso da família (`todayInFamilyTz`, `APP_TIMEZONE`); dia 29–31 vence no último dia do mês.
- O acerto não muda: a ocorrência copia `isSharedExpense` da série e só entra no acerto quando a baixa cria a `Transaction` (fluxo US-019 intacto, inclusive `lockFamilySplit`).

## Consequências
- (+) Zero mudança nas consultas de previstas e no motor do acerto; testes de reconciliação continuam válidos.
- (+) Sem infraestrutura de job; família inativa simplesmente não gera até alguém abrir o app (efeito aceitável: o horizonte é recalculado no próximo acesso).
- (−) Até 12 linhas por série ativa (desprezível no alpha).
- (−) Uma escrita curta no caminho de leitura; mitigada pelo atalho (consulta indexada `recurring_expenses(familyId, endedAt, generatedThroughMonth)`).
- Revisão: se surgirem outras periodicidades, a série ganha `frequency`; o modelo se mantém.
