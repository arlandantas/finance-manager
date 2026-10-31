# SDD-030: Conta pagadora padrão do cartão (`CreditCard.paymentAccountId`, US-089)

- **História**: [US-089](../../product-owner/backlog/stories/US-089-conta-pagadora-padrao-do-cartao.md) · **Necessidade**: [NEED-032](../../stakeholder/needs/NEED-032-conta-que-paga-a-fatura-no-cartao.md) (Q-U22, Q-U23) · **Fluxo**: [FLUXO-004](../../product-owner/flows/FLUXO-004-cartao-e-fatura.md) §7 · **Pedido**: TL-U8 ([`pedidos-ao-tech-lead-uso-real.md`](../../product-owner/backlog/pedidos-ao-tech-lead-uso-real.md))
- **Base**: SDD-008 (cartão/fatura), SDD-012 §4.1 (protocolo de lock de contas), SDD-013 §6 (US-023, conta de origem), SDD-029 (`byAccount`, gancho `invoiceItem.paymentAccountId`), ADR-025 (FK composta da prevista como molde).
- **Status**: **Implementado** (TASK-092; aceito pelo Gestor, D-GES-65) · **Autor**: Agente Tech Lead · **Data**: 2026-10-26
- **Estimativa (TL)**: **3 pts** (confirma o PO; §8). **Executor**: Dev & QA, modelo **Sonnet**. **Com migração** (expand, 2 arquivos), sem job, sem rota nova.
- **Restrição**: o campo **só sugere**. Nenhum pagamento, saldo, limite, total de fatura, extrato, acerto ou Resumo muda. O pagamento da fatura (US-017b) continua exigindo `accountId` explícito no corpo.

## 1. Verificação no código (o código vence a doc)
| Achado | Consequência |
| :-- | :-- |
| `CreditCard` (`prisma/schema.prisma`) não tem conta; `PlannedExpense.paymentAccountId` já usa FK **composta** `(familyId, paymentAccountId) -> bank_accounts(familyId, id)` `ON DELETE RESTRICT`, coluna anulável (MATCH SIMPLE não exige com `NULL`). | Molde direto (§3.1). |
| `useSourceAccount` (`modules/contas/use-source-account.ts`) já tem `preferredAccountId` ("Conta prevista"): vale enquanto ativa e enquanto o usuário não escolheu. `pay-invoice-drawer.tsx` **não** o usa hoje. | A sugestão do pagamento é só passar o id do cartão e um rótulo (§5.2). Sem hook novo. |
| `archiveAccount` (`contas/archive.ts`) exige saldo 0, trava a conta `FOR UPDATE` e **não toca cartões**. `deleteAccount` só para conta nunca usada (`neverUsedAccountIds`), exclusão **lógica**. | Arquivar não precisa escrever em cartão (§2, D-TL-U8-2). Excluir limpa o vínculo (D-TL-U8-3). |
| `updateCard` trava o cartão (`FOR UPDATE`), usa `version` e só grava o que mudou; sem diferença = 200 sem subir `version`. Evento só para o titular (`CARD_OWNER_CHANGED`). | O campo entra no mesmo `wanted`/versão; evento novo `CARD_PAYER_ACCOUNT_CHANGED`. |
| `lockAccountsForPosting` (`contas/lock.ts`) faz `FOR SHARE` e recusa arquivada/excluída **depois** do lock. | Reuso para validar a conta pagadora (§4.2), com `path` ampliado. |
| `PayableInvoice`/`invoiceItem` (`previstas/payables.ts`): fatura sempre com `paymentAccountName: null`; SDD-029 §3.2 deixou o gancho `// US-089`. | É aqui que a US-089 liga (§3.5). |
| `modules/mcp/tools/previstas.ts` mapeia `payWith` de **todo** item com `paymentAccountName`. | Sem restrição, a fatura passaria a vazar `payWith` no MCP (contrato `strict`). Restringir a `PLANNED` (D-TL-U8-6). |
| `privacidade/export.ts` exporta `cartoes` com `ExportCardSchema` (`strict`). `delete-family.ts` apaga `credit_cards` **antes** de `bank_accounts`. | Exportar o vínculo (LGPD, §3.6). A ordem da exclusão da família já respeita a FK nova (sem mudança). |
| `familia-screen.tsx` e `familia/schemas.ts` listam os tipos de `FamilyEvent` com rótulo. | Acrescentar o tipo e o rótulo (§3.4). |

