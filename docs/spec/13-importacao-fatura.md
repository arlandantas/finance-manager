# Spec 13 — Importação de fatura (CSV e PDF)

Atualizado: 2026-11-08 · Situação: US-066 entregue (flag, `preview` do CSV, parser local, `importToken`) e US-066b (preview do PDF: `unpdf`, linhas redigidas, `previewHash`; resposta `{ source, lines:[{ref,text}], previewHash, estimate? }`); US-066c (rota `extract`: `runLlm` `INVOICE_IMPORT`, consentimento v1, reconciliação, Fake; cota diária devolvida se o teto recusar); US-067 entregue (migração `import_batches`, `buildDraft`, `reconcileTotal`, `importKey`; preview e extract devolvem o rascunho enriquecido); US-068 entregue (`POST /invoice-imports`: lote atômico, `confirm-service.ts`, exportação `importacoes[]`); PLANEJADAS 067b, 069 (ADR-042).

## Resumo
- No cartão, o membro escolhe a fatura alvo (aberta ou fechada não paga) e envia um CSV ou PDF. O app extrai os itens, o membro revisa e confirma; só a confirmação grava, num lote atômico que pode ser desfeito inteiro.
- CSV: parser local, sem IA. PDF: texto extraído no servidor, linhas candidatas anonimizadas vão à Anthropic com opt-in próprio (`INVOICE_IMPORT`).
- Itens importados nascem "Só meu", pagador = titular do cartão, `origin = INVOICE_IMPORT`, selo "Importado da fatura". O acerto não muda.
- Flag `INVOICE_IMPORT_ENABLED` (padrão `false`): desligada, ação oculta e rotas 404.

## Rotas (todas `server-only`, sessão + `familyId`, corpo/campos `.strict()`, mutações com `Idempotency-Key`)
| Rota | Faz |
| :-- | :-- |
| `POST /api/v1/cards/:id/invoice-imports/preview` (multipart `file`, `invoiceRef`, `password?`; sem `Idempotency-Key`: não grava) | Valida e extrai. CSV: devolve o rascunho direto. PDF: devolve linhas redigidas + `previewHash` + estimativa de custo (só Administrador vê valor); não chama o LLM |
| `POST /api/v1/cards/:id/invoice-imports/extract` (mesmo arquivo + `previewHash`) | Só PDF: chama `runLlm` (`INVOICE_IMPORT`), reconcilia e devolve o rascunho |
| `POST /api/v1/cards/:id/invoice-imports` (JSON) | Confirma e grava o lote (US-068) |
| `GET /api/v1/cards/:id/invoice-imports` | Lista os lotes do cartão (US-069) |
| `POST /api/v1/import-batches/:id/revert` | Desfaz o lote (US-069) |

