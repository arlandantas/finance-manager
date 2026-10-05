# ADR-022: Tags (normalização, N:N, mesclagem) e agregado único da Análise

## Status
Aceito (Tech Lead, 2026-10-05). Responde às perguntas técnicas da PO sobre US-045..049 ([`pedidos-ao-tech-lead-r21-r3.md`](../../product-owner/backlog/pedidos-ao-tech-lead-r21-r3.md)) e é a base do [SDD-016](../sdd/SDD-016-tags-e-visoes-sinteticas-esboco.md). Depende de [ADR-017](ADR-017-parcelamento-no-cartao-e-competencia.md) e [ADR-020](ADR-020-parcela-na-k-esima-fatura-e-competencia-no-banco.md) (competência) e do predicado único do [SDD-010](../sdd/SDD-010-resumo-do-mes-ocultar-valores-e-preferencias.md).

## Contexto
A R3 adiciona uma dimensão **transversal** (tags livres) e uma tela de **leitura agregada** (Análise). Os riscos técnicos são: (a) duplicar tags por caixa/acento ou por corrida; (b) um `JOIN` de tags que **multiplica linhas** e infla totais do Extrato; (c) a Análise divergir do Extrato e do Resumo do Mês (três "verdades" para o mesmo número); (d) editar tags em mês acertado ou em fatura paga sem efeito financeiro, mas bloqueado por regras feitas para dinheiro.

## Decisão

### 1. Tag é da família, chave normalizada, grafia original gravada
`tags(familyId, nameKey)` **único**. `nameKey` = `NFD` sem marcas combinantes, minúsculas, `trim`, espaços ➜ `-`. `name` guarda a **1ª grafia** já com espaços ➜ hífen. Sem extensão `unaccent` (função pura testada; o Postgres só garante unicidade). "viajem" ≠ "viagem": erros de grafia são mitigados por **sugestão ao digitar** (prefixo de `nameKey`), não por heurística. Conjunto de caracteres restrito (letras, números, `-`, `_`, `.`) porque a vírgula separa tags na interface e `#`/emoji complicariam URLs e filtros (hipótese TL-15).

### 2. N:N com `transaction_tags`; só despesa e receita; remoção física permitida
Tabelas **fora do ledger** (podem ter `DELETE`): gestão (renomear, mesclar, remover) é auditada em `family_events` (`TAG_RENAMED/MERGED/DELETED`). Gatilho `BEFORE INSERT` recusa ligação a `kind` que não seja `EXPENSE`/`INCOME`. Criação ao digitar é *upsert* na transação do lançamento (`ON CONFLICT DO NOTHING` + `SELECT … FOR SHARE` ordenado); mesclar/remover/renomear travam `FOR UPDATE` por `id` ⇒ sem ligação órfã e sem *deadlock*.

### 3. Filtro por `EXISTS`, nunca por `JOIN`
O filtro "qualquer das tags" é um `EXISTS` dentro de `buildLedgerWhere`; lista e totais compartilham a função, então **um lançamento com duas tags aparece uma vez e soma uma vez**. A única consulta que faz `JOIN` com `transaction_tags` é a **quebra por tag** da Análise, e ela **nunca** fornece o total (o total vem da consulta sem junção).

### 4. Filtros plurais e semântica de "membro"
Extrato e Análise compartilham `LedgerFilters` com plurais (OU dentro, E entre): `categoryIds`, `payerIds`, `sourceIds` (conta **ou** cartão), `tagIds`, mais `untagged`. O legado `memberId` (pagador **ou** autor) permanece; a Análise usa **`payerIds`** (quem pagou/recebeu) para que o *drill-down* do Extrato produza **o mesmo total**. O intervalo livre do Extrato passa de 366 dias para **24 meses** (mesma regra da Análise) para o *drill-down* caber.

### 5. Agregado único da Análise
`analyze()` = `buildLedgerWhere` + `periodPredicate` (competência) do Extrato; totais por `ledgerTotals`; linhas por `GROUP BY` da dimensão. **Fonte única** ⇒ propriedade de reconciliação (≥ 200 conjuntos com semente fixa) Extrato = Resumo = Análise, em dados com parcelas, cartões, transferências, acertos, pagamentos de fatura, excluídos e várias tags. A participação é `apportion(1000, valores)` (soma exata) e **`null` na quebra por tag** (a soma de tags pode exceder 100%). "Um lançamento com várias tags é contado em cada uma" é um aviso derivado (`Σ linhas > total do lado`), não uma regra de cálculo.

### 6. Edição de tags é **não financeira**
`PATCH` cujos campos ⊆ `{ tags }` não exige a confirmação de mês acertado e não é barrado por trava de fatura paga, conta arquivada ou parcela somente leitura (hipótese TL-20); continua barrado em lançamento excluído. Em compra parcelada a tag vale para **todas** as parcelas (o servidor aplica ao plano inteiro, com o plano travado antes das parcelas).

## Alternativas descartadas
- **Tag como array/JSON na transação**: perde FK, índice e mesclagem atômica; o filtro por `EXISTS` ficaria sem índice.
- **Tag como texto livre sem normalização no servidor**: duplicatas por caixa/acento e corridas.
- **Análise com consulta própria (sem o predicado do Extrato)**: três fontes de verdade; descartada pela mesma razão do ADR-017 §3.
- **Materializar a Análise**: sem medição que o justifique (volume pequeno; reavaliar se p95 > 300 ms com 50 mil lançamentos).
- **`unaccent`**: dependência de extensão do banco por um ganho pequeno; a função pura é testável e portátil.

## Consequências
- Migrações `us045_enum_family_event_tags` (isolada) e `us045_tags`; nenhuma coluna nova em `transactions`.
- `check:imports`: `tags/normalize` e as funções puras da Análise entram em `PURE`.
- A US-048 pode começar antes das tags (só categoria) e passa a estar correta por competência assim que a US-040b chega.
