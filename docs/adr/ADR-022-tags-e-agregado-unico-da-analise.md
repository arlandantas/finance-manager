# ADR-022 — Tags (normalização, N:N, mesclagem) e agregado único da Análise

**Status:** aceito · **Data:** 2026-10-05 · **Autor:** arquiteto

## Contexto
Tags livres são dimensão transversal e a Análise é leitura agregada. Riscos: tags duplicadas por caixa/acento ou corrida; `JOIN` de tags que multiplica linhas e infla totais; Análise divergir do Extrato e do Resumo; bloquear edição de tags por regras feitas para dinheiro.

## Decisão
1. **Tag é da família**, `tags(familyId, nameKey)` único. `nameKey` = NFD sem marcas, minúsculas, `trim`, espaços ➜ `-`; `name` guarda a 1ª grafia (espaços ➜ hífen). Sem extensão `unaccent`. Caracteres: letras, números, `-`, `_`, `.`. Erros de grafia mitigados por sugestão ao digitar.
2. **N:N `transaction_tags`**, fora do ledger (admite `DELETE`); só `EXPENSE`/`INCOME` (gatilho recusa outros). Criação ao digitar é upsert na transação do lançamento; renomear/mesclar/remover travam `FOR UPDATE` por `id` e são auditados em `family_events` (`TAG_RENAMED/MERGED/DELETED`).
3. **Filtro por `EXISTS`, nunca por `JOIN`**, dentro de `buildLedgerWhere`: lançamento com duas tags aparece e soma uma vez. Só a quebra por tag da Análise faz `JOIN`, e nunca fornece o total.
4. **Filtros plurais** compartilhados por Extrato e Análise (OU dentro, E entre): `categoryIds`, `payerIds`, `sourceIds` (conta ou cartão), `tagIds`, `untagged`. A Análise usa `payerIds` para o drill-down dar o mesmo total. Intervalo livre do Extrato passa a 24 meses.
5. **Agregado único da Análise:** `analyze()` = `buildLedgerWhere` + predicado de competência; totais por `ledgerTotals`. Propriedade de reconciliação (≥ 200 conjuntos) Extrato = Resumo = Análise. Participação por `apportion(1000, valores)` e `null` na quebra por tag.
6. **Editar tags é não financeiro:** `PATCH` só de `tags` não exige confirmação de mês acertado nem é barrado por fatura paga, conta arquivada ou parcela somente leitura; continua barrado em lançamento excluído. Em compra parcelada vale para todas as parcelas.

## Consequências
- Nenhuma coluna nova em `transactions`. Descartados: tags como array/JSON, texto livre sem normalização, consulta própria da Análise, materializar a Análise (reavaliar se p95 > 300 ms com 50 mil lançamentos).
