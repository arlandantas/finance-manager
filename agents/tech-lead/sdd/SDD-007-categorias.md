# SDD-007: Gerenciar Categorias (US-014)

- **História**: [US-014](../../product-owner/backlog/stories/US-014-gerenciar-categorias.md)
- **Fluxo**: [FLUXO-001 rev. 3](../../product-owner/flows/FLUXO-001-lancamento-rapido.md) (atalho "Gerenciar categorias")
- **Rastreabilidade**: NEED-006 (extrato por categoria) · D-PO-02, D-PO-04 · ADR-009, ADR-013 · SDD-001 §3 (`GET /categories`), SDD-003 §4.3 (padrões)
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-003](SDD-003-auth-familia-convite.md), [SDD-001](SDD-001-transacoes.md) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md) §7.2–§7.3 (`us014_categorias`)
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA

---

## 1. Gaps técnicos e decisões

| Gap | Resolução |
| :-- | :-- |
| Unicidade sem distinção de caixa | Índice único funcional `(familyId, kind, lower(btrim(name)))`, **incluindo arquivadas** (nome de arquivada não é reaproveitado; a UI oferece *Reativar*). O `@@unique([familyId, kind, name])` exato do R1 permanece. |
| Conflito de edição | `Category.version` + `updatedByMemberId` (ADR-009); `409 VERSION_CONFLICT` com a mensagem "Esta categoria foi alterada por {Nome}. Recarregue para continuar." |
| Última categoria ativa do tipo | `pg_advisory_xact_lock(hashtextextended(familyId \|\| ':' \|\| kind, 0))` no `archive`, depois `COUNT(*)` das ativas do tipo; se `<= 1` → `422 LAST_ACTIVE_CATEGORY`. Dois arquivamentos simultâneos não zeram o tipo. |
| Limite de 40 por tipo | Contagem (ativas + arquivadas) dentro da transação de criação, sob o mesmo advisory lock `(família, tipo)` ⇒ `422 CATEGORY_LIMIT_REACHED`. |
| Ordem de novas | `sortOrder = COALESCE(MAX(sortOrder), -1) + 1` **da família** (a grade já ordena por `sortOrder, id`); empate por corrida é inofensivo. |
| Ícones | Lista fechada `CATEGORY_ICON_KEYS` (26 chaves); `category-icon.tsx` ganha o mapa das novas; chave desconhecida cai em `package` (já é o comportamento). Teste unitário garante que **toda chave da lista tem ícone**. |
| Renomear arquivada | Proibido (`422 CATEGORY_ARCHIVED`): reativar primeiro. |
| Efeito em outros módulos | Criar/atualizar lançamento e previsão **só aceita categoria ativa** (`422 INVALID_REFERENCE` já existente); **manter** a categoria de um lançamento que depois foi arquivada **não** é erro (a validação só roda quando `categoryId` é enviado e difere do atual). Baixa de previsão ignora o arquivamento (SDD-009). Filtro de extrato aceita categoria arquivada. |
| Permissão | Qualquer membro (D-PO-04); sem `role`. |
| Exclusão definitiva | Não existe rota nem UI (hard delete proibido também no banco por não haver necessidade; FK `RESTRICT`). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/transacoes/schemas.ts  (CategoryDTO ganha campos; schemas novos em src/modules/categorias/schemas.ts)
export const CATEGORY_ICON_KEYS = [
  "shopping-cart","home","receipt","car","pill","graduation-cap","utensils","package","wallet","trending-up","plus-circle",
  "paw-print","baby","plane","shirt","gift","dumbbell","tv","wrench","heart","briefcase","fuel","bus","coffee","music","book-open",
] as const;                                              // 26 chaves: 11 padrão + 15 novas
export const MAX_CATEGORIES_PER_KIND = 40;

const nameSchema = z.string().trim()
  .min(2, "Informe um nome com ao menos 2 caracteres")
  .max(30, "O nome deve ter no máximo 30 caracteres");
const iconSchema = z.enum(CATEGORY_ICON_KEYS, { error: "Escolha um ícone" });

export const CreateCategorySchema = z.object({
  kind: z.enum(["EXPENSE", "INCOME"], { error: "Escolha o tipo da categoria" }),
  name: nameSchema,
  icon: iconSchema.default("package"),
}).strict();

export const UpdateCategorySchema = z.object({
  version: versionSchema,
  name: nameSchema.optional(),
  icon: iconSchema.optional(),
}).strict().refine((v) => v.name !== undefined || v.icon !== undefined, { message: "Nada para alterar" });

export const CategoryStateSchema = z.object({ version: versionSchema }).strict();     // archive / unarchive
export const CategoriesQuerySchema = z.object({
  kind: z.enum(["EXPENSE", "INCOME"]).optional(),
  includeArchived: z.enum(["true", "false"]).transform((v) => v === "true").optional(),
}).strict();

