# ADR-016: Percentual de divisão gravado por lançamento (rateio por membro) e migração sem mudar números

## Status
Aceito (Tech Lead, 2026-10-04). **Emenda o ADR-011** (a regra versionada deixa de *calcular* o acerto e passa a *sugerir* o percentual inicial). Responde P3 e P4 de [`pedidos-ao-tech-lead-r21-r3.md`](../../product-owner/backlog/pedidos-ao-tech-lead-r21-r3.md). Implementa a **EN-002** e habilita US-042, US-043 e US-044 (**R3**). **Nada neste ADR é implementado na R2.1**; a R2.1 só deixa as costuras descritas na seção "Preparação na R2.1".

## Contexto
Hoje o acerto usa a **regra vigente na data de cada despesa** (ADR-011): `computeSettlement` agrupa as despesas comuns por versão de regra, aplica o **maior resto sobre o total do grupo** e soma. O Stakeholder (Q-F02b, item 9b) quer o percentual **definido no lançamento**, gravado, com os modos "Só meu / Pela regra / De outro jeito", reembolso (0%/100%), parcelas que herdam o percentual da compra e, no futuro, N > 2 membros e ex-membros. Os números homologados não podem mudar nem 1 centavo (outubro: R$ 3.169,90 / cota R$ 1.584,95 / diferença R$ 1.149,95; setembro: R$ 717,00 / R$ 358,50 / R$ 260,50; mês com troca 50/50 ➔ 58/42: cotas R$ 780,00 e R$ 620,00).

**Armadilha identificada (não está no pedido do PO):** o cálculo atual arredonda **por grupo de regra**; a regra do Stakeholder para o novo modelo (RN-018.3, "a sobra de centavo fica com quem pagou") arredonda **por lançamento**. As duas diferem em centavos quando há valores ímpares (ex.: três despesas de R$ 100,01 a 50/50 pagas por Mariana: por grupo, cotas 150,02/150,01; por lançamento, 150,03/150,00). Logo, "gravar o percentual e recalcular com a regra nova" **mudaria números**. A solução precisa gravar o **resultado** (centavos por membro), não só o percentual.

## Decisão

### 1. Modelo (opção B refinada): rateio por lançamento e por membro, em centavos **e** em basis points
```text
Transaction.splitMode            enum SplitMode { NONE, RULE, CUSTOM }  NOT NULL DEFAULT NONE
Transaction.splitRuleVersionId   uuid NULL   -- regra usada como SUGESTÃO (modo RULE) ou na origem (backfill); só informativo
TransactionSplit(transactionId, familyId, memberId, bps int, amountInCents bigint)   -- PK (transactionId, memberId)
```
- `splitMode = NONE` ⇔ **sem** linhas em `transaction_splits` ⇔ despesa "Só meu". `RULE` e `CUSTOM` têm **uma linha por membro participante** (inclui 0% explícito quando o membro é citado).
- `isSharedExpense` **permanece** como coluna (compatibilidade com consultas e DTOs da R1/R2) e ganha `CHECK ("isSharedExpense" = ("splitMode" <> 'NONE'))`. Quem escreve é o serviço; o CHECK impede divergência.
- Invariantes por **constraint trigger deferrable** (checada no `COMMIT`): `Σ bps = 10000` e `Σ amountInCents = Transaction.amountInCents` por lançamento com `splitMode <> NONE`; só `kind = 'EXPENSE'`.
- `bps` é a **intenção** (o que a UI mostra: "58% / 42%"); `amountInCents` é o **valor exato debitado da cota** (o que o acerto soma). Podem diferir de ±1 centavo do produto `valor × bps` por causa da sobra.
- FKs compostas `(familyId, transactionId)` e `(familyId, memberId)` (ADR-013). Como `Member` não é apagado (ADR-019), **ex-membros mantêm o rateio** sem tratamento especial.

**Por que não as outras opções:** (A) coluna única (percentual do pagador) não representa N > 2, nem 0%/100% com N = 2 sem ambiguidade, nem ex-membros, nem a sobra por lançamento. (C) JSON perde FKs (ex-membro, isolamento por família) e agregações em SQL. A tabela custa um `JOIN`, aceitável: o acerto lê as despesas comuns de **um período** de **uma família** (centenas de linhas).

### 2. Regra de arredondamento do novo modelo (lançamentos criados depois da EN-002)
`splitAmount(amount, shares[], payerId)`: `base_m = ⌊amount × bps_m ÷ 10000⌋`; `sobra = amount − Σ base`; a sobra (0 .. N−1 centavos) vai **ao pagador, se ele participa com bps > 0**; senão, ao participante de **maior resto** (desempate: menor ordinal canônico, ADR-011 §5). Vetores: R$ 0,05 a 50/50 pago por Lucas ⇒ Lucas 0,03 / Mariana 0,02 (cenário da US-043); R$ 90,00 com 40/40/20 ⇒ 36,00/36,00/18,00; R$ 200,00 com Lucas 100%/Mariana 0% ⇒ 200,00/0,00.

