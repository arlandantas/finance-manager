# SDD-016: Tags e visões sintéticas — Análise (US-045, US-047, US-046, US-048, US-049)

- **Histórias**: [US-045](../../product-owner/backlog/stories/US-045-tags-livres-no-lancamento.md) · [US-047](../../product-owner/backlog/stories/US-047-filtrar-extrato-por-tag.md) · [US-046](../../product-owner/backlog/stories/US-046-gerenciar-tags.md) · [US-048](../../product-owner/backlog/stories/US-048-visao-sintetica-periodo-totais-e-categoria.md) · [US-049](../../product-owner/backlog/stories/US-049-visao-sintetica-quebras-e-filtros.md)
- **Fluxo**: [FLUXO-014](../../product-owner/flows/FLUXO-014-parcelamento-tags-e-analise.md) §2–§3 e §5
- **Rastreabilidade**: NEED-013 (RN-013.1..6), NEED-016 (RN-016.1..5), NEED-006 · Q-F09, Q-F09b, Q-F10, Q-F12 · D-PO-28, D-PO-29 · TL-14, TL-15, TL-19, TL-20 · **[ADR-022](../adrs/ADR-022-tags-e-agregado-unico-da-analise.md)** (decisões: normalização, N:N, mesclagem, filtro por `EXISTS`, agregado único e semântica de tag repetida), [ADR-017](../adrs/ADR-017-parcelamento-no-cartao-e-competencia.md)/[ADR-020](../adrs/ADR-020-parcela-na-k-esima-fatura-e-competencia-no-banco.md) (competência)
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-001](SDD-001-transacoes.md) (lançamento, revisão, mês acertado), [SDD-005](SDD-005-extrato-e-home.md) (Extrato: `buildLedgerWhere`, `ledgerTotals`), [SDD-010](SDD-010-resumo-do-mes-ocultar-valores-e-preferencias.md) (predicado único, `Money`, reconciliação), [SDD-013](SDD-013-pagamentos-conta-padrao-descricao-e-polimento.md) (`q`), [SDD-014](SDD-014-parcelamento-esboco.md) (parcelas por competência; **plano trava antes das parcelas**), [SDD-011](SDD-011-acerto-opcional-rotulo-e-previa.md)/[SDD-012](SDD-012-manutencao-de-cadastros.md) (`FamilyEvent`) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md) §10
- **Status**: **Aprovado para Desenvolvimento** (R3) · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA
- **Estimativas (confirmadas)**: **US-045 = 5 · US-047 = 2 · US-046 = 3 · US-048 = 5 · US-049 = 5** (total 20)
- **Ordem (D-PO)**: US-045 ➜ US-047 ➜ US-046 ➜ US-048 ➜ US-049. A US-048 **pode começar sem as tags** (por categoria) e não depende da US-046. Cortes (primeiro a sair): US-049 ➜ US-046; US-045/047/048 só por decisão do Gestor.
- **Nome do arquivo**: mantém o sufixo `-esboco` só para não quebrar links; o conteúdo é o SDD completo.

---

## 1. Gaps técnicos e decisões