## 2. Decisões
| ID | Decisão |
| :-- | :-- |
| D-TL-U8-1 | Coluna `credit_cards."paymentAccountId" UUID NULL` + FK composta `ON DELETE RESTRICT`. **Sem backfill** (opcional por Q-U23; a sugestão inteligente da US-023 continua como padrão quando vazio). Migração expand: `ADD COLUMN` anulável é metadado no PostgreSQL, sem reescrita. |
| D-TL-U8-2 | **Arquivar a conta NÃO apaga o vínculo.** O DTO do cartão devolve `paymentAccount.archived = true`; a UI mostra o aviso "A conta {nome} foi arquivada" e o seletor fica **vazio** (só lista contas ativas). Efeito visível = o que o PO pediu ("campo fica vazio"); ganha-se: nenhuma escrita em cartão, nenhuma corrida de `version`, e **reativar a conta restaura a sugestão**. A sugestão do pagamento e o "A pagar" ignoram conta não ativa (§4.3). |
| D-TL-U8-3 | **Excluir a conta** (lógica, só nunca usada, só Admin) **limpa** `paymentAccountId` dos cartões que a usam, na mesma transação, com `version + 1` no cartão e um `FamilyEvent` por cartão (`reason: "ACCOUNT_DELETED"`). Exclusão é terminal; manter o id seria vínculo morto. |
| D-TL-U8-4 | **Ordem global de lock: conta antes de cartão.** `updateCard` trava a conta nova (`FOR SHARE`) **antes** do `FOR UPDATE` do cartão; `deleteAccount` já trava a conta `FOR UPDATE` e depois atualiza os cartões. Evita deadlock entre "trocar a pagadora" e "excluir a conta". |
| D-TL-U8-5 | Evento `CARD_PAYER_ACCOUNT_CHANGED` **só em mudança** (de A para B, de A para nenhuma, de nenhuma para B) e na limpeza por exclusão. Na criação do cartão **não** há evento (como no titular). Conteúdo: ids **e nomes** da conta (a conta pode ser excluída depois). Quem e quando = `actorMemberId` e `at`. |
| D-TL-U8-6 | **MCP não muda**: `previstas_do_mes` só preenche `payWith` para `type === "PLANNED"`. A fatura ganha `paymentAccountId`/`paymentAccountName` no `GET /payables` e na Início, não no assistente (mesma regra do SDD-029 D-TL-U4-4). |
| D-TL-U8-7 | Troca de pagadora **não afeta** nada já pago: o campo é lido só no momento de sugerir/exibir; nenhuma linha de `transactions` guarda a pagadora padrão (RN-032.6). |
| D-TL-U8-8 | Sem lembrete externo (e-mail/push) e sem job: o "aviso do vencimento" é só o texto "Sai da conta {nome}" no item da fatura em "A pagar"/Início. |

## 3. Contrato

### 3.1 Banco (`prisma/schema.prisma` + 2 migrações)
```prisma
model CreditCard {
  // ...
  paymentAccountId String? @db.Uuid // US-089: conta que paga a fatura (só sugere)
  paymentAccount   BankAccount? @relation(fields: [familyId, paymentAccountId], references: [familyId, id])
}
model BankAccount { /* ... */ payerForCards CreditCard[] }
enum FamilyEventType { /* ... */ CARD_PAYER_ACCOUNT_CHANGED }
```
Migração A (**isolada**, como `20261029010000_us045_enum_family_event_tags`: valor novo de enum não pode ser usado na transação que o cria): `20261030010000_us089_enum_family_event_card_payer` com `ALTER TYPE "FamilyEventType" ADD VALUE 'CARD_PAYER_ACCOUNT_CHANGED';`.

Migração B: `20261030010100_us089_card_payment_account`:
```sql
ALTER TABLE "credit_cards" ADD COLUMN "paymentAccountId" UUID;
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_familyId_paymentAccountId_fkey"
  FOREIGN KEY ("familyId","paymentAccountId") REFERENCES "bank_accounts"("familyId","id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "credit_cards_family_payer_idx" ON "credit_cards" ("familyId","paymentAccountId")
  WHERE "paymentAccountId" IS NOT NULL;   -- SQL cru: diálogo de arquivar e limpeza na exclusão
```
Rollback: `DROP INDEX`, `DROP CONSTRAINT`, `DROP COLUMN` (nada depende do valor). Os números das migrações são sugestão: o Dev usa o próximo timestamp livre.