### 3. O que a `SplitRuleVersion` passa a ser
Continua *append-only* e continua definindo: (a) o percentual **sugerido** no formulário (modo "Pela regra"); (b) a regra "desatualizada" (`stale`); (c) o texto de vigência (histórico). **Deixa de participar do cálculo** das cotas **depois do corte** (§5). Mudar a regra nunca reescreve lançamentos (Q-08 preservada por construção).

### 4. Motor do acerto: duas implementações, escolha por família
`computeSettlement` ganha um parâmetro de fonte. O **motor LEGACY** (SDD-002, vigência por data, maior resto por grupo) fica **congelado e intacto** (arquivo `settlement-legacy.ts`, cópia testada pelos vetores S1..S13). O **motor STORED** soma `TransactionSplit.amountInCents` por membro (`quota_m = Σ`), com `paid_m` e acertos como hoje; mantém as propriedades `Σ quota = totalShared`, `Σ diferença = 0`, `Σ saldo = 0`. Coluna `Family.splitEngine enum {LEGACY, STORED} DEFAULT LEGACY` seleciona o motor. Isso torna o corte **reversível por uma coluna** e permite migrar família a família.

### 5. Migração (EN-002): expandir ➜ fotografar ➜ preencher ➜ comparar ➜ virar a chave
Migração de **dados** em TypeScript (`scripts/migrate-split.ts`, executada como etapa do deploy depois de `prisma migrate deploy`; o motor LEGACY é reutilizado como oráculo), nunca em SQL cru, porque precisa do `apportion` e do `computeSettlement` reais.
1. **Expandir (SQL)**: migração `en002_percentual_por_lancamento` só **acrescenta** (colunas, `transaction_splits`, `Family.splitEngine`, trigger deferrable). O código novo roda com LEGACY e nada muda para o usuário.
2. **Fotografar**: para cada família e **cada período** que tenha despesa comum ou acerto (união), grava em `split_migration_snapshots (familyId, periodKey, payload jsonb, takenAt)` o resultado do motor LEGACY: `status`, `totalShared`, por membro `paid/quota/difference/adjustment/balance`, `suggestions`, e o rótulo ponderado em décimos (`apportion(1000, quotas)`).
3. **Preencher (por família, 1 transação)**: para cada período e cada **grupo de regra** (mesma chave do motor LEGACY):
   - vetor do grupo: EQUAL ⇒ participantes de `joinedOn <= fim do período` com `equalShares`; PROPORTIONAL ⇒ `bps` da regra por membro (com a mesma queda para "partes iguais" se todos zero). A função usada é **a do motor LEGACY**, não uma reescrita.
   - `Q[g][m] = apportion(total_g, pesos)` (exatamente a cota que o LEGACY calcula).
   - cada despesa do grupo recebe `base = ⌊valor × bps ÷ 10000⌋` por membro; a diferença do grupo, `R_m = Q[g][m] − Σ base`, é **sempre ≥ 0** (soma de pisos ≤ piso da soma) e `Σ R_m = Σ sobras das despesas`. As sobras são distribuídas despesa a despesa, na ordem `(occurredOn, createdAt, id)`, **um centavo por vez ao membro com maior `R_m` restante** (empate: menor ordinal). O problema de transporte é sempre viável e determinístico. Resultado: **`Σ_i amount_{i,m} = Q[g][m]` exato** e `Σ_m amount_{i,m} = valor_i`.
   - grava `splitMode = RULE`, `splitRuleVersionId = id da regra vigente na data`, as linhas de rateio (`bps` do vetor do grupo; `amountInCents` como acima). Despesas "Só meu" ficam `NONE` sem linhas. Receitas, transferências, acertos, previstas: intocados.
4. **Comparar (gate)**: ainda na transação da família, executa o motor **STORED** em **todos** os períodos fotografados e compara campo a campo com o snapshot (cota, diferença, saldo, total, sugestões, status, rótulo ponderado). **Qualquer divergência de 1 centavo lança erro ⇒ rollback da família ⇒ o script termina com código ≠ 0 ⇒ o deploy falha** (a etapa é obrigatória no pipeline). Famílias já migradas ficam migradas (cada família é atômica e independente).
5. **Virar a chave**: só após o gate, `UPDATE families SET splitEngine = 'STORED'`, na mesma transação.
- **Idempotente**: tabela `data_migrations (name, familyId, state, finishedAt)`; família `DONE` é pulada; despesa que já tem rateio nunca é reescrita; rodar de novo não altera nada (cenário "Migração é repetível sem efeito"). **Retomável**: falha no meio de uma família faz rollback dessa família; reaplicar refaz só o que falta.
- **Atômica**: por família (uma transação). Não há estado "metade migrada" visível.
- **Reversível (ponto de retorno)**: `UPDATE families SET splitEngine='LEGACY'` volta ao motor antigo sem tocar nos dados (as linhas de rateio são aditivas). Rollback completo testado: `scripts/migrate-split.ts --rollback` apaga `transaction_splits` de origem `BACKFILL`, zera `splitMode` e volta o motor. **Janela de reversão**: enquanto a US-043 (modo `CUSTOM`) não é liberada. Por isso a **EN-002 é entregue sem mudança de interface** (só a US-022 já existente) e a US-043 vai **numa release seguinte**.

