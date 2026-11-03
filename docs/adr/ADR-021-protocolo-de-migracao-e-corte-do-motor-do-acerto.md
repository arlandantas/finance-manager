# ADR-021 — Protocolo de migração e corte do motor do acerto

**Status:** aceito (corrige e completa ADR-016 §5) · **Data:** 2026-10-05 · **Autor:** arquiteto

## Contexto
O ADR-016 distribuía as sobras do backfill por `⌊valor × bps ÷ 10000⌋` e afirmava `R_m ≥ 0`, o que é falso quando o vetor não é exato em bps (ex.: 3 membros `EQUAL`: 3334/3333/3333). Havia também risco de escrita concorrente durante a migração e "rollback" ambíguo. O acerto é a área de maior risco: nenhum centavo pode mudar.

## Decisão
1. **Backfill com pesos exatos:** por grupo `(período, versão da regra)`, `w_m` são os pesos do motor LEGACY (`legacyGroupWeights`), `Q = apportion(total_g, w)` a cota LEGACY. Cada despesa recebe `base = ⌊a_i × w_m ÷ W⌋`; as sobras vão um centavo por vez ao membro de maior `R_m = Q_m − Σ base` restante (desempate: menor ordinal). Garante `R_m ≥ 0`, `Σ_i amount_{i,m} = Q_m` e `Σ_m amount_{i,m} = a_i`. O `bps` gravado é a intenção (`apportion(10000, w)`) e não entra na alocação. Verificado por propriedade com milhares de casos (EQUAL com 3 e 4 membros).
2. **Trava de família:** `lockFamilySplit(tx, familyId)` = `SELECT "splitEngine" FROM families … FOR SHARE`, **primeira** trava de toda escrita que cria/altera/exclui/restaura despesa comum ou rateio, grava regra, registra/desfaz acerto, baixa previsão ou mexe em parcelas. O motor usado é o lido depois da trava. O script faz `FOR UPDATE` na mesma linha por família. Migração em `READ COMMITTED` (sem `REPEATABLE READ`).
3. **Só famílias `STORED` gravam rateio.** LEGACY grava apenas `isSharedExpense`; famílias novas nascem STORED. Idempotência = estado da família (`data_migrations.DONE`).
4. **Reversão em dois níveis:** (1) voltar `splitEngine` a LEGACY sem tocar nos dados (vale enquanto não houver `CUSTOM` nem parcela dividida); (2) `--rollback --purge`, só antes da migração de contrato e sem `CUSTOM`. **Migração de contrato** `us043_modo_custom` aplica `CHECK ("isSharedExpense" = ("splitMode" <> 'NONE'))` e libera `CUSTOM`; antes dela vale só `splitMode <> 'NONE' ⇒ isSharedExpense`. Janela de reversão: mínimo 7 dias, `--verify` limpo e um fechamento de mês conferido pelo Stakeholder.
5. **O gate compara** por período: status, totalShared, por membro `paid/quota/difference/adjustment/balance`, sugestões, rótulo e linha ponderada, com `today` fixo. Teste do teste: +1 centavo no backfill tem de falhar o gate e nada persistir.
6. **Despesas excluídas também recebem rateio** (alocação individual), para o restore não gerar lançamento inválido.

## Consequências
- Código: `legacyGroupWeights`, `allocateBackfill`, `lockFamilySplit`, `migrateFamily`, `scripts/migrate-split.ts`. O ADR-016 aponta para este.
- Descartados: ajustar `R_m` negativos, `REPEATABLE READ`, `CHECK` imediato na expansão, migração em SQL puro.