export type CategoryDTO = {
  id: string; name: string; kind: "EXPENSE" | "INCOME"; icon: string;
  archived: boolean; version: number;
};
```

---

## 3. Contratos de API

Todas `auth: "family"`; mutações com `Idempotency-Key` (SDD-000).

| Rota | Corpo | Sucesso | Erros |
| :-- | :-- | :-- | :-- |
| `GET /api/v1/categories?kind=&includeArchived=` | — | `200 { items: CategoryDTO[] }` (por `sortOrder, id`; **sem arquivadas** por padrão — compatível com o drawer) | 400 |
| `POST /api/v1/categories` | `CreateCategorySchema` | `201 { category: CategoryDTO }` | 400 (Zod) · 409 `DUPLICATE_CATEGORY_NAME` · 422 `CATEGORY_LIMIT_REACHED` |
| `PATCH /api/v1/categories/:id` | `UpdateCategorySchema` | `200 { category }` | 404 · 409 `VERSION_CONFLICT` · 409 `DUPLICATE_CATEGORY_NAME` · 422 `CATEGORY_ARCHIVED` |
| `POST /api/v1/categories/:id/archive` | `CategoryStateSchema` | `200 { category }` | 404 · 409 `VERSION_CONFLICT` · 409 `ALREADY_ARCHIVED` · 422 `LAST_ACTIVE_CATEGORY` |
| `POST /api/v1/categories/:id/unarchive` | `CategoryStateSchema` | `200 { category }` | 404 · 409 `VERSION_CONFLICT` · 409 `NOT_ARCHIVED` |

Mensagens exatas:
- `DUPLICATE_CATEGORY_NAME`: "Já existe uma categoria com este nome"; se a existente está arquivada: **"Já existe uma categoria arquivada com este nome"** com `details: { archived: true, categoryId }` (a UI oferece *Reativar*).
- `CATEGORY_LIMIT_REACHED`: "Limite de 40 categorias por tipo atingido".
- `LAST_ACTIVE_CATEGORY`: "Mantenha ao menos uma categoria de despesa ativa" / "…de receita ativa" (conforme `kind`).
- `VERSION_CONFLICT`: "Esta categoria foi alterada por {Nome}. Recarregue para continuar." (`details: { currentVersion, updatedBy }`).
- `PATCH` sem diferença efetiva → `200` sem mudar `version`.

---

## 4. Regras e algoritmos

### 4.1 `createCategory` (transação)
1. `pg_advisory_xact_lock` `(familyId, kind)`; contar categorias do tipo; `>= 40` → `CATEGORY_LIMIT_REACHED`.
2. `INSERT` (`sortOrder` da §1, `version = 1`, `updatedByMemberId = ctx.memberId`); violação do índice único ⇒ buscar a existente (mesma família/tipo/nome normalizado) e devolver `DUPLICATE_CATEGORY_NAME` (variante "arquivada" se `archivedAt != null`).
3. Devolver `201`.

### 4.2 `updateCategory`
Carregar da família (`404`); arquivada → `CATEGORY_ARCHIVED`; sem diferença → `200`; `UPDATE … WHERE id AND "familyId" AND version = :v SET name/icon, version = version + 1, "updatedByMemberId"` (0 linhas → `VERSION_CONFLICT`; violação de unicidade ⇒ `DUPLICATE_CATEGORY_NAME`). Renomear vale para todo o histórico (a FK é o `id`).

### 4.3 `archiveCategory` / `unarchiveCategory`
`archive`: advisory lock `(familyId, kind)`; já arquivada → `ALREADY_ARCHIVED`; ativas do tipo `<= 1` → `LAST_ACTIVE_CATEGORY`; `UPDATE … SET "archivedAt" = now(), version + 1 WHERE … AND version = :v`. `unarchive`: `NOT_ARCHIVED` se ativa; limpa `archivedAt`, `version + 1`. Nenhuma linha de `Transaction`/`PlannedExpense` é tocada.

### 4.4 Consumidores
- `listCategories(kind?, includeArchived = false)`: base do drawer (SDD-001 §5.1) e do extrato (filtro com `includeArchived: true`; o rótulo "(arquivada)" vem de `archived`).
- `TransactionDTO.category` (SDD-001 §2) ganha `archived: boolean` para o extrato rotular.

---

## 5. Dados
Migração `us014_categorias` (modelo-de-dados §7.2–§7.3): `version`, `updatedAt`, `updatedByMemberId` e o índice único funcional. Sem *seed* novo (as 11 padrão existem).

## 6. UI
- Rota `/categorias` (item no menu "Mais"/Família e atalho no fim da grade do drawer). **Abas** Despesa | Receita (estado na URL `?kind=`). Lista (ícone `CategoryIcon`, nome, "⋯": Renomear, Mudar ícone, Arquivar). Seção recolhida **Arquivadas (n)** só quando `n > 0`, com *Reativar*.
- *Drawer* Nova categoria: nome + grade de ícones (`role="radiogroup"`, 44 px, foco visível); erro por campo com a mensagem do Zod; duplicada-arquivada mostra o botão *Reativar* (chama `unarchive` com `details.categoryId`).
- Mutação de arquivar: toast "Categoria arquivada" com **Desfazer** por 5 s (chama `unarchive` com a `version` devolvida).
- Estados: skeleton, erro com "Tentar de novo", enviando, sem conexão (padrão SDD-000 §7), 409 com diálogo e *Recarregar*.
- **Chaves de cache**: `["categories", kind, { includeArchived }]`; toda mutação invalida o prefixo `["categories"]`, além de `["transactions"]` (rótulos renomeados) e `["home"]`.

## 7. Segurança e isolamento
`familyId` da sessão; `Category` de outra família → `404`; `.strict()` rejeita `familyId`, `archivedAt`, `sortOrder`. Sem logs com nomes de categoria.

## 8. Testes obrigatórios (BDD → teste)

| Cenário BDD | Testes |
| :-- | :-- |
| Criar categoria de despesa | **I**: `POST` → 201, `version 1`, `sortOrder` = max + 1, aparece em `GET ?kind=EXPENSE` por último. **E**: criar "Pet" com ícone de patinha; aparece no fim da grade do drawer. |
| Usar a categoria nova em um lançamento | **I**: `POST /transactions` com a nova categoria → 201. **E**: lançar "R$ 120,00" em "Pet". |
| Mesmo nome em tipos diferentes | **I**: "Presentes" EXPENSE e INCOME → 2×201. |
| Nome duplicado no mesmo tipo | **I**: `" supermercado "` → 409 `DUPLICATE_CATEGORY_NAME` com a mensagem exata; corrida (`Promise.all`, chaves diferentes) → 1×201 e 1×409. **E**: mensagem exibida. |
| Nome igual ao de uma arquivada | **I**: 409 com `details.archived = true`. **E**: botão "Reativar". |
| Nome muito curto / longo | **U**: schema `"A"` → "Informe um nome com ao menos 2 caracteres"; 31 caracteres → "O nome deve ter no máximo 30 caracteres". **I**: 400, nada criado. |
| Renomear preserva o histórico | **I**: `PATCH name` → 200, `version 2`; a despesa existente lista a categoria com o nome novo; `ledgerTotals` por categoria igual. **E**: extrato mostra "Mercado". |
| Arquivar categoria em uso | **I**: `archive` → some de `GET /categories`, aparece com `includeArchived`; lançamento existente mantém a categoria; `POST /transactions` com ela → 422 `INVALID_REFERENCE`; `PATCH` do lançamento mantendo a categoria arquivada (sem enviar `categoryId`) → 200. **E**: some da grade; filtro do extrato lista "(arquivada)". |
| Reativar | **I**: `unarchive` → volta a `GET /categories`; repetir → 409 `NOT_ARCHIVED`. **E**: volta à grade. |
| Não arquivar a última do tipo | **I**: tipo com 1 ativa → 422 `LAST_ACTIVE_CATEGORY` com a mensagem do tipo; corrida de 2 arquivamentos com 2 ativas → 1×200 e 1×422 (sempre sobra 1). |
| Limite de categorias por tipo | **I**: 40 despesas → 41ª → 422 `CATEGORY_LIMIT_REACHED`; o limite conta arquivadas. |
| Conflito de edição | **I**: dois `PATCH` com a mesma `version` em `Promise.all` → 1×200 e 1×409 com "Esta categoria foi alterada por Mariana. Recarregue para continuar."; o perdedor não grava. |
| Membro comum também gerencia | **I**: MEMBER cria/renomeia/arquiva → 2xx. |
| Falha de rede ao salvar | **E**: `route.abort()` no `POST` → mensagem padrão, campos preservados, reenvio usa a mesma chave e cria 1 categoria. |
| Isolamento entre famílias | **I**: teste padrão (SDD-000 §9.4) em `GET/PATCH/archive/unarchive /categories`. |
| (infra) Idempotência | **I**: `Promise.all` com a mesma chave → 1 categoria; mesma chave com corpo diferente → 422 `IDEMPOTENCY_KEY_REUSED`. |
| (infra) `.strict()` | **I**: corpo com `familyId`/`archivedAt` → 400. |
| (infra) Ícones | **U**: toda chave de `CATEGORY_ICON_KEYS` tem ícone em `category-icon.tsx`; chave fora da lista → 400. |
| (infra) Atomicidade | **I**: falha injetada após o `INSERT` → nada persiste. |

## 9. Estimativa e dependências
| História | PO | TL | Observação |
| :-- | :-: | :-: | :-- |
| US-014 | 3 | **3** | 5 rotas finas, advisory lock, tela com abas e galeria de ícones, 1 migração pequena |
Depende de US-002/US-005 (já entregues). **Primeira a cortar** na R2. Nenhuma outra história da R2 depende dela (arquivar apenas afeta o que o drawer e o cadastro de previstas listam).