## Regras
| # | Regra |
| :-- | :-- |
| 1 | Formato pelos bytes: `%PDF-` = PDF; texto UTF-8/Latin-1 sem NUL com cabeçalho reconhecido = CSV; outro = 415 `IMPORT_FORMAT_NOT_ACCEPTED` ("Formato não aceito. Envie PDF ou CSV."). |
| 2 | Limites: arquivo ≤ 4 MB (413 `IMPORT_FILE_TOO_LARGE`), PDF ≤ 30 páginas, CSV ≤ 3000 linhas, ≤ 300 itens, payload ≤ 400 linhas e 48 KB (413 `IMPORT_TOO_LARGE`). |
| 3 | Fatura alvo: do cartão, ativa, OPEN ou CLOSED sem pagamento ativo; paga = 422 `INVOICE_PAID_LOCKED`; cartão arquivado = 422 `INVALID_REFERENCE`; `invoiceRef` futuro além da aberta = 422 `INVOICE_REF_INVALID`. |
| 4 | CSV: separador `;`/`,`, decimal `1.234,56` ou `1234.56`, datas `dd/mm/aaaa`, `dd/mm` (ano pela fatura alvo) ou ISO. Cabeçalho reconhecido por sinônimos (data; descrição/estabelecimento/histórico; valor). Valor negativo = `CREDIT`. Sem as 3 colunas: 422 `CSV_COLUMNS_NOT_FOUND`. |
| 5 | PDF: texto por `unpdf`; sem texto útil = 422 `IMPORT_UNREADABLE`; protegido sem/errado senha = 422 `PDF_PASSWORD_REQUIRED`. Senha nunca em log, banco ou resposta. |
| 6 | Linhas candidatas e redação (ADR-042 §4): função pura `redactInvoiceLines(lines, people)`; a pré-visualização mostra exatamente o que será enviado; `previewHash` = SHA-256 do JSON canônico enviado. |
| 7 | PDF exige `AI_FEATURES_ENABLED`, consentimento efetivo `INVOICE_IMPORT` (texto v1) e teto (ADR-028); falhas (códigos existentes de `ia/errors.ts`): 503 `AI_UNAVAILABLE`, 409 `AI_DISABLED` (sem consentimento), 422 `LLM_BUDGET_EXCEEDED`/`LLM_ESTIMATE_EXCEEDS_BUDGET`, 503 `LLM_UNAVAILABLE`, 502 `LLM_INVALID_RESPONSE`; 10 extrações/família/dia (429 `IMPORT_DAILY_LIMIT`). |
| 8 | `isInvoice=false` ou zero itens = 422 `NOT_AN_INVOICE` ("Este arquivo não parece uma fatura de cartão."). |
| 9 | Avisos sem bloquear (`warnings[]`): `PERIOD_MISMATCH` (fechamento/vencimento do arquivo ≠ fatura alvo), `TOTAL_MISMATCH`. Final do cartão não é conferido: `CreditCard` não guarda dígitos (fora de escopo). |
| 10 | Reconciliação (PDF): `line` deve existir; valor e data têm de aparecer naquela linha, senão `needsAttention`; descrição que não é trecho normalizado da linha é trocada pelo texto da linha (2..100). |
| 11 | Rascunho (US-067): cada item ganha `selected`, `group`, `categoryId`, `payerMemberId`, `flags`. Padrões: `PURCHASE` marcado; `FEE` grupo "Encargos", desmarcado; `CREDIT` grupo "Estornos e créditos", não selecionável; `PAYMENT` grupo "Pagamento da fatura", não selecionável. |
| 12 | Categoria sugerida: regra local por `normalizeDescription` (lançamentos de despesa da família nos últimos 12 meses, maioria ≥ 50 %, sem LLM); sem histórico = categoria ativa "Outros"; sem "Outros" = `needsAttention` (categoria é obrigatória). Histórico e links de duplicado só com o que o membro enxerga ("Só meu" alheio fica de fora); parcelas fora da contagem. |
| 13 | Duplicados: `ALREADY_IMPORTED` (mesmo `importKey` ativo) e `ALREADY_POSTED_PARCEL` (parcela ativa do mesmo cartão, fatura alvo, n/N e valor) = não selecionáveis; `POSSIBLE_DUPLICATE` (mesmo cartão, mesmo valor, data ±3 dias, descrição normalizada igual ou contida) = desmarcado, selecionável, com link. Arquivo com lote ativo de mesmo `fileHash` = aviso "Este arquivo já foi importado em dd/mm" e nada selecionável (`alreadyImportedAt` + aviso `FILE_ALREADY_IMPORTED`; lote revertido libera). Sem sinal `selectable` no item: `isItemSelectable` (`groups.ts`) deriva de `kind` e `flags`. |
| 14 | Conferência de total (função pura `reconcileTotal`, BigInt): `itemsTotal = Σ PURCHASE + Σ FEE − Σ CREDIT` (todos os extraídos), `selectedTotal = Σ selecionados`, `difference = declaredTotal − itemsTotal`; `PAYMENT` nunca entra. Recalculada no cliente a cada edição com a mesma função; `difference ≠ 0` com total declarado = aviso `TOTAL_MISMATCH`. |
| 15 | Parcela `n/N` (1 ≤ n ≤ N, 2 ≤ N ≤ 24): grava `InstallmentPlan` com `installmentCount=N`, `paidBeforeAppCount=n-1`, `totalInCents = valor × N`, parcela n na fatura alvo e n+1..N nas seguintes. Âncora = `addMonthsClamped(data da linha, n-1)` se cair no ciclo da fatura alvo e não for futura; senão o último dia válido do ciclo (≤ hoje). |
| 16 | Confirmar: rejeita item sem categoria, valor ≤ 0, data futura, descrição fora de 2..100, item de grupo não selecionável (422 `IMPORT_ITEM_INVALID` com índice). Pagador: membro ativo da família (inclui sem conta), com as mesmas checagens de autoria do lançamento manual. |
| 17 | Lote (ADR-042 §10): uma transação; ordem de travas = família (rateio) → cartão `FOR SHARE` → faturas `FOR UPDATE` por `ref` crescente. Erros: `IMPORT_TOKEN_INVALID` (422; vencido, outra família/cartão), `IMPORT_ALREADY_EXISTS` (409, com `importedAt`), `IMPORT_ITEM_DUPLICATE` (409, índice), `INVOICE_PAID_LOCKED`. |
| 18 | Reversão (ADR-042 §11): lotes listados com data, quem, nº de itens, total e situação; `revert` exclui logicamente todos os lançamentos e planos ativos do lote com `deletedAt = revertedAt` e `deletionReason=DELETED`; item excluído antes fica como está. Itens com `version > 1`: 409 `IMPORT_EDITED_ITEMS` (`details.items`) sem `confirmEditedItems:true`. Repetir: 200 sem efeito. |

