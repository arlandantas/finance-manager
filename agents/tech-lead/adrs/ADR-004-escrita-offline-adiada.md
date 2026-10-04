# ADR-004: Escrita Offline Adiada (PWA somente leitura no MVP)

## Status
Adiado (decisão do Gestor: "pode vir no futuro")

## Decisão
- O app é **PWA instalável** (Serwist) com shell e leituras recentes em cache.
- **Sem fila de escrita offline** no MVP/AP1. Sem conexão, a UI exibe estado de desconexão e bloqueia o envio com mensagem clara.

## Preparação para o futuro (sem custo agora)
- Toda mutação já exige `Idempotency-Key` gerada no cliente, o que viabilizará reenvio seguro de uma fila offline.
- Controle otimista (`version`) já trata conflitos de sincronização tardia.

## Reabrir quando
Houver evidência de uso frequente sem conectividade durante o lançamento rápido.