### 3.2 Zod (`cartoes/schemas.ts`, aditivo, `.strict()` mantido)
```ts
const payerAccount = z.uuid({ error: "Escolha uma conta bancária ativa" }).nullable();
// CreateCardSchema += paymentAccountId: payerAccount.optional()      // omitido/null = sem conta
// UpdateCardSchema += paymentAccountId: payerAccount.optional()      // undefined = não mexe; null = remove
// o refine "Nada para alterar" já conta qualquer chave diferente de version
```
DTOs:
```ts
// CardDTO += 
paymentAccount: { id: string; name: string; archived: boolean } | null;
// archived=true => conta arquivada (UI mostra aviso; o seletor fica vazio). Conta excluída nunca aparece (vínculo limpo, D-TL-U8-3).

// AccountDTO (contas/schemas.ts) += 
payerForCards: Array<{ id: string; name: string }>;   // cartões ATIVOS (não arquivados/excluídos) que usam a conta
// PayableItemDTO.paymentAccountId (SDD-029) e paymentAccountName passam a valer também para INVOICE.
// ExportCardSchema (privacidade/export-schema.ts) += contaPagadoraId: z.uuid().nullable()
```
`CardDTO.paymentAccount` vem de `include: { paymentAccount: { select: { id, name, archivedAt, deletedAt } } }` no `withOwner` do repo (uma junção, sem consulta extra); `payerForCards` de **uma** consulta `creditCard.findMany({ where: { familyId, paymentAccountId: { in: ids }, archivedAt: null, deletedAt: null }, select: { id, name, paymentAccountId } })` em `listAccounts`.

### 3.3 Rotas (sem rota nova)
| Rota | Mudança | Códigos |
| :-- | :-- | :-- |
| `POST /api/v1/cards` | corpo aceita `paymentAccountId` | 201; 422 `INVALID_REFERENCE` (`paymentAccountId`: "Escolha uma conta bancária ativa") se arquivada, excluída ou de outra família; demais iguais |
| `PATCH /api/v1/cards/:id` | idem; `null` remove | 200 (sem diferença = sem mudar `version`); 409 `VERSION_CONFLICT`; 422 igual; 403 só no titular (inalterado) |
| `GET /api/v1/cards`, `GET /api/v1/cards/:id` | `paymentAccount` no DTO | 200 |
| `GET /api/v1/accounts` | `payerForCards` no DTO | 200 |
| `POST /api/v1/accounts/:id/archive` | **sem mudança** de contrato (a UI já tem `payerForCards`) | como hoje |
| `POST /api/v1/accounts/:id/delete` | limpa vínculos (D-TL-U8-3) | como hoje |
| `POST /api/v1/cards/:id/invoices/:ref/pay` | **sem mudança** (continua `accountId` obrigatório) | como hoje |
`Idempotency-Key` já vale nas escritas (`withApi`). Nenhuma permissão nova: quem edita o cartão define a pagadora; **só o titular atual troca o titular** (inalterado, RN-032.5).

### 3.4 Evento da família
`FamilyEventType += CARD_PAYER_ACCOUNT_CHANGED`; `changes`: `{ cardId, cardName, fromAccountId, fromAccountName, toAccountId, toAccountName, reason?: "ACCOUNT_DELETED" }` (campos de conta `null` quando não há). Registrar em `familia/schemas.ts` (união de tipos) e em `familia-screen.tsx` (`"definiu a conta pagadora de um cartão"`); o detalhe "{cartão}: de {A} para {B}" sai de `changes`.

### 3.5 Origem do dado em "A pagar" (liga o gancho do SDD-029)
`PayableInvoice` (`cartoes/invoice-service.ts`) ganha `paymentAccountId: string | null` e `paymentAccountName: string | null`, lidos de `card.paymentAccount` **somente se ativa** (`archivedAt === null && deletedAt === null`), senão `null` (D-TL-U8-2). `invoiceItem` troca o `null` fixo por esses campos (fim do `// US-089`). Efeito automático no `byAccount` do SDD-029: a fatura soma na conta pagadora ativa; sem conta ou conta arquivada = "Sem conta definida". **Nenhuma outra mudança no `buildByAccount`.**
`previstas-screen.tsx` (linha de item, hoje ` · Pagar com {nome}`): para `type === "INVOICE"` o texto é `Sai da conta {nome}`.

