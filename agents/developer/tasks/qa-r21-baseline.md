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

## Após o lote 1 (US-027, 022, 023, 024, 025, 026) — 2026-10-05

| Verificação | Resultado |
| :-- | :-- |
| `pnpm lint` / `typecheck` / `check:imports` | OK |
| `pnpm test` (unidade) | 286/286 |
| `pnpm test:int` | 414/414 (inclui reconciliação de 200 conjuntos, semente fixa) |
| E2E desktop | 291/291 (2 cenários do Cartão estouraram o timeout de 30 s na compilação a frio do Next e passaram na repetição isolada) |
| E2E mobile (Pixel 7) | 291/291 |

Números homologados mantidos (testes de regressão do acerto verdes: out 3.169,90 / 1.584,95; set 717,00 / 358,50). Nenhuma migração de banco neste lote.

## Após o lote 3 (US-033..039) — 2026-10-05

| Verificação | Resultado |
| :-- | :-- |
| `pnpm lint` / `typecheck` / `check:imports` | OK |
| `pnpm test` (unidade) | 323/323 |
| `pnpm test:int` | 485/485 |
| E2E desktop | 373/373 (6 falhas da primeira execução: 5 por rótulo dos filtros nos passos legados e 1 medição de layout em passo da US-039; corrigidos nos passos, repetição verde) |
| E2E mobile (Pixel 7) | 373/373 (1 timeout de compilação a frio em US-016a, verde na repetição) |

Verificação visual no navegador embutido (1280 e 375 px, claro/escuro): Contas/arquivar, Família/remover membro, lançar despesa, Home, menu desktop; console sem erros (só o WebSocket de HMR da instância temporária). Números homologados mantidos. Migrações novas: `20261005120000_r21_ex_membro`, `20261005130000_r21_convites_reenvio` (dev: `db:deploy` aplicado).