| Gap / Pergunta | Resolução |
| :-- | :-- |
| Normalização e unicidade | `normalizeTagKey(name)` (puro): `NFD`, remove marcas combinantes (`\p{M}`), minúsculas (`toLowerCase("pt-BR")`), `trim`, espaços internos ➜ `-`, hífens repetidos ➜ um. `nameKey` **único por família**; `name` = a **grafia da 1ª criação**, já com espaços ➜ hífen (a "exibição" da PO vira **gravação**: "Viagem Nordeste" ➜ "Viagem-Nordeste"). Variação de caixa/acento reaproveita a tag existente. "viajem" ≠ "viagem" (só sugestão ao digitar). Sem a extensão `unaccent`. |
| Tamanho e caracteres | 2..30 caracteres **após `trim`**, contados por ponto de código (`[...s].length`). Permitidos: letras, números, `-`, `_`, `.` (e espaço, que vira `-`). Outro caractere ⇒ 400 "A tag só pode ter letras, números, hífen, ponto e sublinhado" (**hipótese do TL**, TL-15; a vírgula é o separador da UI). Mensagem de tamanho: **"A tag precisa ter entre 2 e 30 caracteres"**. |
| Modelo | `tags(id, familyId, name, nameKey, version, createdByMemberId, updatedByMemberId, createdAt, updatedAt)` + `transaction_tags(transactionId, tagId, familyId)` PK `(transactionId, tagId)`. FKs compostas. **Hard delete** de `tags`/`transaction_tags` é permitido (não são ledger); a trilha de gestão vai em `family_events` (`TAG_RENAMED/MERGED/DELETED`). Só `EXPENSE` e `INCOME` (gatilho). |
| Criar ao digitar | `tags: string[]` (nomes, ≤ 20 distintos por chave) em `POST/PATCH /transactions`. O servidor faz o *upsert* **na mesma transação**: `INSERT … ON CONFLICT (familyId, nameKey) DO NOTHING` (em ordem de `nameKey`) + `SELECT … ORDER BY id FOR SHARE`; devolve as tags **canônicas**. Dez criações simultâneas da mesma tag ⇒ 1 linha. |
| `PATCH` com `tags` | **Substitui** o conjunto (`[]` limpa; ausente não toca). Calcula o *diff* (adicionadas/removidas). Grava revisão `UPDATE` com `changes: [{ field: "tags", from: nomes, to: nomes }]` (rótulo "Tags"). **`version` continua obrigatória e é incrementada** (trilha coerente; conflito com edição financeira simultânea é aceitável e conservador). |
| **Edição não financeira** | `PATCH` cujos campos ⊆ `{ tags }` **não** dispara `SETTLED_PERIOD_CONFIRMATION_REQUIRED` (a lista de campos do SDD-001 §4.2.5 já não inclui tags) e **não** é barrado por `INVOICE_PAID_LOCKED`, `ACCOUNT_ARCHIVED_LOCKED` nem `INSTALLMENT_NOT_EDITABLE` (hipótese do TL-20: tag não altera saldo, fatura nem acerto). Continua barrado em lançamento **excluído** (`TRANSACTION_DELETED`), `LINKED_TO_PLANNED` **não** se aplica (editar a tag da despesa gerada é permitido). |
| Compra parcelada | A tag vale para **todas** as parcelas (RN-013.5): na criação, `N × tags` linhas; no `PATCH` de `tags` em **qualquer** parcela, o servidor aplica o novo conjunto a **todas as parcelas do plano** na mesma transação (`plan FOR UPDATE` primeiro, SDD-014 §1; cada parcela recebe revisão `UPDATE` e `version + 1`; a `version` conferida é a da parcela alvo). |
| Transferência, acerto, abertura, pagamento de fatura | **Sem tags**: `CreateTransferSchema`/`PATCH` desses tipos rejeitam `tags` (`.strict()`); o gatilho barra `INSERT` em `transaction_tags` de outro `kind`. Previsões **não** têm tags nesta fatia. |
| Mesclagem atômica e idempotente | `POST /tags/:id/merge { version, intoId }`: trava as duas tags `FOR UPDATE` **em ordem de `id`**; move `transaction_tags` com `ON CONFLICT DO NOTHING`; apaga as ligações da origem e a tag de origem; `FamilyEvent(TAG_MERGED)`. Resposta guardada por `Idempotency-Key`; repetir com **outra** chave ⇒ `404` (origem já não existe). Mesclar consigo mesma ⇒ 422 `TAG_MERGE_SAME`. |
| Renomear | `PATCH /tags/:id { version, name }`. Mesma `nameKey` (só caixa/acento) ⇒ atualiza `name`. `nameKey` de **outra** tag ⇒ `409 TAG_NAME_EXISTS` com `details: { mergeIntoId, mergeIntoName }` (a UI oferece a mesclagem). |
| Remover | `POST /tags/:id/delete { version }`: apaga ligações e a tag; **nunca** apaga nem altera lançamentos (valores, totais e acerto idênticos). `usageCount` informado antes pela lista. |
| Concorrência tag × criação | A criação trava a tag `FOR SHARE` antes de ligar; mesclar/remover/renomear travam `FOR UPDATE` ⇒ serializam; nunca há ligação para tag inexistente (a FK também impede). |
| Filtro "qualquer das tags" | `EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt."transactionId" = t.id AND tt."tagId" = ANY(:ids))` dentro de `buildLedgerWhere` (lista **e** totais): **nenhuma junção que multiplique linhas**. Parâmetro de URL `tagIds` repetido. **`untagged=true`** (`NOT EXISTS`) existe **só** para o *drill-down* da linha "Sem tag" (TL-14; a PO deixou "filtro por ausência" fora do escopo da **interface** da US-047; aqui é técnico, a UI o mostra como chip "Sem tag"). |
| Filtros combináveis do Extrato/Análise | `LedgerFilters` ganha **plurais** (OU dentro, E entre eles): `categoryIds`, `payerIds` (**quem pagou/recebeu**; difere do legado `memberId` = pagador **ou** autor, que continua como está), `sourceIds` (ids de **conta ou cartão**), `tagIds`, mais `untagged`. Os singulares (`accountId`, `cardId`, `categoryId`, `memberId`) continuam (links antigos). Máximo 20 valores por filtro. |
| Intervalo | O Extrato passa de "≤ 366 dias" para **≤ 24 meses** (`to < addMonthsClamped(from, 24)`), a mesma regra da Análise (o *drill-down* de um intervalo de 24 meses precisa caber no Extrato). Mensagem: **"Escolha um intervalo de até 24 meses"** (400); `from > to` ⇒ "Intervalo inválido". |
| Agregado único da Análise | **Uma** função `analyze(tx, filters, groupBy, rowType)` sobre o **mesmo** `buildLedgerWhere`/`periodPredicate` do Extrato; os totais vêm de `ledgerTotals` (sem junção); as linhas, de um `GROUP BY` por dimensão. Parcelas entram **por competência** automaticamente. Transferências, acertos, pagamentos de fatura e excluídos **nunca** entram (`kind IN ('EXPENSE','INCOME')` e `deletedAt IS NULL`). |
| Tag repetida na quebra | `groupBy=tag`: `JOIN transaction_tags` (um lançamento conta em **cada** tag); a soma das linhas pode exceder o total (`tagOverlapNotice`); **o total vem sempre da consulta sem junção**. Com `tagIds` ativo, as linhas ficam restritas às tags selecionadas e a linha "Sem tag" é omitida. |
| Participação | `permille = apportion(1000, valores)` (soma exata 1000 = 100,0%; sem `float`), ordenada por valor desc e rótulo asc (o ordinal é a posição). **`null` quando `groupBy = tag`** (a soma pode exceder 100%). |
| Custo | Uma consulta de totais + uma de linhas (+ uma de rótulos por `ANY(ids)`); índices abaixo; meta **p95 < 300 ms com 50 mil lançamentos** (*benchmark* manual, `tests/perf/analysis.bench.ts`, fora do CI). Intervalo ≤ 24 meses. |
| Valores ocultos | Tudo por `<Money>`; as **barras ficam** (largura = valor ÷ maior valor); percentuais e contagens visíveis (SDD-010 §4.4). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/tags/normalize.ts  (PURO; entra em PURE do check:imports)
export function normalizeTagKey(name: string): string;                  // "Viágem Nordeste " ⇒ "viagem-nordeste"
export function canonicalTagName(name: string): string;                 // trim + espaços internos ⇒ "-" (a grafia gravada)
export const TAG_MIN = 2, TAG_MAX = 30, MAX_TAGS_PER_TRANSACTION = 20, SOFT_TAG_LIMIT = 3;

// src/modules/tags/schemas.ts
const TAG_LEN_MSG = "A tag precisa ter entre 2 e 30 caracteres";
export const TagNameSchema = z.string().trim()
  .min(TAG_MIN, TAG_LEN_MSG).refine((s) => [...s].length <= TAG_MAX, TAG_LEN_MSG)
  .regex(/^[\p{L}\p{N}_.\- ]+$/u, "A tag só pode ter letras, números, hífen, ponto e sublinhado");
export const TagNamesSchema = z.array(TagNameSchema).max(MAX_TAGS_PER_TRANSACTION, "Use no máximo 20 tags por lançamento");
// CreateExpenseSchema / CreateIncomeSchema / UpdateTransactionSchema ganham: tags: TagNamesSchema.optional()
//   (despesa/receita; em Create ausente = []; em Update ausente = não toca)
export const RenameTagSchema = z.object({ version: versionSchema, name: TagNameSchema }).strict();
export const MergeTagSchema  = z.object({ version: versionSchema, intoId: uuidSchema }).strict();
export const DeleteTagSchema = z.object({ version: versionSchema }).strict();
export const ListTagsQuerySchema = z.object({ q: z.string().trim().min(1).max(30).optional(), limit: z.coerce.number().int().min(1).max(500).default(200) }).strict();