## Contratos (Zod, `.strict()` em todos os níveis; centavos inteiros)
- `ImportDraftItem { idx, occurrence (ordinal ≥ 1 entre itens idênticos do ARQUIVO), line?, date: "YYYY-MM-DD" | null, description, amountInCents: int > 0 | null, kind: "PURCHASE"|"FEE"|"CREDIT"|"PAYMENT", installment: { no, count } | null, selected, group, categoryId | null, payerMemberId, flags: ("NEEDS_ATTENTION"|"ALREADY_IMPORTED"|"ALREADY_POSTED_PARCEL"|"POSSIBLE_DUPLICATE")[], duplicateOf?: transactionId }`.
- `ImportDraft { importToken, source: "CSV"|"PDF", fileHash, invoiceRef, declared: { closingDate?, dueDate?, totalInCents? }, items[], totals: { itemsTotal, selectedTotal, difference }, warnings[], alreadyImportedAt? }`. Centavos como string no JSON (padrão das DTOs).
- `ConfirmImportBody { importToken, invoiceRef, items: [{ idx, occurrence, date, description, amountInCents, kind: "PURCHASE"|"FEE", installment, categoryId, payerMemberId }] (1..300) }` ⇒ 201 `{ batch, transactions[], card, invoice, reconcileTotal }` (centavos como número, padrão das DTOs; `transactions` = a parcela n/à vista de cada item; `reconcileTotal` sobre os itens confirmados). `importKey` usa a `occurrence` do corpo (nunca recalculada no servidor; o par identidade+`occurrence` não repete no lote, senão 422). Erros por item: 422 `IMPORT_ITEM_INVALID` e 409 `IMPORT_ITEM_DUPLICATE` com `details.idx`; parcela em fatura futura paga = `INVOICE_PAID_LOCKED` com `details.ref`. O servidor confere `ALREADY_POSTED_PARCEL` só entre o que o membro enxerga ("Só meu" alheio não vaza).
- `import_batches { id, familyId, cardId, invoiceId, fileHash, source, itemCount, totalInCents, importedByMemberId, importedAt, revertedAt?, revertedByMemberId?, version }`; `Transaction.importBatchId?`, `Transaction.importKey?`; `InstallmentPlan.importBatchId?`; enum `TransactionOrigin += INVOICE_IMPORT`; `FamilyEventType += INVOICE_IMPORTED, INVOICE_IMPORT_REVERTED`.

## Invariantes
1. Nada de domínio é gravado antes de `POST .../invoice-imports`; o arquivo e a senha nunca persistem nem aparecem em log.
2. Só linhas redigidas que passaram por schema `.strict()` saem para o LLM, e só com consentimento `INVOICE_IMPORT` checado na transação da reserva; CSV nunca sai.
3. Lote é tudo ou nada; um lote ativo por (família, cartão, `fileHash`); um lançamento ativo por (família, `importKey`).
4. Σ centavos dos lançamentos criados = Σ itens confirmados (parcelas: Σ parcelas n..N = valor × (N−n+1)); `usedInCents` sobe exatamente isso e a reversão devolve o mesmo valor.
5. Itens importados nunca entram no acerto ao nascer (`splitMode NONE`); "Só meu" alheio segue as regras da spec 01.
6. `familyId`, `authorMemberId`, `importBatchId`, `importKey` e `origin` nunca vêm do cliente.

## Riscos aceitos
| ID | Risco | Razão |
| :-- | :-- | :-- |
| IMP-1 | Descrição do estabelecimento vai à Anthropic | Necessária para extrair; opt-in próprio, linhas redigidas, pré-visualização |
| IMP-2 | Redação por regra pode deixar passar um nome de terceiro numa descrição | Só linhas candidatas; teste de propriedade com dados maliciosos |
| IMP-6 | `pendingEmail` não é lido na redação (guarda SEC-058): o e-mail completo cai no regex; a parte local solta, sem `@`, pode passar | Guarda de privacidade; só em linha candidata |
| IMP-7 | Redação não cobre homóglifos gregos/cirílicos (`ΑΝΑ`), e-mail ofuscado em palavras ("fulano arroba gmail") nem nome <4 letras colado em outra palavra | Exige texto adversarial no PDF do próprio usuário, em linha candidata; o usuário vê a pré-visualização antes de enviar |
| IMP-3 | Recarregar a revisão perde o rascunho (e o custo do PDF) | Preço de não guardar nada no servidor |
| IMP-4 | Parcela com sobra de centavos na 1ª: total do plano aproximado | Corrigível por US-041 |
| IMP-5 | Estorno não vira lançamento na v1 | Ledger não tem compra negativa; aparece só na conferência |

## Fontes
ADR-042, ADR-027/028/029, ADR-014, ADR-009, ADR-007. Reuso: `ia/run.ts` (`purposeSettings`), `ia/consent-texts.ts`, `ia/fake-adapter.ts`, `analise-ia/recurring.ts` (`normalizeDescription`), `analise-ia/payload.ts` (`sanitizeCategoryLabel` como base dos nomes), `transacoes/installment-create.ts`, `transacoes/ownership.ts`, `cartoes/{cycle,invoices}.ts`, `mcp/rate-limit.ts` (`hit`). Novo módulo: `src/modules/importacao/`.

## Pendências
- Usuário: chave Anthropic de produção e teto (spec 06a, EXT-12) para o PDF; sem ela só o CSV funciona. Ligar `INVOICE_IMPORT_ENABLED` em produção.
- Sem amostras reais de fatura no repositório: parser e redação testados com fixtures sintéticas de Nubank, Itaú, Bradesco, Inter e C6 (formatos públicos).
