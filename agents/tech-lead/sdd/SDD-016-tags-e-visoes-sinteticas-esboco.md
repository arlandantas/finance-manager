# SDD-016: Tags e visões sintéticas (US-045, US-046, US-047, US-048, US-049) — **ESBOÇO** (R3)

- **Histórias**: [US-045](../../product-owner/backlog/stories/US-045-tags-livres-no-lancamento.md) · [US-046](../../product-owner/backlog/stories/US-046-gerenciar-tags.md) · [US-047](../../product-owner/backlog/stories/US-047-filtrar-extrato-por-tag.md) · [US-048](../../product-owner/backlog/stories/US-048-visao-sintetica-periodo-totais-e-categoria.md) · [US-049](../../product-owner/backlog/stories/US-049-visao-sintetica-quebras-e-filtros.md)
- **Fluxo**: [FLUXO-014](../../product-owner/flows/FLUXO-014-parcelamento-tags-e-analise.md)
- **Rastreabilidade**: NEED-013 (RN-013.1..6), NEED-016 (RN-016.1..5), NEED-006 · Q-F09, Q-F10, Q-F12 · D-PO-28, D-PO-29 · [SDD-005](SDD-005-extrato-e-home.md), [SDD-010](SDD-010-resumo-do-mes-ocultar-valores-e-preferencias.md) (predicado único; reconciliação), [ADR-017](../adrs/ADR-017-parcelamento-no-cartao-e-competencia.md) (parcela por competência)
- **Status**: **Esboço** · Autor: Agente Tech Lead · Estimativas: **US-045 = 5 · US-046 = 3 · US-047 = 2 · US-048 = 5 · US-049 = 5**

## 1. Decisões (respostas às perguntas do PO)
| Pergunta | Resolução |
| :-- | :-- |
| Normalização por caixa e acentos e unicidade por família | `normalizeTagKey(name)`: `NFD`, remover marcas combinantes (`\p{M}`), minúsculas, `trim`, espaços internos ⇒ `-`. Coluna `nameKey` **única por família**; `name` guarda a **grafia original** da 1ª criação. Sem extensão `unaccent`. "viajem" ≠ "viagem" (só sugestão ao digitar, por prefixo sobre `nameKey`). 2..30 caracteres (após `trim`). |
| N:N e índices | `tags (id, familyId, name, nameKey, version, createdAt)` · `transaction_tags (transactionId, tagId, familyId)` PK `(transactionId, tagId)`; FKs compostas; índices `(familyId, tagId)` e `(transactionId)`. Só `EXPENSE`/`INCOME` (CHECK por *trigger* de consistência: `kind` da transação). |
| Criar ao digitar | `tags: string[]` (nomes) em `POST/PATCH /transactions`; o servidor faz *upsert* por `nameKey` na mesma transação e devolve as tags canônicas. Concorrência: `INSERT … ON CONFLICT (familyId, nameKey) DO NOTHING` + `SELECT`. |
| Editar só tags em mês acertado | `PATCH` cujo único campo é `tags` **não** dispara a confirmação da US-013b e **não** exige `version` financeira do acerto (grava revisão `UPDATE` com campo `tags`, marcada não financeira). |
| Mesclagem atômica e idempotente | `POST /tags/:id/merge { version, intoId }`: trava as duas tags em ordem de `id`; move `transaction_tags` ignorando duplicadas (`ON CONFLICT DO NOTHING`), apaga as órfãs e a tag de origem; resposta idempotente por `Idempotency-Key` (24 h). Remover tag **nunca** apaga lançamentos (só `transaction_tags`). Renomear para `nameKey` existente ⇒ `409 TAG_NAME_EXISTS` (`details.mergeIntoId`) e a UI oferece a mesclagem. |
| Filtro "qualquer das tags" sem duplicar linhas e totais | `EXISTS (SELECT 1 FROM transaction_tags tt WHERE tt."transactionId" = t.id AND tt."tagId" = ANY($tagIds))` dentro de `buildLedgerWhere` (lista **e** totais): nenhuma junção que multiplique linhas. Filtros na URL (`tagIds` repetido). |
| Consulta única parametrizada da Análise | `GET /api/v1/analysis?period=&from=&to=&groupBy=category\|member\|account\|tag&type=EXPENSE\|INCOME&accountId=&memberId=&categoryId=&tagIds=` → **uma** função `analyze()` sobre `buildLedgerWhere`/`periodPredicate` (a mesma do Extrato), `GROUP BY` conforme `groupBy` (conta/cartão usa `COALESCE(accountId, cardId)`). `groupBy=tag`: `LEFT JOIN transaction_tags` + linha "Sem tag"; **a soma das linhas pode exceder o total** (aviso na UI); **o total vem de consulta separada sem junção**. Intervalo ≤ 24 meses (`400 "Escolha um intervalo de até 24 meses"`). Participação: `apportion(1000, valores)` ⇒ décimos com soma exata 100,0%. |
| Propriedade "soma da Análise = soma do Extrato" | Teste de propriedade com ≥ 200 conjuntos aleatórios (inclui parcelas por competência, compras no cartão, transferências/acertos/pagamentos de fatura, excluídos e várias tags): `total` e cada linha de `groupBy ≠ tag` == `GET /transactions` com os mesmos filtros; `Σ linhas = total` quando `groupBy ≠ tag`. |
| Custo com N:N e parcelas | Uma consulta por `groupBy`; índices acima; medir com 50 mil lançamentos (p95 < 300 ms; abaixo do orçamento do SDD-005). Parcelas entram **por competência** automaticamente (predicado único). |