export type TagRef = { id: string; name: string };                     // TransactionDTO.tags (ordem: name asc)
export type TagDTO = { id: string; name: string; usageCount: number; version: number; updatedBy: MemberRef | null };
export type MergeTagResponse = { tag: TagDTO; movedCount: number };    // `tag` = a de destino

// src/modules/transacoes/schemas.ts — filtros (Extrato e Análise compartilham `LedgerFilters`)
const idList = z.union([uuidSchema, z.array(uuidSchema).max(20)]).transform((v) => (Array.isArray(v) ? v : [v]));
// ListTransactionsQuerySchema ganha: categoryIds, payerIds, sourceIds, tagIds: idList.optional(); untagged: boolParam.optional()
//   refine: untagged=true e tagIds juntos ⇒ 400 "Use tags ou \"sem tag\", não os dois"
//   refine (intervalo): `to < addMonthsClamped(from, 24)` ⇒ senão 400 "Escolha um intervalo de até 24 meses"
// LedgerFilters ganha: categoryIds?: string[]; payerIds?: string[]; sourceIds?: string[]; tagIds?: string[]; untagged?: boolean
// TransactionDTO ganha: tags: TagRef[]   ([] fora de despesa/receita)

// src/modules/analise/schemas.ts
export const AnalysisQuerySchema = z.object({
  period: periodKeySchema.optional(), from: dateISOSchema.optional(), to: dateISOSchema.optional(),   // como no Extrato (mesmas regras de combinação)
  groupBy: z.enum(["category", "member", "account", "tag"]).default("category"),
  type: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),            // qual lado vira linhas; os totais mostram os dois
  categoryIds: idList.optional(), payerIds: idList.optional(), sourceIds: idList.optional(), tagIds: idList.optional(), untagged: boolParam.optional(),
}).strict();
export type AnalysisRowDTO = {
  key: string; kind: "CATEGORY" | "MEMBER" | "ACCOUNT" | "CARD" | "TAG" | "NO_TAG";
  label: string; archived: boolean; amountInCents: number; count: number;
  permille: number | null;                                           // null quando groupBy = "tag"
  drillUrl: string;                                                  // /extrato?… com o mesmo período, filtros e type (pura: buildDrillUrl)
};
export type AnalysisDTO = {
  period: { key: string | null; start: string; end: string; isCurrent: boolean };
  totals: { incomeInCents: number; expenseInCents: number; resultInCents: number; count: number };
  groupBy: "category" | "member" | "account" | "tag"; type: "EXPENSE" | "INCOME";
  rows: AnalysisRowDTO[];                                            // valor desc, rótulo asc
  rowsTotalInCents: number;                                          // Σ rows (pode exceder o total do lado quando groupBy = tag)
  tagOverlapNotice: boolean;                                         // groupBy = tag ∧ rowsTotalInCents > total do lado
  isEmpty: boolean;                                                  // totals.count = 0
};
export function buildDrillUrl(i: { start: string; end: string; periodKey: string | null; type: "EXPENSE" | "INCOME";
  filters: Pick<LedgerFilters, "categoryIds" | "payerIds" | "sourceIds" | "tagIds" | "untagged">;
  dimension: AnalysisRowDTO["kind"] | "TOTAL"; key?: string }): string;     // PURO (testado)