### 3.6 Exportação LGPD
`export.ts` acrescenta `contaPagadoraId: c.paymentAccountId` em `cartoes`; `ExportCardSchema` ganha o campo (o teste de contrato do export quebra de propósito se faltar). Sem nome (o id basta; a conta já está em `contas`).

## 4. Regras de serviço

### 4.1 Criar e atualizar (`cartoes/service.ts`)
1. `createCard`: se `paymentAccountId` informado, valida (§4.2) **antes** do `insert`; grava no `insert`. Sem evento.
2. `updateCard`: se `input.paymentAccountId` é uma conta (não `null`/`undefined`) **e** difere de `row.paymentAccountId`, travar a conta (§4.2) **antes** do `lockForUpdate` do cartão (D-TL-U8-4). Se igual ao atual (inclusive arquivada), **não valida** e entra no "sem diferença": renomear um cartão cuja pagadora foi arquivada não falha.
3. `wanted.paymentAccountId` só quando difere (`undefined` não mexe; `null` remove). Gravar com `updateVersioned` (mesma `version`, mesmo `updatedByMemberId`).
4. Se mudou: `tx.familyEvent.create({ type: "CARD_PAYER_ACCOUNT_CHANGED", actorMemberId, changes })` com nomes lidos na hora (conta antiga pode estar arquivada; nome ainda existe).

### 4.2 Validação da conta
`lockAccountsForPosting(tx, familyId, [id], "paymentAccountId")` (acrescentar `"paymentAccountId"` ao `path` do tipo) lança `422 INVALID_REFERENCE` para arquivada, excluída ou inexistente na família. Mensagem do campo: usar a do `lockAccountsForPosting` ("Escolha uma conta") **ou** capturar e trocar por "Escolha uma conta bancária ativa" (o Dev escolhe; o teste checa o `path`, não o texto).

### 4.3 Onde o vínculo vale (e onde é ignorado)
| Consumidor | Regra |
| :-- | :-- |
| Sugestão do pagamento (UI) | Conta ativa = pré-seleção; arquivada/excluída/nula = cai na sugestão da US-023. Nunca decide nada no servidor. |
| `payableInvoices`/`listPayableInvoices` | Só conta ativa vira `paymentAccountId`/`Name` (§3.5). |
| Cartão arquivado ou excluído | Fora de listas e do "A pagar"; o vínculo é ignorado. |
| Pagar a fatura (`payInvoice`) | **Não lê** `paymentAccountId` (continua `accountId` do corpo). "O app nunca paga sozinho" é propriedade testada (§9.2-7). |

### 4.4 Arquivar e excluir a conta
- **Arquivar** (`archiveAccount`): nenhuma escrita em cartão. A UI usa `payerForCards` para o aviso prévio (§5.3).
- **Excluir** (`deleteAccount`, dentro do lock já existente da conta): `tx.creditCard.updateMany({ where: { familyId, paymentAccountId: id, deletedAt: null }, data: { paymentAccountId: null, version: { increment: 1 }, updatedByMemberId: ctx.memberId } })` e um `FamilyEvent` por cartão afetado (`reason: "ACCOUNT_DELETED"`, `toAccountId: null`). **Sem importar `cartoes` de `contas`** (há ciclo `cartoes -> contas`): acesso direto ao Prisma dentro de `contas/archive.ts`, em função `clearCardPayers` (o `check:imports` não vigia modelos; se reclamar, mover a função para `lib/`/`db` neutro e registrar).
- **Reativar a conta**: o vínculo volta a valer sozinho (D-TL-U8-2); sem evento.
- Remoção de membro (`familia/removal.ts`): reatribui titular, **não** mexe na pagadora.

## 5. Estados técnicos de UI

