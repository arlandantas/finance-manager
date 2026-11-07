# ADR-040 — Janela de reversão do rateio (EN-002) dispensada; ordem do R3

**Status:** aceito · **Data:** 2026-11-07 · **Autor:** usuário

## Contexto
US-042/043/044 estavam bloqueadas até fechar a janela de reversão da migração EN-002 (≥7 dias em produção, ADR-021). Não há deploy em produção nem dados reais: não existe o que reverter.

## Decisão
- Janela dispensada. US-043, US-041, US-042 e US-044 podem ser desenvolvidas já.
- Ordem: US-043 → US-041 → US-042 → US-044.
- US-041 vem antes da US-042: a edição de parcela ainda não recalcula rateio (parcelado segue "Só meu"); a US-042 passa a cobrir o rateio por parcela e fecha o teste `@depends-US-041`.
- `INSTALLMENT_SPLIT_RELEASED` continua `false` até a US-042 entregar; quem liga é a US-042.

## Consequências
- Rollback nível 2 (`migrate:split --rollback --purge`) deixa de valer depois da US-043 (CUSTOM) e da US-042.
- Migração `us043_modo_custom` (CHECK `isSharedExpense=(splitMode<>NONE)`, `splitMode` em previstas) entra com a US-043, no padrão expand.
- Riscos L-1 (spec 03) e L6 (spec 05) se encerram com a US-042.