```

---

## 3. Contratos de API (`auth: "family"`; mutações com `Idempotency-Key`)

| Rota | Papel | Corpo/params | Sucesso | Erros |
| :-- | :-- | :-- | :-- | :-- |
| `POST /api/v1/transactions` · `PATCH …/:id` | todos | `tags?` (despesa/receita) | como no SDD-001, com `TransactionDTO.tags` | 400 (nome/tamanho/caracteres/mais de 20) · 400 em transferência/acerto (`.strict()`) |
| `GET /api/v1/tags?q=&limit=` | todos | `ListTagsQuerySchema` | `200 { items: TagDTO[] }` (sem `q`: **todas**, por `usageCount` desc e nome; com `q`: **prefixo de `nameKey`**, até `limit`) | 400 |
| `PATCH /api/v1/tags/:id` | todos (D-PO-04/28) | `RenameTagSchema` | `200 { tag: TagDTO }` | 404 · 409 `VERSION_CONFLICT` ("Esta tag foi alterada por {Nome}. Recarregue para continuar.") · **409 `TAG_NAME_EXISTS`** (`details: { mergeIntoId, mergeIntoName }`) |
| `POST /api/v1/tags/:id/merge` | todos | `MergeTagSchema` | `200 MergeTagResponse` | 404 · 409 `VERSION_CONFLICT` · 422 `TAG_MERGE_SAME` |
| `POST /api/v1/tags/:id/delete` | todos | `DeleteTagSchema` | `200 { deleted: true; removedFromCount: number }` | 404 · 409 `VERSION_CONFLICT` |
| `GET /api/v1/transactions` | todos | + `tagIds`, `untagged`, `categoryIds`, `payerIds`, `sourceIds`; intervalo ≤ 24 meses | `ListTransactionsResponse` (`items[].tags`) | 400 "Escolha um intervalo de até 24 meses" |
| `GET /api/v1/analysis` | todos | `AnalysisQuerySchema` | `200 AnalysisDTO` | 400 ("Escolha um intervalo de até 24 meses", "Intervalo inválido", filtros) |

Mensagens exatas: "A tag precisa ter entre 2 e 30 caracteres" · "Já existe a tag {nome}. Mesclar {origem} nela?" (**montada na UI** com `mergeIntoName`) · "Nenhuma tag ainda. Crie tags ao lançar uma despesa." · "Nenhum lançamento com essa tag neste período" · "Muitas tags dificultam a análise" (aviso da UI, nunca erro) · "Escolha um intervalo de até 24 meses" · "Nada lançado neste período" · "Nada lançado com esses filtros" · "Não foi possível carregar a análise" · "Um lançamento com várias tags é contado em cada uma".

---

## 4. Regras e algoritmos

### 4.1 `normalizeTagKey` / `canonicalTagName` (vetores obrigatórios, `tests/unit/tags/normalize.test.ts`)
| # | Entrada | `canonicalTagName` | `normalizeTagKey` |
| :-- | :-- | :-- | :-- |
| T1 | `"Viagem"`, `"viagem"`, `"Viágem"`, `" VIAGEM "` | `Viagem` / `viagem` / `Viágem` / `VIAGEM` | todas ⇒ **`viagem`** |
| T2 | `"Café"`, `"cafe"`, `"CAFÉ"` | — | **`cafe`** |
| T3 | `"viajem"` vs `"viagem"` | — | **chaves diferentes** (não unifica erro de grafia) |
| T4 | `"viagem nordeste"`, `"Viagem  Nordeste"` | `viagem-nordeste` / `Viagem-Nordeste` | `viagem-nordeste` |
| T5 | `"a"`, `""`, `"   "` | — | Zod: "A tag precisa ter entre 2 e 30 caracteres" |
| T6 | 31 caracteres | — | idem |
| T7 | `"ação"` (NFC) e `"ação"` (NFD) | — | mesma chave `acao` |
| T8 | `"tag,x"`, `"tag!"`, `"#casa"` | — | Zod: "A tag só pode ter letras, números, hífen, ponto e sublinhado" |
| T9 | `"São-Paulo"` | `São-Paulo` | `sao-paulo` |
| Propriedades | idempotente (`key(key(x)) = key(x)`); sem espaços; só `[a-z0-9_.-]` e letras sem acento; `canonical` preserva a 1ª grafia |

### 4.2 `applyTags(tx, ctx, transactionIds, names | undefined)` (dentro de `createExpenseCore`/`createIncome`/`updateTransaction`)
1. `undefined` ⇒ não toca. `[]` ⇒ remove todas as ligações das transações. Senão: `canonical`/`key` de cada nome, **dedup por chave** (vale a 1ª grafia), `≤ 20`.
2. `INSERT INTO tags … ON CONFLICT ("familyId","nameKey") DO NOTHING` (em ordem de `nameKey`); `SELECT … WHERE familyId AND nameKey = ANY(:keys) ORDER BY id FOR SHARE` ⇒ tags canônicas (com a grafia **existente**).
3. Criar: `INSERT INTO transaction_tags (transactionId, tagId, familyId)` para cada par. Editar: *diff* contra o atual (`DELETE` removidas; `INSERT` novas, `ON CONFLICT DO NOTHING`).
4. Revisão: `changes: [{ field: "tags", from: [nomes], to: [nomes] }]` só se o conjunto mudou; **sem diferença** (e sem outros campos) ⇒ `200` sem `version+1`.
5. Plano (parcelas): `transactionIds` = **todas** as parcelas do plano (SDD-014); `plan FOR UPDATE` antes.
6. Resposta: `TransactionDTO.tags` (ordem por nome). Efeito em cache: `["tags"]`, `["transactions"]`, `["analysis"]`.

### 4.3 Mesclar, renomear e remover (US-046)
- **Mesclar** (`mergeTags`, uma transação): travar origem e destino `FOR UPDATE` **por `id` crescente**; `version` da origem; `INSERT INTO transaction_tags SELECT "transactionId", :into, "familyId" FROM transaction_tags WHERE "tagId" = :src ON CONFLICT DO NOTHING`; `DELETE FROM transaction_tags WHERE "tagId" = :src`; `DELETE FROM tags WHERE id = :src`; `UPDATE tags SET version = version + 1, updatedBy… WHERE id = :into`; `FamilyEvent(TAG_MERGED, changes: { from, into, moved })`. `movedCount` = ligações **novas** no destino (as duplicadas não contam). Atômica: falha injetada no meio ⇒ nada muda. **Vetor**: `viajem`(3) + `viagem`(5) sem lançamentos em comum ⇒ destino com **8**; com 1 em comum ⇒ **7**.
- **Renomear**: `UPDATE tags SET name = :canonical, nameKey = :key, version = version + 1 WHERE id AND version = :v`; índice único violado ⇒ `409 TAG_NAME_EXISTS` (consulta a tag que colide para `details`). Atualiza **todos** os lançamentos automaticamente (a ligação é por `tagId`).
- **Remover**: `FOR UPDATE`; `removedFromCount` = nº de lançamentos **ativos** afetados; `DELETE` ligações e tag; `FamilyEvent(TAG_DELETED)`.
- **Lista** (`listTags`): `usageCount` = lançamentos **ativos** (`deletedAt IS NULL`) distintos; ordenação por uso desc, nome asc; com `q`, `nameKey LIKE :prefix || '%'` (prefixo = `normalizeTagKey(q)` com `%`/`_`/`\` escapados), até `limit`.

### 4.4 Filtro (US-047) e extensão de `buildLedgerWhere`
```typescript
if (f.tagIds?.length)   parts.push(sql`EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt."transactionId" = t.id AND tt."tagId" = ANY(${f.tagIds}::uuid[]))`);
if (f.untagged)         parts.push(sql`NOT EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt."transactionId" = t.id)`);
if (f.categoryIds?.length) parts.push(sql`t."categoryId" = ANY(${f.categoryIds}::uuid[])`);
if (f.payerIds?.length)    parts.push(sql`t."payerMemberId" = ANY(${f.payerIds}::uuid[])`);
if (f.sourceIds?.length)   parts.push(sql`(t."accountId" = ANY(${f.sourceIds}::uuid[]) OR t."cardId" = ANY(${f.sourceIds}::uuid[]))`);
```
Aplicado à **lista e aos totais** (mesma função). Com filtro de tag, transferências/acertos somem por construção (não têm tags). Cada lançamento aparece **uma vez**; o total **não soma em dobro** (propriedade). Parcelas: uma linha por parcela, total do **período filtrado** (competência). Estado do filtro na URL (`tagIds` repetido); "Limpar filtros" (US-039) o remove. Índices: `transaction_tags (tagId, transactionId)` e a PK `(transactionId, tagId)`.

### 4.5 `analyze` (US-048/049) — `src/modules/analise/{service,repo}.ts` (SQL em `repo.ts`)
```text
where  = buildLedgerWhere({ …filtros, type: undefined })  AND t."deletedAt" IS NULL AND t.kind IN ('EXPENSE','INCOME')
totals = ledgerTotals(...)                                  -- SEM junção; income, expense, count (só EXPENSE/INCOME ativos)
side   = rowType (EXPENSE | INCOME);  sideTotal = totals.expense | totals.income
rows por groupBy:
  category: SELECT t."categoryId" k, SUM(amount), COUNT(*) FROM transactions t WHERE where AND t.kind = side GROUP BY 1
  member  : idem por t."payerMemberId"
  account : GROUP BY COALESCE(t."accountId", t."cardId"), (t."accountId" IS NULL)   -- 'ACCOUNT' | 'CARD'
  tag     : SELECT tt."tagId" k, SUM(...), COUNT(DISTINCT t.id) FROM transactions t JOIN transaction_tags tt ON tt."transactionId" = t.id
            WHERE where AND t.kind = side [AND tt."tagId" = ANY(:tagIds)] GROUP BY 1
            + (se !tagIds e !untagged) linha NO_TAG: SUM/COUNT dos lançamentos do lado SEM nenhuma ligação (NOT EXISTS)
