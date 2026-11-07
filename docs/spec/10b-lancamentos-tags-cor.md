# Spec 10b — Tags e cor de conta/cartão

Atualizado: 2026-10-31. Complementa a spec 10a (Lançamentos, contas, extrato).

## Resumo
- Tags livres no lançamento (US-045) e filtro do Extrato por tag (US-047) implementadas; gerenciar tags (US-046) implementada; Análise (US-048/049) não.
- Cada conta e cartão tem uma cor (10 opções, US-050), sempre ao lado do nome.

## Regras
| # | Regra | Onde |
| :-- | :-- | :-- |
| 24 | Tags da família; `nameKey = normalizeTagKey(nome)` (NFD sem marcas, minúsculas, espaços e `--` => `-`) ÚNICA por família; `name` = 1ª grafia já com espaços => hífen ("Viagem  Nordeste" => "Viagem-Nordeste") | `tags/{normalize,schemas,service}.ts` |
| 24b | 2..30 caracteres (pontos de código); só letras, números, `-`, `_`, `.` (e espaço); "viajem" != "viagem". `tags: string[]` (até 20, dedup por chave) em `POST/PATCH /transactions` | `tags/schemas.ts` |
| 24c | Servidor faz upsert NA transação do lançamento (`ON CONFLICT DO NOTHING` por `nameKey` em ordem + `SELECT ... FOR SHARE`): 10 criações simultâneas = 1 tag | `tags/service.ts` |
| 24d | Transferência/acerto/pagamento rejeitam `tags` (400, `.strict()`); gatilho `transaction_tags_kind` barra ligação a outro tipo. Parcelada: a tag vale para todas as parcelas. Tabelas `tags`/`transaction_tags` FORA do ledger (permitem `DELETE`). `TransactionDTO.tags` = nomes | `tags/*` |
| 24e | UI: linha "+ Tag" recolhida (`TagInput`: Enter/vírgula/"Criar tag", sugestão `GET /tags?q=` por prefixo, debounce 200 ms); 4ª tag = aviso "Muitas tags dificultam a análise"; limite duro 20 | `components/tag-input.tsx` |
| 25 | `PATCH` com `tags` SUBSTITUI o conjunto (`[]` limpa; ausente não toca); revisão `UPDATE` com `{field:"tags", from, to}` (nomes) e `version + 1`; mesmo conjunto = 200 sem revisão | `transacoes/mutations.ts` |
| 25b | Só-tags NÃO é barrada por mês acertado, fatura paga, conta arquivada nem parcela (exige "Só meu"/dono como qualquer edição; lançamento excluído = 422 `TRANSACTION_DELETED`). Parcelada: trava o plano `FOR UPDATE` e aplica a TODAS as parcelas (revisão e `version` por parcela ativa; versão conferida = a da parcela alvo) | `transacoes/mutations.ts` |
| 25c | UI: edição manda só `{version, tags}` quando nada financeiro mudou; o detalhe tem "Editar tags" (vale em parcela) | `transaction-drawer.tsx` |
| 26 | Filtro por tag: `tagIds` = `EXISTS` em `buildLedgerWhere` (lista e totais; NUNCA `JOIN`; lançamento com duas tags aparece e soma uma vez) | `transacoes/extrato.ts` |
| 26b | `untagged=true` = só despesa/receita sem tag (chip "Sem tag"); `untagged` com `tagIds` = 400 `Use tags ou "sem tag", não os dois`. Plurais OU-dentro/E-entre: `categoryIds`, `payerIds`, `sourceIds` (conta ou cartão), máx. 20 valores; parâmetro repetido vira array (`withApi`) | `extrato/{filters,tag-filter}` |
| 26c | Estado do filtro na URL (`tagIds` repetido); chips fora do painel; vazio = "Nenhum lançamento com essa tag neste período" | `extrato/*` |
| 27 | Privacidade: exportação "Baixar meus dados" inclui `tags` (nomes) em cada lançamento visível; excluir família apaga `transaction_tags` e `tags` antes de `transactions`. `FamilyEventType` tem `TAG_RENAMED/MERGED/DELETED` (usados pela US-046) | `privacidade/{export,delete-family}.ts` |
| 27b | Gerenciar (US-046, qualquer membro, `Idempotency-Key`): `PATCH /tags/:id {version,name}` (mesma `nameKey` = só `name`; colisão 409 `TAG_NAME_EXISTS` com `details{mergeIntoId,mergeIntoName}`), `POST /tags/:id/merge {version,intoId}` (travas `FOR UPDATE` por `id` crescente, `ON CONFLICT DO NOTHING`, `movedCount` = ligações novas, mesma tag 422 `TAG_MERGE_SAME`), `POST /tags/:id/delete {version}` (`removedFromCount` = lançamentos ativos). `FamilyEvent` TAG_*; `VERSION_CONFLICT` cita o autor; outra família 404; nunca toca `transactions`/ledger | `tags/{manage,schemas}.ts`, `api/v1/tags/[id]` |
| 27c | `GET /tags`: `usageCount` = lançamentos ativos distintos; `TagDTO.updatedBy` = `memberId`. UI `/tags` (menu Configurações): lista por uso, Renomear/Mesclar/Remover, oferta "Mesclar X nela?" na colisão | `(app)/tags/*` |
| 28 | Cor: enum fechado `AccountColor` (10 cores; nomes em `ACCOUNT_COLOR_LABEL`), `color` NOT NULL (DEFAULT `BLUE`) em contas e cartões; só conta/cartão | `contas/colors.ts` |
| 28b | `POST` sem `color` => `pickNextColor` (1ª não usada entre contas/cartões não excluídos, arquivados contam; senão a menos usada); pode repetir. `PATCH` de conta e cartão aceita `color`; fora da paleta 400 "Escolha uma cor"; arquivar mantém. DTOs trazem `color` | `contas/colors.ts` |
| 28c | UI: `SourceBadge` (ponto `aria-hidden` + nome), `ColorPicker`, `SourceSelect` (seletores nativos mostram o ponto só da opção ESCOLHIDA; filtros do Extrato e edição de lançamento sem ponto); contraste >= 3:1 lido do `globals.css` (mín. 3,01:1 claro, 5,21:1 escuro) | `components/{source-badge,color-picker,source-select}.tsx`, `lib/contrast.ts` |
| 28d | `UpdateAccountSchema` = `RenameAccountSchema` + `color`; mantém "Informe o que alterar" | `contas/schemas.ts` |

