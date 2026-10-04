# ADR-011: Regra de divisão versionada por vigência e apuração do acerto

## Status
Aceito (Tech Lead). Implementa a **D-GES-08** (vigência por data) e detalha o ADR-006.

## Decisão
1. **`SplitRuleVersion`** é *append-only*: cada alteração cria uma nova versão com `effectiveFrom` (`DATE`). A família nasce com uma versão `EQUAL` com `effectiveFrom = 1970-01-01`. A versão vigente numa data `D` é a de **maior `effectiveFrom <= D`** (desempate por `createdAt` mais recente).
2. **A vigência é por despesa:** cada despesa comum usa a regra vigente em seu `occurredOn`. Uma nova regra tem `effectiveFrom` padrão = hoje; o Administrador pode escolher qualquer data **>= início do período corrente** (nunca altera períodos já encerrados).
3. **Cotas por grupos, não por despesa:** no período, agrupam-se as despesas comuns pela versão de regra aplicável; para cada grupo `g` aplica-se o **maior resto** sobre `total_g`; a cota do membro é a soma das partes. Garante `Σ cotas = total comum` e evita viés acumulado de arredondar despesa a despesa.
4. **Participantes:** `EQUAL` = membros com `joinedAt <= fim do período` (ordem canônica abaixo). `PROPORTIONAL` = os membros com `bps` na versão; deve cobrir **todos** os membros atuais no momento de salvar. Se entrar membro depois, a regra fica **desatualizada** (`stale = true`): o cálculo segue (o novo membro com peso 0), a UI exibe "Regra de divisão desatualizada" e pede ao Administrador que redefina.
5. **Ordem canônica de membros** (para desempate determinístico): `joinedAt` ascendente, depois `id` ascendente. Quem tem menor ordinal recebe primeiro o centavo extra.
6. **Acerto líquido:** `net_m = pago_m − cota_m` ajustado por acertos ativos do período (`+valor` para o devedor `from`, `−valor` para o credor `to`). Σ net = 0.
7. **Sugestão (N ≥ 2):** guloso determinístico (maior devedor ↔ maior credor, empates pela ordem canônica), no máximo N−1 transferências. Não é o mínimo global (problema NP-difícil), mas é determinístico, explicável e ótimo para N = 2 e para os exemplos do PO.

## Consequências
Meses passados preservados; algoritmo puro, em centavos, com testes de propriedade (SDD-002).