### 5.1 Cadastro/edição do cartão (`card-drawer.tsx`)
| Estado | Comportamento |
| :-- | :-- |
| Campo | `Field id="card-payer" label="Conta que paga a fatura"` (select), primeira opção **"Nenhuma (escolho ao pagar)"**; lista **só contas ativas** (`useAccounts()`); `hint`: "Só sugere: você confirma a conta ao pagar." Tecla/leitor: igual aos demais selects. |
| Loading de contas | select desabilitado com a opção "Carregando contas…"; o resto do formulário segue utilizável. |
| Sem contas | só a opção "Nenhuma" e dica "Cadastre uma conta para escolher". |
| Pagadora arquivada | valor vazio no select + faixa `role="status"` acima: "A conta {nome} foi arquivada. Escolha outra ou deixe sem conta." Salvar sem tocar no campo **não envia** `paymentAccountId` (preserva o vínculo para a reativação). Tocar e deixar em "Nenhuma" envia `null`. |
| Envio | só envia `paymentAccountId` quando o usuário mexeu (campo "sujo"), para não gerar `PATCH` falso nem evento; erro 422 aparece no campo. |
| Conflito 409 | fluxo existente ("alterado por {nome}", Recarregar). |

### 5.2 Lista/detalhe do cartão e pagamento
- Card em `cartoes-screen.tsx` e cabeçalho da fatura: `Paga pela {nome}` (texto, não só ícone) quando ativa; se arquivada: `Conta pagadora arquivada ({nome})` com ícone + texto (NEED-017). Sem pagadora: nada.
- **Pagar fatura** (`pay-invoice-drawer.tsx`): nova prop `defaultAccountId?: string | null` (do `CardDTO.paymentAccount` se `!archived`) → `useSourceAccount({ ..., preferredAccountId: defaultAccountId, preferredReason: "Conta pagadora do cartão" })`. `useSourceAccount` ganha o parâmetro opcional `preferredReason` (default "Conta prevista"). Precedência: **escolha manual > pagadora do cartão ativa > sugestão US-023**. Saldo insuficiente na pagadora: mantém a pré-seleção, mostra o sufixo "saldo insuficiente" e o aviso de saldo negativo já existentes (D-PO-08); **nunca troca sozinho**. Valores ocultos (US-027): o nome da conta aparece; saldo mascarado como hoje.
- "A pagar"/Início: `Sai da conta {nome}` no item da fatura (fecha RN-032.2 sem lembrete externo).

### 5.3 Arquivar/excluir a conta (`contas-screen.tsx`)
No diálogo "Arquivar {conta}?" (ou, se o saldo bloqueia, após a transferência): quando `payerForCards.length > 0`, parágrafo `role="note"`: "Esta conta paga a fatura de {Cartão A, Cartão B}. Depois de arquivar, esses cartões ficam sem conta pagadora (reativar a conta restaura a escolha)." Não bloqueia. No diálogo de **excluir**: "O vínculo com {cartões} será removido." Texto também sob valores ocultos (não é valor).

### 5.4 Cache (TanStack Query)
- Mutação de cartão (criar/editar) já invalida `["cards"]`; **acrescentar** `["card"]`, `["payables"]`, `["home"]` quando o campo muda (a fatura troca de linha no `byAccount`).
- `contas/hooks.ts` (arquivar, reativar, excluir): acrescentar `["cards"]`, `["card"]` e `["payables"]` (a pagadora some/volta; SDD-029 §6.3 já pede `["payables"]` e `["accounts"]`).
- `useCard`/`useCards` têm `staleTime: 0`: sem estado velho ao abrir o pagamento.

## 6. Consistência e segurança
- **Isolamento**: FK composta + `lockAccountsForPosting(familyId)`: conta de outra família é impossível (422, nunca 404 revelador).
- **Concorrência**: (a) trocar a pagadora x arquivar a conta: `FOR SHARE` x `FOR UPDATE` na conta; ou o arquivamento comita antes (422 ao trocar) ou a troca comita antes e o arquivamento segue (sem escrita em cartão, sem corrida); (b) trocar x excluir: ordem conta→cartão (D-TL-U8-4); (c) dois membros editando: `version` do cartão (409).
- **"Só meu" / autorização**: nenhum efeito. O campo é metadado do cartão visível a todo membro (como `dueDay`); a regra "só o titular troca o titular" não muda e há teste de regressão.
- **MCP**: sem mudança de contrato (D-TL-U8-6); teste de snapshot.
- **LGPD**: o vínculo entra na exportação; a exclusão de conta/família já respeita as FKs.

