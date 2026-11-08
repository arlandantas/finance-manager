# ADR-041 — Motor STORED por padrão e virada das famílias LEGACY

**Status:** aceito · **Data:** 2026-11-08 · **Autor:** usuário (pedido) e gestor (desenho)

## Contexto
Famílias novas já nascem STORED (app), mas o default da coluna `families.splitEngine` e o seed ainda eram LEGACY, e "De outro jeito" (CUSTOM) só existe em STORED. Em produção há uma família com um único usuário. O ADR-021 descartou migração em SQL puro do backfill (gate de 1 centavo).

## Decisão
- Migração SQL expand: default da coluna passa a `STORED`; viram STORED, e recebem a marca `data_migrations.DONE`, só as famílias LEGACY **sem nenhum rateio a preencher** (nenhuma transação ou previsão com `isSharedExpense = true`, ativas ou excluídas): não há dado a recalcular.
- Família LEGACY com despesa comum continua LEGACY até rodar `pnpm migrate:split` (`--dry-run` antes), que preenche o rateio com o gate de 1 centavo. O deploy não roda o script.
- Seed da demo passa a nascer STORED. O CHECK `isSharedExpense = (splitMode <> 'NONE')` continua adiado até `migrate:split` rodar em produção e `--verify` ficar limpo.

## Consequências
- O motor LEGACY e `--rollback` permanecem no código até o CHECK entrar; removê-los é outra história.
- Reverter a virada de uma família sem dados: `--engine LEGACY --family <id>` (vale enquanto não houver CUSTOM ou parcela dividida).
