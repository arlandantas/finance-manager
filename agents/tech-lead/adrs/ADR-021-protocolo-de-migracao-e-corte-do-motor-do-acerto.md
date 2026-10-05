# ADR-021: Protocolo de migração e corte do motor do acerto (pesos exatos, trava de família, reversão e migração de contrato)

## Status
Aceito (Tech Lead, 2026-10-05). **Corrige e completa o [ADR-016](ADR-016-percentual-gravado-por-lancamento.md) §5** (a decisão de fundo — gravar o rateio em centavos por membro, motor `LEGACY` congelado, *snapshot*, *gate* de 1 centavo, virada por coluna — **permanece**). Implementado no [SDD-015](../sdd/SDD-015-percentual-por-lancamento-e-migracao-esboco.md). Responde a TL-10 e TL-11.

## Contexto
Ao transformar o esboço da EN-002 em contrato executável surgiram quatro problemas que o ADR-016 não cobria ou resolvia de forma errada. O acerto é a área de maior risco do produto: nenhum centavo pode mudar.

1. **Erro de prova no ADR-016 §5.3.** O ADR distribuía a sobra do grupo usando `base = ⌊valor × bps ÷ 10000⌋` e afirmava que `R_m = Q_m − Σ base ≥ 0` "sempre". É falso quando o vetor do grupo não é exato em *basis points*. Exemplo: 3 membros `EQUAL` (pesos 1/1/1) ⇒ `bps = 3334/3333/3333`; com total 316990, o piso por `bps` do 1º membro soma até 105 684 centavos, enquanto a cota do `LEGACY` é 105 663 ou 105 664 ⇒ `R_m < 0` e o problema de transporte fica inviável. Para 50/50, 60/40 e 58/42 (exatos) o erro não aparece, o que explica por que passou despercebido.
2. **Escrita concorrente durante a migração.** O ADR dizia "atômica por família", mas uma despesa criada por outro pedido entre o *snapshot* e a virada poderia ficar sem rateio (ou o *gate* falharia de forma intermitente).
3. **"Rollback" ambíguo.** O ADR prometia `--rollback` que "apaga rateios de origem `BACKFILL`" **e** o `CHECK (isSharedExpense = (splitMode <> 'NONE'))` imediato; os dois não convivem (a reversão deixaria linhas inconsistentes com o `CHECK`).
4. **"Gravar também em famílias `LEGACY`"** (esboço do SDD-015) cria linhas de rateio **provisórias** (com a regra de centavos por lançamento) que **não** coincidem com o acerto `LEGACY` e teriam de ser reescritas pelo *backfill* de qualquer jeito.

## Decisão

### 1. Alocação do *backfill* com **pesos exatos**
Para cada grupo `(período, versão da regra)`: `w_m` = pesos do motor `LEGACY` (`legacyGroupWeights`, função **extraída** do motor sem mudar comportamento), `W = Σ w`, `Q = apportion(total_g, w)` (a cota `LEGACY`). Cada despesa recebe `base_{i,m} = ⌊a_i × w_m ÷ W⌋`; as sobras (`a_i − Σ base`, 0..P−1) são entregues **um centavo por vez** ao membro de maior `R_m = Q_m − Σ_i base_{i,m}` restante (desempate: menor ordinal; preferindo quem ainda não recebeu centavo naquela despesa). **Prova:** (a) `Σ_i ⌊a_i w_m/W⌋ ≤ ⌊total_g w_m/W⌋ ≤ Q_m` ⇒ `R_m ≥ 0`; (b) `Σ_m R_m = Σ_i sobra_i`; (c) a cada passo demanda restante = oferta restante, então o algoritmo nunca fica sem destino; (d) ao fim, `Σ_i amount_{i,m} = Q_m` e `Σ_m amount_{i,m} = a_i`. O `bps` **gravado** é a intenção (`apportion(10000, w)`) e **não** entra na alocação. A prova é verificada por propriedade com milhares de casos aleatórios (SDD-015 §8.1), incluindo `EQUAL` com 3 e 4 membros e totais grandes.