## Invariantes
1. `tagIds` nunca via `JOIN`; totais e lista usam o mesmo `EXISTS`.
2. Tag só em despesa/receita (gatilho + `.strict()`).
3. Toda conta/cartão tem `color` válida; a cor nunca é o único identificador (sempre ao lado do nome).

## Análise sintética (US-048)
- `GET /api/v1/analysis` (família): período (`period` ou `from/to` até 24 meses; padrão = mês atual), `type` EXPENSE|INCOME, filtros plurais. Totais por `ledgerTotals` e linhas por `buildLedgerWhere` (mesmo predicado do Extrato/Resumo); `groupBy` ≠ category = 400 até a US-049.
- Linhas por categoria (inclui arquivadas), valor desc e rótulo asc; `permille = apportion(1000, valores)` (soma exata); `drillUrl` = `/extrato?...` com o mesmo período/tipo/filtros. Tela `/analise`; cache `["analysis", params]` invalidado após mutação de lançamento.

## Riscos aceitos
- Criar lançamento concorrente com a tag de origem de uma mesclagem pode perder essa tag no novo lançamento (nunca deixa ligação órfã).

## Fontes
Código: `analise/{schemas,service,rows,drill,hooks}.ts`, `api/v1/analysis`, `(app)/analise`, `tags/{normalize,schemas,service,hooks}.ts`, `api/v1/tags`, `tags/manage.ts`, `(app)/tags`, `components/tag-input.tsx`, `transacoes/{mutations,extrato}.ts`, `extrato/{filters,tag-filter}`, `contas/{colors,use-suggested-color}.ts`, `lib/contrast.ts`, `components/{source-badge,color-picker,source-select}.tsx`, `privacidade/{export,delete-family}.ts`.
Testes: int `us-045-tags`, `us-046-gerenciar-tags`, `us-047-filtro-tags`, `us-050-cores` (com backfill); unit `tags/normalize`, `contas/colors`, `ui/{colors-contrast,color-picker}`; int `us-048-analise-sintetica`; E2E `US-048`, `US-045`, `US-046`, `US-047`, `US-050`.

## Pendências
- Análise: US-048 feita (só quebra por categoria); US-049 (membro/conta/tag, filtros combináveis) não iniciada; US-045/046/047/050 aguardam validação do Gestor.
- Divergência: migração de `color` tem `DEFAULT 'BLUE'` (compatibilidade com o código anterior).