## 2. Contratos (rascunho)
```typescript
export const TagNameSchema = z.string().trim().min(2, "A tag precisa ter entre 2 e 30 caracteres").max(30, "A tag precisa ter entre 2 e 30 caracteres");
export type TagDTO = { id: string; name: string; usageCount: number; version: number };
export const RenameTagSchema = z.object({ version: versionSchema, name: TagNameSchema }).strict();
export const MergeTagSchema  = z.object({ version: versionSchema, intoId: uuidSchema }).strict();
// TransactionDTO.tags: Array<{ id; name }> ; Create/Update: tags?: z.array(TagNameSchema).max(20)  (sugestão de 3 só na UI)
export type AnalysisDTO = {
  period: { from: string; to: string }; totals: { incomeInCents; expenseInCents; resultInCents };
  groupBy: "category"|"member"|"account"|"tag"; rows: Array<{ key: string; label: string; amountInCents: number; permille: number | null; drill: string /* URL do Extrato */ }>;
  tagOverlapNotice: boolean;
};
```
Rotas: `GET /tags`, `PATCH /tags/:id`, `POST /tags/:id/merge`, `POST /tags/:id/delete`, `GET /analysis`. Qualquer membro gerencia tags (D-PO-04/28). `Money` e `useHideValues` herdados (barras ficam; valores mascarados; percentuais visíveis).

## 3. Dados (migração `us045_tags`; `modelo-de-dados.md` §9)
`tags`, `transaction_tags`, índices e FKs compostas; sem alterar `transactions`.

## 4. Testes principais
Unidade (`normalizeTagKey`: "Viagem"="viagem"="Viágem", "Café"="cafe", "viajem"≠"viagem"; `apportion(1000, [700,300,200])` ⇒ 583/250/167 com soma 1000); integração (upsert concorrente de 10 criações ⇒ 1 tag; mesclagem idempotente e atômica com falha injetada; remover tag mantém lançamentos e totais; filtro com 2 tags conta o lançamento 1 vez; isolamento por família; `Idempotency-Key`); propriedade da reconciliação; E2E dos BDD (quarta tag avisa mas salva; tag em parcelada vale para todas; tag em mês acertado sem aviso; intervalo > 24 meses).

## 5. Impacto
`transacoes/{schemas,service,extrato,repo}.ts` (`tags`, filtro, DTO), novo módulo `tags/`, novo `analise/`, Extrato (chips, filtros), menu "Análise" e "Configurações > Tags", `tests/support/factories.ts` (`tags`), `check:imports` (módulo puro `tags/normalize`).