### 2. Trava de família em toda escrita relevante; migração em `READ COMMITTED`
`lockFamilySplit(tx, familyId)` = `SELECT "splitEngine" FROM families WHERE id = :f FOR SHARE`, **primeira** trava de toda operação que cria/altera/exclui/restaura despesa comum ou seu rateio, grava regra de divisão, registra ou desfaz acerto, baixa previsão ou mexe em parcelas. O motor a usar é o lido **depois** da trava. O *script* faz `FOR UPDATE` na mesma linha no início de cada família. Resultado: nenhuma dessas escritas comita durante a migração da família (esperam), e cada instrução da migração vê um estado estável **sem** precisar de `REPEATABLE READ` (que daria erro de serialização ao atualizar linhas concorrentes). Teste: varredura estática das funções de escrita + `Promise.all`.

### 3. Só famílias `STORED` gravam rateio
Famílias `LEGACY` continuam gravando apenas `isSharedExpense` (R2.1). O *backfill* recalcula **tudo** da família (função pura dos dados) e nunca convive com linhas provisórias. Famílias novas nascem `STORED`. **Idempotência** = estado da família (`data_migrations.DONE` ⇒ pular), não "existência de linha".

### 4. Reversão em dois níveis e migração de contrato tardia
- **Nível 1 (sempre seguro):** voltar `splitEngine` a `LEGACY` sem tocar nos dados (as linhas são aditivas; o `LEGACY` as ignora). Vale enquanto a família não tiver `CUSTOM` nem parcela dividida.
- **Nível 2 (`--rollback --purge`):** apaga o rateio e zera `splitMode`; **só** antes da migração de contrato e sem `CUSTOM`/parcela dividida.
- **Migração de contrato** `us043_modo_custom` (mesmo *commit* da US-043): `CHECK ("isSharedExpense" = ("splitMode" <> 'NONE'))`, `splitMode`/`splitShares` em `planned_expenses` e liberação de `CUSTOM`. Falha (por desenho) se houver dado inconsistente. Antes dela só vale o sentido seguro `splitMode <> 'NONE' ⇒ isSharedExpense` (`tx_split_kind_chk`).
- **Janela de reversão:** do *deploy* da R3-A até a migração de contrato; mínimo de 7 dias **e** `--verify` limpo **e** um fechamento de mês conferido pelo Stakeholder.

### 5. O que o *gate* compara e como se prova que ele funciona
Por período: `status`, `totalShared`, por membro `paid/quota/difference/adjustment/balance`, `suggestions`, rótulo (`formatSplitLabel`) e linha ponderada; `today` **fixo** na execução. "Teste do teste": uma perturbação de +1 centavo no *backfill* **tem** de fazer o *gate* falhar e nada persistir.

### 6. Despesas excluídas
Também recebem rateio (alocação individual `splitAmount`) para que `restore` não gere lançamento inválido. Ao serem restauradas entram no mundo `STORED` com centavos por lançamento; não afetam nenhum acerto já conferido.

## Alternativas descartadas
- **Manter o `⌊valor × bps⌋` e "ajustar" `R_m` negativos:** quebraria `Σ_i amount = Q_m` ou exigiria tirar centavos de despesas, contradizendo o *gate*.
- **`REPEATABLE READ` + `FOR UPDATE`:** erro de serialização intermitente ao atualizar linhas tocadas por pedidos concorrentes; `READ COMMITTED` com a trava de família é determinístico.
- **`CHECK` imediato logo na expansão:** impediria linhas existentes (compartilhadas, `splitMode = NONE`) e a convivência com o código antigo durante o *deploy*.
- **Migrar em SQL puro:** dois oráculos de arredondamento (ver ADR-016).

## Consequências
- Estimativa da EN-002 mantida (13 = 5 + 8): o ajuste da prova e da trava já estava no custo do *gate*/harness.
- Código novo: `legacyGroupWeights`, `allocateBackfill`, `lockFamilySplit`, `migrateFamily`, `scripts/migrate-split.ts` (SDD-015 §4).
- O ADR-016 recebe errata apontando para este.
