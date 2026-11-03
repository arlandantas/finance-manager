# ADR-009 — Idempotência de mutações e controle otimista

**Status:** aceito · **Data:** 2026-10 · **Autor:** arquiteto

## Contexto
Cliques duplos, reenvios de rede e edição concorrente entre cônjuges não podem duplicar nem sobrescrever lançamentos.

## Decisão
**Idempotência**
- Toda mutação (`POST/PATCH/PUT`) exige `Idempotency-Key` (UUID v4 gerado no cliente por intenção, mantido no reenvio, regerado após sucesso). Ausente/inválido → `400 IDEMPOTENCY_KEY_REQUIRED`.
- Tabela `IdempotencyRecord`, `UNIQUE (userId, key)`; guarda `method`, `path`, `requestHash` (SHA-256 do corpo canônico), status e corpo.
- Na mesma transação da mutação: `INSERT … ON CONFLICT DO NOTHING`; se inseriu, executa e grava a resposta; se não, mesmo hash → reenvia a resposta com `Idempotent-Replay: true`; hash diferente → `422 IDEMPOTENCY_KEY_REUSED`.
- Guardam-se só `2xx` e 4xx determinísticos (exceto 401/403/409/429); 5xx e `409 VERSION_CONFLICT` não. Retenção 24 h, limpeza oportunista ou por job.

**Controle otimista**
- `Transaction`, `TransferGroup`, `BankAccount` têm `version Int` (inicia em 1). A edição envia `version`; `UPDATE … WHERE id AND familyId AND version = :v`; 0 linhas com registro existente → `409 VERSION_CONFLICT` com `details.currentVersion` e `details.updatedBy`. Sucesso incrementa `version`.

## Consequências
- Compatível com futura fila offline (ADR-004); custo de uma escrita extra por mutação.