### 6. Rótulo ponderado (US-022) antes e depois
Interface única `explainPeriodSplit(period) → { segments, weighted }` com duas implementações: **por vigência** (R2.1, motor LEGACY: segmentos pelas versões de regra no período, ponderado = `apportion(1000, quotas)`) e **por rateio gravado** (R3: segmentos por `splitRuleVersionId`, ponderado idem). Como as cotas são idênticas (gate do passo 4), os dois **dão o mesmo número**; o gate também compara o rótulo. Teste de propriedade obrigatório (SDD-015): para dados aleatórios migrados, `explain` LEGACY == `explain` STORED.

### 7. Edição, mês acertado e concorrência
- Editar valor de um lançamento `RULE/CUSTOM` **recalcula os centavos** com os mesmos `bps` (transação única, `version` + revisão `UPDATE` com `changes: [{ field: "split", from, to }]`). Editar a **data** não troca o percentual (o percentual é do lançamento).
- Mudar modo/percentual de lançamento de **mês acertado** segue a confirmação da US-013b (`isSettledPeriod` inalterado).
- Dois membros editando o mesmo lançamento: `version` (ADR-009). Reescrever o rateio é *delete + insert* em `transaction_splits` dentro da mesma transação que incrementa `version`.

## Preparação na R2.1 (custo zero de retrabalho)
1. A R2.1 não toca o motor. As consultas por período passam por **um único predicado** (`ledgerPeriodWhere`), ver SDD-010 §1 (também serve ao parcelamento, ADR-017).
2. O rótulo da US-022 nasce atrás da interface `explainPeriodSplit` (SDD-011 §4), com a implementação por vigência.
3. `isSharedExpense` continua sendo o único marcador de "dividida"; a US-030 muda só o **padrão** do formulário (SDD-011 §5).
4. Fábricas de teste (`makeTransaction`) passam a aceitar `split?: { mode, shares }` já na R2.1 (ignorado até a EN-002), para que os testes de regressão da EN-002 reaproveitem os mesmos dados.

## Alternativas descartadas
- **Gravar só o percentual e manter o maior resto por grupo na leitura**: preservaria os números, mas contradiz RN-018.3 e inviabiliza o modo `CUSTOM` por lançamento (cada lançamento teria o seu vetor; o "grupo" passaria a ser a união de vetores iguais, com resultado diferente por ordem de lançamento).
- **Migrar em SQL puro**: duplicaria `apportion` e `computeSettlement` em PL/pgSQL (dois oráculos); descartado.
- **Recalcular tudo "on the fly" no deploy sem snapshot**: sem o "antes", não há como provar que nada mudou.

## Consequências
- Estimativa: **EN-002 = 13** (PO: 5), fatiável em 002a (modelo + motor STORED + gravação nos novos lançamentos, 5) e 002b (script, snapshot, gate, rollback, harness de regressão, 8).
- Tamanho do conjunto de testes: harness de regressão com **≥ 200 famílias aleatórias** (sementes fixas; N = 2..4; troca de regra no meio do mês; membro que entra no mês; acertos parciais; despesas excluídas; compras no cartão; valores ímpares) mais os **dados homologados** como casos nomeados.
- `isSharedExpense` fica redundante com `splitMode`; remoção só no AP1 (fora de escopo).

## Errata (2026-10-05) — ver [ADR-021](ADR-021-protocolo-de-migracao-e-corte-do-motor-do-acerto.md)
Valem **sobre o texto acima**:
1. **§5.3 (Preencher):** a distribuição das sobras usa **pesos exatos do motor `LEGACY`** (`base = ⌊valor × w_m ÷ W⌋`), **não** `⌊valor × bps ÷ 10000⌋`; a afirmação "`R_m` é sempre ≥ 0" só vale com pesos exatos (com `bps` falha para `EQUAL` com 3 membros). O `bps` gravado continua sendo `apportion(10000, w)` (intenção).
2. **§5 (Reversível):** não existe "origem `BACKFILL`"; a reversão tem dois níveis (virada de motor sem tocar nos dados; `--rollback --purge` antes da migração de contrato) — ADR-021 §4.
3. **§4/§5 (escrita durante a migração):** a trava de família `FOR SHARE`/`FOR UPDATE` e "famílias `LEGACY` não gravam rateio" — ADR-021 §2–§3.
4. **§1 (invariantes):** o `CHECK (isSharedExpense = (splitMode <> 'NONE'))` é aplicado na migração de contrato (`us043_modo_custom`); na expansão vale só o sentido seguro `splitMode <> 'NONE' ⇒ isSharedExpense`.
