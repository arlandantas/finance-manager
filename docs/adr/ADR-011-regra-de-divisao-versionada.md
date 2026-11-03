# ADR-011 — Regra de divisão versionada por vigência e apuração do acerto

**Status:** aceito (detalha ADR-006; D-GES-08) · **Data:** 2026-10 · **Autor:** arquiteto

## Contexto
A regra de divisão (igualitária/proporcional) muda ao longo do tempo e meses passados não podem ser reescritos. O acerto precisa fechar ao centavo.

## Decisão
1. `SplitRuleVersion` é *append-only*, com `effectiveFrom` (`DATE`). A família nasce com versão `EQUAL` em `1970-01-01`. Vigente em `D` = maior `effectiveFrom <= D` (desempate por `createdAt` mais recente).
2. **Vigência por despesa:** usa a regra vigente em seu `occurredOn`. Nova regra tem `effectiveFrom` padrão = hoje; o Administrador pode escolher data **>= início do período corrente** (nunca altera períodos encerrados).
3. **Cotas por grupo de versão, não por despesa:** agrupam-se as despesas comuns do período pela versão aplicável; maior resto sobre `total_g`; cota do membro = soma das partes. Garante `Σ cotas = total comum`.
4. **Participantes:** `EQUAL` = membros com `joinedAt <= fim do período`. `PROPORTIONAL` = membros com `bps` na versão, cobrindo **todos** os membros atuais ao salvar. Membro novo depois torna a regra `stale = true`: cálculo segue (peso 0), UI avisa "Regra de divisão desatualizada".
5. **Ordem canônica** (desempate): `joinedAt` asc, depois `id` asc; menor ordinal recebe primeiro o centavo extra.
6. **Acerto líquido:** `net_m = pago_m − cota_m`, ajustado por acertos ativos do período (`+valor` devedor `from`, `−valor` credor `to`). Σ net = 0.
7. **Sugestão (N ≥ 2):** guloso determinístico (maior devedor ↔ maior credor, empates pela ordem canônica), no máximo N−1 transferências.

## Consequências
- Meses passados preservados; algoritmo puro em centavos, com testes de propriedade.
- O percentual efetivamente usado passa a ser gravado por lançamento (ADR-016).
