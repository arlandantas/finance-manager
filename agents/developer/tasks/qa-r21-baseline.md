# QA — Linha de base da R2.1 (D-GES-19)

*Executada em 2026-10-04 (Agente Desenvolvedor & QA), antes de qualquer alteração de código da R2.1. Commit de referência: `0e273de`.*

| Verificação | Comando | Resultado |
| :-- | :-- | :-- |
| Lint | `pnpm lint` | OK (311 arquivos) |
| Tipos | `pnpm typecheck` | OK |
| Unidade + `check:imports` | `pnpm test` | **242/242** (27 arquivos) |
| Integração (db-test 5443) | `pnpm test:int` | **384/384** (24 arquivos, 44 s) |
| E2E desktop (Chrome) | `pnpm exec playwright test --project=desktop` | **239/239** (6,9 min) |
| E2E mobile (Pixel 7) | `pnpm exec playwright test --project=mobile` | **239/239** (6,5 min) |

Sem falhas pré-existentes. O E2E sobe o app em 3101 (`.next-e2e`) contra o `db-test`; o `pnpm dev` da 3100 não foi tocado.
Números homologados do acerto cobertos pelos testes de R1 (out: 3.169,90 / cota 1.584,95; set: 717,00 / 358,50).