## 7. Divergências com a US (para o Gestor ratificar; nenhuma bloqueia)
| ID | Data | História | Lacuna / desvio | Hipótese adotada | Impacto |
| :-- | :-- | :-- | :-- | :-- | :-- |
| TL-U8-1 | 2026-10-26 | US-089 | US diz "conta arquivada: o campo fica vazio" | Vazio **na tela**, mas o vínculo é **mantido** no banco; reativar restaura (D-TL-U8-2) | Nenhum para o usuário; menos escrita e sem corrida |
| TL-U8-2 | 2026-10-26 | US-089 | Excluir a conta não é citado | Exclusão limpa o vínculo e registra evento (D-TL-U8-3) | Nenhum |
| TL-U8-3 | 2026-10-26 | US-089 | Cartões existentes | Sem backfill: nascem sem pagadora; a US-023 segue sugerindo | Nenhum |
| TL-U8-4 | 2026-10-26 | US-089 / US-060 | Fatura de cartão com pagadora arquivada | Cai em "Sem conta definida" (§3.5) | Coerente com "conta arquivada não paga" |
| TL-U8-5 | 2026-10-26 | US-089 | "Aviso do vencimento" | Só o texto "Sai da conta {nome}"; sem e-mail/push (já fora de escopo) | Nenhum |

## 8. Estimativa e fatiamento
| Fatia | Conteúdo | Pts |
| :-- | :-- | :-- |
| API/DB | 2 migrações, Prisma, Zod, `createCard`/`updateCard`, `listAccounts.payerForCards`, limpeza na exclusão, evento + rótulos, `PayableInvoice`, export LGPD | 1 |
| UI | campo no `card-drawer`, "Paga pela", `pay-invoice-drawer` + `useSourceAccount.preferredReason`, avisos de arquivar/excluir conta, texto "Sai da conta" em A pagar/Início, invalidações | 1 |
| Testes | unidade, integração, E2E/BDD (§9) | 1 |
| **Total** | **Confirma 3 pts** (risco de 4 se a limpeza na exclusão exigir mover código por causa do `check:imports`) | **3** |
**Ordem sugerida**: depois da US-060 (SDD-029, já em curso) e antes da US-090/091; ao entrar, ativar o `it.todo` e o `@pendente-us-089` da US-060.

