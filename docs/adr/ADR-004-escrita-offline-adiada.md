# ADR-004 — Escrita offline adiada (PWA somente leitura)

**Status:** adiado · **Data:** 2026-10 · **Autor:** gestor

## Contexto
O Gestor decidiu que escrita offline "pode vir no futuro".

## Decisão
- App é PWA instalável (Serwist), com shell e leituras recentes em cache.
- **Sem fila de escrita offline** no MVP/AP1. Sem conexão, a UI mostra estado de desconexão e bloqueia o envio com mensagem clara.

## Consequências
- Preparação sem custo: toda mutação já exige `Idempotency-Key` (reenvio seguro) e `version` trata conflitos tardios (ADR-009).
- Reabrir se houver evidência de uso frequente sem conectividade no lançamento rápido.
