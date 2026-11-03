# ADR-003 — Jobs e agendamento com pg-boss

**Status:** aceito · **Data:** 2026-10 · **Autor:** arquiteto

## Contexto
Há trabalho assíncrono/periódico (materialização de recorrências, abertura de ciclo, futuras importações e notificações) e se quer evitar infraestrutura extra (Redis).

## Decisão
- **pg-boss** (fila e cron sobre o próprio PostgreSQL).
- Worker = mesmo código da aplicação, outro comando (`pnpm worker`).
- **Parcelamentos não dependem de job:** as N parcelas são geradas de forma síncrona na mesma transação da compra, agrupadas por `installmentGroupId`.
- Recorrências: originalmente janela móvel de 12 meses por job diário; **substituído pelo ADR-025** (geração preguiçosa, sem cron).
- Jobs são **idempotentes** (chave natural família+competência).

## Consequências
- Uma única dependência de infra (Postgres); throughput menor que broker dedicado, aceitável. Reavaliar se houver alto volume.
- Em serverless (ADR-031) o cron deve ser externo.