## 9. Guia de testes para o Dev & QA
### 9.1 Unidade
1. `tests/unit/cartoes/schemas.test.ts`: `paymentAccountId` aceita uuid/`null`/omitido; rejeita string não-uuid com a mensagem; `UpdateCardSchema` com só `paymentAccountId: null` não cai no refine "Nada para alterar".
2. `tests/unit/contas/use-source-account` (hook com `renderHook` ou função pura extraída): precedência manual > `preferredAccountId` ativa > sugestão; `preferredAccountId` inexistente/arquivada ignorada; `reasonText` usa `preferredReason`.
3. Rótulo do evento no `familia-screen` (mapa completo: o teste de exaustividade dos tipos de evento deve falhar se faltar o novo).
### 9.2 Integração (`tests/integration/us-089-conta-pagadora.int.test.ts`; mesmo molde de `us-015`/`us-017b`)
1. Criar cartão **sem** e **com** pagadora; PATCH define, troca e remove (`null`); `version` sobe só quando muda; PATCH igual = 200 sem subir `version`.
2. 422 `INVALID_REFERENCE` (`path: paymentAccountId`) para conta arquivada, excluída e de **outra família** (criar e atualizar).
3. **Renomear** cartão cuja pagadora foi arquivada → 200 (não revalida o vínculo inalterado).
4. Evento `CARD_PAYER_ACCOUNT_CHANGED` com `from/to` (ids e nomes) e ator; **sem** evento no create e no PATCH sem mudança.
5. **Arquivar** a conta: nenhum cartão muda (`version` igual); `GET /cards` mostra `paymentAccount.archived: true`; `GET /accounts` lista `payerForCards` antes de arquivar; **reativar** a conta: `archived: false`, vínculo íntegro.
6. **Excluir** conta nunca usada com pagadora: `paymentAccountId` vira `null`, `version` do cartão +1, evento `reason: ACCOUNT_DELETED`; excluir x PATCH concorrente (`Promise.all`) termina sem deadlock (um dos dois vence com 200/422).
7. **O app nunca paga sozinho**: fatura fechada vencida com pagadora; avançar o relógio da família e chamar `GET /cards`, `/payables`, `/home`, `/month-summary`: **zero** `INVOICE_PAYMENT` criado e saldo da conta intacto. `POST .../pay` sem `accountId` continua 422.
8. **Pagar com outra conta** (`accountId` ≠ pagadora): pagamento sai da escolhida; `paymentAccountId` do cartão intacto. Trocar a pagadora **depois** de pagar: o lançamento antigo não muda (RN-032.6).
9. `GET /payables`: item `INVOICE` com `paymentAccountId`/`Name` da pagadora **ativa**; com a conta arquivada → `null`; com `byAccount` (SDD-029): a fatura soma na linha da conta e a reconciliação "Σ linhas = total" continua verdadeira (`it.todo` do SDD-029 passa a rodar).
10. **MCP**: `previstas_do_mes` com fatura que tem pagadora → `payWith` **ausente**; snapshot do `Output` strict inalterado.
11. **Autorização**: não-titular edita a pagadora (200); não-titular troca o titular (403 `CARD_OWNER_ONLY`) — regressão de `sec042-046`.
12. **Export LGPD**: `cartoes[].contaPagadoraId` presente e validado pelo `ExportSchema`; exclusão da família com cartões vinculados conclui (ordem das tabelas).
13. Regressão obrigatória sem edição: `us-015`, `us-017a/b`, `us-023`, `us-033`, `us-055`, `sec042-046`, `us-032`.
### 9.3 E2E / BDD (`tests/e2e/features/US-089-conta-pagadora-padrao-do-cartao.feature`; 1:1 com os **7 cenários** da US, em 375 e 1280 px)
- Definir no cadastro ("Paga pela Corrente"), pagadora opcional, **conta sugerida ao pagar** (campo "Conta de origem" vem com a Corrente e o texto "Conta pagadora do cartão"), escolher outra no ato (cartão continua com a Corrente), o app não paga sozinho, conta arquivada (diálogo cita o cartão; depois o aviso no cartão e a fatura ainda paga por outra conta), troca não muda pagamento feito.
- Extras: pagadora com saldo insuficiente (pré-seleção mantida + "saldo insuficiente"); valores ocultos (nome da conta visível, saldo mascarado); teclado no select; "Sai da conta Corrente" no item da fatura em "A pagar" e na Início; mobile sem rolagem horizontal; tema claro e escuro.
- Notas de Gherkin: o passo "Quando o dia passa" deve usar o relógio de teste da família (não esperar tempo real); onde o parser colidir passos (DEV-25), o Dev ajusta e registra.

## 10. Riscos e pendências
| ID | Risco / pendência | Tratamento |
| :-- | :-- | :-- |
| R-1 | Escrita de `contas` em `credit_cards` pode esbarrar no `check:imports`/ciclo `cartoes <-> contas`. | Prisma direto em `contas/archive.ts` (§4.4); se a regra reclamar, mover para módulo neutro e registrar (+0,5 pt). |
| R-2 | `useSourceAccount` é usado por 3 telas (pagar fatura, baixa, prevista). | O parâmetro `preferredReason` é opcional e não muda o padrão; testes do hook cobrem as três. |
| R-3 | Cartões antigos nascem sem pagadora; "A pagar" segue em "Sem conta definida" até o usuário preencher. | Aceito (Q-U23 opcional). Possível melhoria futura (fora): sugerir a conta mais usada nos últimos pagamentos. |
| R-4 | Nome da conta no evento fica "congelado". | Intencional (a conta pode ser excluída). |
| R-5 | Troca de pagadora muda a linha da fatura no `byAccount`; a tela "A pagar" pode estar aberta em outro aparelho. | `staleTime: 0` + invalidação; sem tempo real (padrão do app). |

## 11. Rastreabilidade
NEED-032 (RN-032.1..6, Q-U22/Q-U23) ⇒ FLUXO-004 §7 ⇒ US-089 (D-PO-101) ⇒ **SDD-030** (TL-U8) ⇒ TASK a abrir pelo Gestor. Completa o SDD-029 (US-060, cenário "Fatura entra na conta pagadora"). Estado vigente: [cartoes-faturas.md](../../estado/cartoes-faturas.md) e [previstas-series.md](../../estado/previstas-series.md).