labels : 1 consulta por dimensão com `ANY(ids)` (categorias, membros inclusive ex-membros, contas/cartões, tags) — incluindo ARQUIVADOS
ordenar: amountInCents desc, label asc;  permille = groupBy === "tag" ? null : apportion(1000, valores) (ordinal = posição)
rowsTotalInCents = Σ rows;  tagOverlapNotice = groupBy === "tag" && rowsTotalInCents > sideTotal
```
**Vetores** (`tests/unit/analise/*.test.ts`, funções puras `toRows`/`permilles`): `apportion(1000, [70000, 30000, 20000])` ⇒ **583 / 250 / 167** (soma 1000; "58,3% · 25,0% · 16,7%"); `[70000, 30000]` ⇒ 700/300; `[1, 1, 1]` ⇒ 334/333/333; valor 0 ⇒ 0; `buildDrillUrl` (vetores D1..D6: categoria, membro, conta, cartão, tag, "Sem tag", total).
**Período**: `period` (`periodFromKey(key, cutDay)`) ou `from/to`; ausentes ⇒ período corrente. Intervalo ≤ 24 meses (§1). Valida `from ≤ to`.
**Reconciliação (propriedade, ≥ 200 conjuntos com semente fixa)**: para dados aleatórios (parcelas por competência, compras no cartão, transferências, acertos, pagamentos de fatura, excluídos, vários membros e **várias tags**) e **filtros aleatórios**: (a) `analysis.totals` = `GET /transactions` (mesmos filtros) `totals`; (b) cada linha de `groupBy ≠ tag` = `GET /transactions` com `drillUrl` (`type` + filtro da linha) `expenseInCents|incomeInCents`; (c) `Σ rows = total do lado` quando `groupBy ≠ tag`; (d) `groupBy = tag`: cada linha = total do Extrato filtrado por **aquela** tag; "Sem tag" = Extrato com `untagged`; `Σ ≥ total` e `tagOverlapNotice` coerente; (e) `analysis.totals` = `getMonthSummary` do mesmo período sem filtros.

### 4.6 Custos e limites
Totais e linhas em `READ COMMITTED` (uma consulta cada; sem instantâneo `REPEATABLE READ` obrigatório: a tela não promete atomicidade entre as duas leituras — **a propriedade acima roda sem escritas concorrentes**). `limit` das listas de tags 500. Nenhuma tabela materializada (reavaliar só se o *benchmark* estourar).

### 4.7 Invariantes (verificadas por teste)
1. Nunca existem duas tags com a mesma `nameKey` na família (índice único e teste de corrida).
2. Toda ligação aponta para `EXPENSE`/`INCOME` da **mesma família** (FK composta + gatilho).
3. Mesclar/remover/renomear **não** alteram `amountInCents`, `occurredOn`, `competenceOn`, rateio nem `ledgerTotals`/acerto de nenhum período (checksum de `transactions` antes/depois).
4. `usageCount` = nº de lançamentos ativos com a tag; remover a tag zera isso sem tocar nos lançamentos.
5. Filtrar por 2 tags de um lançamento que tem as duas devolve **1** linha e conta o valor **1** vez.
6. Parcelas de um plano têm o **mesmo** conjunto de tags.

---

## 5. Dados e migrações (SQL cru; nunca editar migração aplicada)
**Ordem**: `us045_enum_family_event_tags` (**isolada**: valor novo de enum não pode ser usado na mesma transação) ➜ `us045_tags`.
```sql
-- us045_enum_family_event_tags
ALTER TYPE "FamilyEventType" ADD VALUE 'TAG_RENAMED';
ALTER TYPE "FamilyEventType" ADD VALUE 'TAG_MERGED';
ALTER TYPE "FamilyEventType" ADD VALUE 'TAG_DELETED';
```
```prisma
model Tag {
  id String @id @default(uuid()) @db.Uuid; familyId String @db.Uuid
  name String; nameKey String
  version Int @default(1)
  createdByMemberId String @db.Uuid; updatedByMemberId String? @db.Uuid
  createdAt DateTime @default(now()) @db.Timestamptz(3); updatedAt DateTime @updatedAt @db.Timestamptz(3)
  family Family @relation(fields: [familyId], references: [id])
  links TransactionTag[]
  @@unique([familyId, id]); @@unique([familyId, nameKey]); @@map("tags")
}
model TransactionTag {
  transactionId String @db.Uuid; tagId String @db.Uuid; familyId String @db.Uuid
  transaction Transaction @relation(fields: [familyId, transactionId], references: [familyId, id], onDelete: Restrict)
  tag         Tag         @relation(fields: [familyId, tagId], references: [familyId, id], onDelete: Restrict)
  @@id([transactionId, tagId]); @@index([tagId, transactionId]); @@map("transaction_tags")
}
// Transaction ganha: tags TransactionTag[]    (nenhuma coluna nova em `transactions`)
```
```sql
-- us045_tags (depois do CREATE TABLE do Prisma)
ALTER TABLE "tags" ADD CONSTRAINT tags_name_len_chk CHECK (char_length("name") BETWEEN 2 AND 30);
ALTER TABLE "tags" ADD CONSTRAINT tags_key_chk CHECK ("nameKey" <> '' AND char_length("nameKey") <= 60);
ALTER TABLE "tags" ADD CONSTRAINT tags_created_by_fkey FOREIGN KEY ("familyId","createdByMemberId") REFERENCES "members"("familyId","id");
CREATE FUNCTION transaction_tags_kind_chk() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE k "TransactionKind";
BEGIN
  SELECT kind INTO k FROM "transactions" WHERE "id" = NEW."transactionId" AND "familyId" = NEW."familyId";
  IF k IS NULL OR k NOT IN ('EXPENSE', 'INCOME') THEN RAISE EXCEPTION 'tags só valem para despesa e receita'; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER transaction_tags_kind BEFORE INSERT ON "transaction_tags" FOR EACH ROW EXECUTE FUNCTION transaction_tags_kind_chk();
```
`transaction_tags` e `tags` **não** são tabelas do ledger: permitem `DELETE` (a trilha de remoção/mesclagem vai em `family_events`). O teste estrutural "nenhuma FK para `members` com `ON DELETE CASCADE`" continua verde (`createdByMemberId` é `RESTRICT`). Seed: duas tags de exemplo; fábricas: `makeTransaction({ tags: ["viagem"] })` (via serviço) e `makeTag`.

---

## 6. Interface
- **Lançamento** (`transaction-drawer.tsx`, `edit-transaction-form.tsx`): linha recolhida **"+ Tag"** abaixo da descrição (**nunca** atrasa os quatro toques; sem foco automático); ao abrir, `TagInput` (chips removíveis; digitar + **Enter, vírgula** ou a opção **"Criar tag '{texto}'"**; sugestões por prefixo via `GET /tags?q=` com *debounce* 200 ms, lista curta (8) com `role="listbox"`, `aria-live`); duplicata por chave **reaproveita** a existente e mostra o **nome original**; 4ª tag mostra o aviso suave **"Muitas tags dificultam a análise"** e permite salvar (limite duro 20); erro de nome no campo (`aria-invalid`). **Não** aparece em transferência/acerto/pagamento de fatura; aparece na **Receita** e na compra no cartão (inclusive parcelada). Falha de rede: mensagem padrão, chips preservados.
- **Extrato**: *chips* discretos de tag em cada linha e no detalhe; painel "Filtros" ganha **Tag** (seleção múltipla com busca; "Sem tag" como opção) e os demais filtros plurais; "Limpar filtros" remove todos; vazio filtrado "Nenhum lançamento com essa tag neste período"; total do filtro via `Money`. Estado na URL.
- **Configurações ▸ Tags** (`/tags`; menu "Configurações > Tags"): lista (nome, "N lançamentos" com singular/plural, ordenada por uso) com ações **rotuladas** Renomear / Mesclar / Remover; diálogo de renomear (nome inválido ⇒ mensagem; nome existente ⇒ "Já existe a tag {nome}. Mesclar {origem} nela?" com "Mesclar"); remover: "Remover tag de {n} lançamentos" (confirmação informa a contagem; **não apaga lançamentos**); conflito de versão ⇒ diálogo padrão com a mensagem do servidor; vazio "Nenhuma tag ainda. Crie tags ao lançar uma despesa."
- **Análise** (`/analise`; item "Análise" no menu): cabeçalho com seletor de período (Mês atual — padrão — / Mês anterior / Intervalo livre ≤ 24 meses), três cartões **Receitas · Despesas · Resultado** (`Money`), controle segmentado **Agrupar por** (Categoria · Membro · Conta/Cartão · Tag), abas Despesas/Receitas, painel recolhível "Filtros" (período, contas/cartões, categorias, tags, membros — OU dentro, E entre eles), lista com **barras horizontais** (valor `Money`, `%` visível, contagem), aviso "Um lançamento com várias tags é contado em cada uma" quando `tagOverlapNotice`, linha "Sem tag", **toque na linha ou nos totais abre o Extrato** (`drillUrl`; o total do Extrato é o mesmo número). **Estados**: skeletons (`h` fixa, sem salto), vazio ("Nada lançado neste período" / "Nada lançado com esses filtros"), erro ("Não foi possível carregar a análise" + "Tentar de novo"), intervalo > 24 meses (mensagem do servidor no seletor), sem conexão. **Valores ocultos**: barras ficam, valores mascarados, percentuais e contagens visíveis. Responsivo 375/1280 px; alvos ≥ 44 px; cada barra tem texto alternativo (`aria-label` com o rótulo e o percentual, **sem** o valor quando oculto).
- **Chaves de cache**: `["tags", { q }]`, `["analysis", params]`; criar/editar lançamento com `tags` invalida `["tags"]`, `["transactions"]`, `["analysis"]`, `["home"]`, `["month-summary"]`; renomear/mesclar/remover invalidam `["tags"]`, `["transactions"]`, `["analysis"]`, `["transaction"]`. Acrescentar `["analysis"]` e `["tags"]` a `invalidateFinancialCaches` (SDD-010 §6.5).

---

## 7. Segurança e isolamento
`familyId` da sessão (ADR-013); toda consulta de tags/análise com `familyId` (FKs compostas; `makeRepos`); `tagId`, `intoId`, `categoryIds`, `payerIds`, `sourceIds` de **outra** família ⇒ `404`/resultado vazio (os ids entram só em `ANY(...)` **depois** de `t."familyId" = :f`; nunca vazam linhas); `.strict()` rejeita `familyId`, `nameKey`, `usageCount`. Sem dado financeiro em *logs* nem em `family_events` (só ids e nomes de tag). Qualquer membro gerencia tags e vê a Análise (D-PO-04/29); nada exige o Administrador.

---

## 8. Testes obrigatórios (BDD → teste) — U = unidade, C = componente, I = integração (`db-test`), E = E2E

### US-045 (ordem 1)
| Cenário BDD | Testes |
| :-- | :-- |
| Lançar sem tag continua igual | **I**: `POST` sem `tags` ⇒ `tags []`, nenhuma linha em `tags`. **E**: 4 interações. |
| Criar uma tag ao digitar / Vários nomes | **I**: `POST` com `["viagem-nordeste","ferias"]` ⇒ 2 tags e 2 ligações; `GET /transactions` mostra os chips. **E**. |
| Sugestão das tags existentes | **I**: `GET /tags?q=via` ⇒ `viagem-nordeste`. **C**: listbox. |
| Mesma tag com outra caixa / acentos | **U**: T1, T2. **I**: tag `Viagem` existente + `"viagem"` ⇒ lançamento ligado à **existente** (grafia `Viagem`); `Café` + `cafe`; **nenhuma** segunda tag. |
| Quarta tag gera só um aviso | **C**: aviso "Muitas tags dificultam a análise"; **I**: 4 e 20 tags aceitas, 21 ⇒ 400. |
| Nome de tag inválido | **U**: T5, T6, T8 ("A tag precisa ter entre 2 e 30 caracteres"). |
| Transferência não tem tags / Receita aceita | **I**: `POST /transfers` com `tags` ⇒ 400; `POST` receita com `tags` ⇒ 201; `INSERT` direto em `transaction_tags` de transferência ⇒ erro do gatilho. **E**: campo ausente/presente. |
| Compra parcelada aplica a todas | **I**: 10x com `["escritorio"]` ⇒ 10 parcelas com a tag; `PATCH` de tags em **uma** parcela ⇒ as 10 mudam (revisão e `version` por parcela). |
| Tag não muda o acerto | **I**: rateio e `computeSettlement` idênticos com e sem tag. |
| Editar as tags de um lançamento | **I**: `PATCH { version, tags: ["ferias"] }` ⇒ revisão `UPDATE` com `field: "tags"`, `version + 1`; mesmo conjunto ⇒ 200 sem revisão. |
| Editar tag em mês acertado | **I**: `PATCH` só `tags` em despesa de setembro acertado ⇒ **200** (sem 409); com `amountInCents` junto ⇒ 409 `SETTLED_PERIOD_CONFIRMATION_REQUIRED`. |
| Falha de rede ao salvar | **E**: `route.abort()` ⇒ "Sem conexão. Seus dados continuam na tela, tente de novo." e chips preservados. |
| (infra) Corrida | **I**: 10 `POST` simultâneos com a mesma tag nova ⇒ **1** tag; `Idempotency-Key` repetida ⇒ 1 efeito. |
| (infra) Edição não financeira | **I**: `PATCH` só `tags` em compra de **fatura paga**, conta arquivada e parcela ⇒ 200; em lançamento **excluído** ⇒ 422 `TRANSACTION_DELETED`. |
| (infra) Isolamento | **I**: tag de outra família ⇒ nunca reaproveitada (`nameKey` igual em famílias diferentes cria 2 tags). |

### US-047 (ordem 2)
| Cenário BDD | Testes |
| :-- | :-- |
| Filtrar por uma tag / Total do filtro | **I**: `GET /transactions?tagIds=` ⇒ Hotel, Restaurante, Passagem; `totals.expenseInCents = 165000`. |
| Duas tags contam cada lançamento uma vez | **I**: `tagIds` das duas ⇒ "Passagem" **1** vez; total 165000. **Propriedade** (§4.5). |
| Combinar tag com categoria | **I**: `tagIds` + `categoryIds` ⇒ só "Passagem". |
| Tag sem lançamentos no período | **I/E**: lista vazia ⇒ "Nenhum lançamento com essa tag neste período". |
| Excluído não entra no total | **I**: Hotel excluído ⇒ 85000. |
| Filtro na URL / Limpar | **E**: recarregar mantém `tagIds`; "Limpar filtros" remove. |
| (infra) `untagged` | **I**: `untagged=true` ⇒ só "Mercado"; `untagged` + `tagIds` ⇒ 400. |
| (infra) Parcelas | **I**: filtro por tag em intervalo de 10 meses ⇒ 10 linhas e total das parcelas **do período**. |

### US-046 (ordem 3)
| Cenário BDD | Testes |
| :-- | :-- |
| Lista de tags com uso / Estado vazio | **I**: `GET /tags` ⇒ `viagem 5`, `viajem 3`, `ferias 0`, ordenado por uso; sem tags ⇒ `[]`. |
| Renomear / Renomear atualiza os lançamentos | **I**: `PATCH` ⇒ nome novo e os 2 lançamentos mostram `ferias-2026`; só caixa/acento ⇒ atualiza `name`. |
| Renomear para um nome existente oferece mesclar | **I**: `PATCH` "Viagem" em `viajem` ⇒ 409 `TAG_NAME_EXISTS` com `mergeIntoId` de `viagem`. |
| Mesclar tags | **I**: `merge` ⇒ `viagem` com **8**, `viajem` inexistente; `movedCount 3`; `FamilyEvent(TAG_MERGED)`; **atomicidade** com falha injetada; **idempotência** (mesma chave 1 efeito; outra chave ⇒ 404). Com 1 lançamento em comum ⇒ 7. |
| Remover não apaga lançamentos | **I**: `delete` de `viagem` ⇒ 5 lançamentos intactos sem a tag; **checksum** de `transactions`/`ledgerTotals` idêntico. |
| Remover tag sem uso | **I**: `ferias` (0) ⇒ some da lista. |
| Nome inválido ao renomear | **U/I**: "a" ⇒ 400 "A tag precisa ter entre 2 e 30 caracteres". |
| Membro também gerencia | **I** (matriz de permissão): MEMBER ⇒ 200 em `PATCH/merge/delete`. |
| Conflito de versão | **I**: dois `PATCH` com a mesma `version` ⇒ 200 e 409 "Esta tag foi alterada por Mariana. Recarregue para continuar." |
| Isolamento | **I**: `PATCH/merge/delete` de tag de outra família ⇒ 404; `intoId` de outra família ⇒ 404. |
| (infra) Corrida | **I**: `merge` × `POST` de lançamento com a tag de origem (`Promise.all`) ⇒ nunca ligação órfã; `merge A→B` × `merge B→A` ⇒ sem *deadlock*, um deles 404/409. |

### US-048 (ordem 4)
| Cenário BDD | Testes |
| :-- | :-- |
| Mês atual por padrão | **I**: `GET /analysis` (relógio 12/10/2026) ⇒ `period.key 2026-10`, `income 500000`, `expense 120000`, `result 380000`. **E**. |
| Quebra por categoria com participação / Soma das participações | **U**: `apportion(1000, [70000, 30000, 20000])` ⇒ 583/250/167. **I**: linhas ordenadas por valor; `Σ permille = 1000`. |
| Mês anterior / Intervalo livre / Intervalo > 24 meses | **I**: `period` anterior; `from/to` somando 2 meses; `2024-01-01..2026-10-31` ⇒ 400 "Escolha um intervalo de até 24 meses"; vetores de limite (`2025-01-01..2026-12-31` ok; `..2027-01-01` ⇒ 400). |
| Drill-down leva ao Extrato com o mesmo número | **I**: `rows[0].drillUrl` aponta para o Extrato do mesmo período/filtro e `GET /transactions` com esses parâmetros ⇒ `expenseInCents 70000`. **E**. |
| Total reconcilia com o Extrato / com o Resumo do Mês | **I**: propriedade §4.5 (a)(e). |
| Transferência e pagamento de fatura não entram | **I**: transferência 100000 e pagamento 47900 não mudam `totals`. |
| Compra parcelada conta por parcela | **I**: parcela 1 em out/2026 ⇒ 25000 no mês; parcelas futuras só nos meses de competência. |
| Excluído não entra / Período sem lançamentos | **I**: `Moradia` excluída ⇒ 100000; mês sem dados ⇒ `isEmpty`. **E**: "Nada lançado neste período". |
| Valores ocultos | **C/E**: "Supermercado R$ ••••• 58,3%"; barras presentes. |
| Erro ao carregar / Carregamento | **E**: `route.abort()` ⇒ "Não foi possível carregar a análise" + "Tentar de novo"; skeleton sem salto de layout. |
| Isolamento | **I**: dados da Família Souza **não** entram nos totais. |
| (infra) Ex-membro e categoria arquivada | **I**: linha com rótulo do ex-membro/categoria arquivada (não some). |
| (infra) Receitas | **I**: `type=INCOME` ⇒ linhas por categoria de receita; `totals` iguais. |

### US-049 (ordem 5)
| Cenário BDD | Testes |
| :-- | :-- |
| Agrupar por tag | **I**: `groupBy=tag` ⇒ `viagem-nordeste 165000`, `permille null`. |
| Filtro por tag mostra a quebra por categoria | **I**: `tagIds` + `groupBy=category` ⇒ Lazer 105000 (**636**), Transporte 60000 (**364**). |
| Agrupar por membro / conta ou cartão | **I**: Mariana 105000, Lucas 60000; `Itaú Mariana 105000`, `Nubank Lucas 60000` (cartão = linha `CARD`). |
| Várias tags somam mais que o total | **I**: "Passagem" com `ferias` ⇒ linhas 165000 e 60000, `rowsTotalInCents 225000`, `tagOverlapNotice true`, `totals.expense 165000`. **E**: aviso. |
| Lançamentos sem tag aparecem em Sem tag | **I**: "Mercado" 30000 ⇒ linha `NO_TAG`; `drillUrl` com `untagged=true` ⇒ Extrato 30000. |
| Filtros combinados | **I**: `payerIds` Mariana + `tagIds` ⇒ 105000. |
| Drill-down de uma linha / Filtros na URL | **I**: `drillUrl` da tag ⇒ Extrato 165000. **E**: recarregar mantém filtros. |
| Combinação sem resultado / Limpar filtros | **E**: "Nada lançado com esses filtros"; limpar volta ao período inteiro. |
| (infra) Propriedade | **I**: reconciliação (§4.5) com ≥ 200 conjuntos e filtros aleatórios. |
| (infra) Desempenho | **Manual**: *benchmark* com 50 mil lançamentos (p95 < 300 ms), registrado no `tasks-board.md`. |

---

## 9. Estimativa, dependências e impacto

| História | PO | **TL** | Observação |
| :-- | :-: | :-: | :-- |
| US-045 | 5 | **5** | Normalização, tabelas, `applyTags` (corrida, parcelas), `TagInput`, edição não financeira |
| US-047 | 2 | **2** | Filtros plurais + `tagIds`/`untagged` em `buildLedgerWhere`, UI de filtros, intervalo de 24 meses |
| US-046 | 3 | **3** | Renomear/mesclar/remover atômicos, tela, `FamilyEvent` |
| US-048 | 5 | **5** | `analyze`, tela, drill-down, propriedade de reconciliação |
| US-049 | 5 | **5** | `groupBy` membro/conta/tag, filtros, aviso de tag repetida |
Total do SDD: **20**. Dependências: US-045 depende de US-005/006/016a/024; US-047 de US-045 e US-007; US-046 de US-045; US-048 de US-007, US-025 e **da competência da US-040**; US-049 de US-048/045/047.

**Sequência de *commits* atômicos sugerida**: US-045: (1) migrações + schema; (2) `normalize.ts` + vetores T1..T9; (3) `applyTags` + rotas `POST/PATCH` + revisão + edição não financeira; (4) `GET /tags`; (5) `TagInput`/chips. US-047: (1) filtros plurais + `tagIds`/`untagged` + intervalo de 24 meses; (2) UI. US-046: (1) rotas + `FamilyEvent`; (2) tela. US-048: (1) `analyze` + `GET /analysis`; (2) propriedade de reconciliação; (3) tela. US-049: (1) `groupBy` + filtros; (2) UI.

**Impacto no código existente**: `transacoes/{schemas,service,extrato,repo,mutations}.ts` (`tags`, filtros plurais, intervalo, DTO), novo `tags/{normalize,schemas,service,repo}.ts`, novo `analise/{schemas,service,repo}.ts`, `src/app/api/v1/{tags,analysis}/**`, `extrato-screen.tsx` (chips, filtros, URL), `transaction-drawer.tsx`, `edit-transaction-form.tsx`, `transaction-detail.tsx`, `app-shell.tsx` (menu "Análise" e "Configurações > Tags"), `scripts/check-imports.ts` (`tags/normalize` e funções puras de `analise` em `PURE`), `tests/support/factories.ts` (`tags`, `makeTag`), `prisma/seed.ts`, SDD-001 (lista de campos de "edição não financeira"), SDD-008/014 (guarda `assertEditableTransaction` com exceção para `tags`).

**Ajustes pedidos ao PO / Dev (não bloqueantes)**
1. **PO** (US-045): registrar que "espaços internos viram hífen" é **gravação** (não só exibição) e a lista de caracteres permitidos (TL-15).
2. **PO** (US-047/049): o *drill-down* de "Sem tag" usa o filtro técnico `untagged` (chip "Sem tag"); a US-047 diz "fora de escopo: filtro por ausência de tag" para a **interface** — confirmar (TL-14).
3. **PO** (US-049): o filtro "membro" da Análise é **quem pagou/recebeu** (não o autor); o rótulo da interface deve dizer "Quem pagou" (TL-19).
4. **Dev**: o `PATCH` só de `tags` não pode virar `INVOICE_PAID_LOCKED`/`INSTALLMENT_NOT_EDITABLE`; o teste "(infra) Edição não financeira" cobre.
