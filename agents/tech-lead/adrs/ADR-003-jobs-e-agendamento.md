# ADR-003: Jobs e Agendamento com pg-boss

## Status
Aceito

## Contexto
Há trabalho assíncrono/periódico previsto: materialização de despesas recorrentes (NEED-004), abertura de ciclo com clonagem de tetos (NEED-005) e, no AP3, importação OFX/CSV e notificações WhatsApp/Telegram. Queremos evitar infraestrutura extra (Redis) para o volume esperado.

## Decisão
- **pg-boss** (fila e cron sobre o próprio PostgreSQL).
- **Worker** = mesmo código da aplicação, iniciado por outro comando (`pnpm worker`).
- **Parcelamentos** (NEED-003) **não** dependem de job: as N parcelas são geradas de forma síncrona, na mesma transação da compra, agrupadas por `installmentGroupId`.
- **Recorrências:** janela móvel de 12 meses materializada por job diário; alterar um mês não altera os futuros (RN-004.4).
- Jobs devem ser **idempotentes** (chave natural por família+competência).

## Consequências
- Uma única dependência de infra (Postgres).
- Limite de throughput menor que um broker dedicado, aceitável para o escopo. Reavaliar se o AP3 exigir alto volume.
