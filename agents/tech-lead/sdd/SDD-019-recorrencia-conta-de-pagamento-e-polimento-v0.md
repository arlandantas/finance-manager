# SDD-019: Recorrência mensal, conta de pagamento e polimento da v0 (US-056..064)

- **Histórias**: US-056, US-057, **US-058 + US-059** (domínio crítico), US-061, US-062, US-063; resumidas: US-064, US-060 — em [`stories/`](../../product-owner/backlog/stories/)
- **Release**: v0 alpha ([`release-v0-alpha.md`](../../product-owner/backlog/release-v0-alpha.md) §4) · **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead
- **Decisões**: [ADR-025](../adrs/ADR-025-recorrencia-mensal-materializada.md) (recorrência), [ADR-026](../adrs/ADR-026-producao-do-alpha.md) (produção). Base: SDD-009 (previstas/baixa), SDD-010 (Resumo/`prefs`), SDD-012 (contas), SDD-013 (sugestão de conta), SDD-018 (fonte única do A pagar)
- **Restrição**: nenhum cálculo do motor do acerto muda; S1..S16 e os valores homologados ficam verdes em todo lote.

## 0. Estimativas (TL) e lotes

| História | PO | **TL** | Observação |
| :-- | :-: | :-: | :-- |
| US-056 | 3 | **3** | camada de diálogos + tokens + axe |
| US-052 | 2 | **2** | SDD-018 |
| US-057 | 3 | **3** | 1 coluna, fonte única de saldo |
| US-058 | 8 | **8** | série, geração, edição, encerrar |
| US-059 | 2 | **2** | entra no mesmo lote/migração da 058 |
| US-055 | 3 | **3** | SDD-018; unifica 3 consultas |
| US-061 | 5 | **5** | |
| US-062 | 2 | **1** | "Limpar filtros" já existe (E2E US-039); falta fechar por padrão e contador |
| US-063 | 2 | **3** | composição nova de Previstas (§7) e pergunta ao PO |
| **Must** | 30 | **30** | ordem do PO mantida |
| US-064 | 2 | 2 | Should |
| US-060 | 3 | 3 | Should |
| Produção (ADR-026) | — | **5** | lote P, em paralelo, bloqueante |

**Lotes** (cada um ≤ 1 sessão, no máximo **uma migração** por lote, nome entre parênteses):

| Lote | Conteúdo | Pts | Migração |
| :-- | :-- | :-: | :-- |
| L1 | US-056 | 3 | — |
| L2 | US-052 + US-057 | 5 | `v0_conta_reserva` |
| L3 | US-058 + US-059 (backend: schema, geração, serviços, rotas, testes de domínio) | 6 | `v0_recorrencia_e_conta_prevista` |
| L4 | US-058 + US-059 (UI: formulário, gerenciar série, baixa pré-preenchida, E2E) | 4 | — |
| L5 | US-055 (SDD-018) + US-062 | 4 | — |
| L6 | US-061 + US-063 | 8 | — (se estourar, US-063 passa ao L7) |
| L7 (Should) | US-064, depois US-060 | 5 | — |
| P | Produção (ADR-026), em paralelo a partir do L1 | 5 | — |

Dependências: L3 antes de L4; L5 antes de L6 (fonte única); L1 antes de US-064. Nenhuma altera a ordem do PO.

## 1. US-056 — camada única de diálogos e contraste

- **Componente único** `src/components/ui/dialog-layer.tsx`: todo diálogo/drawer/confirmação usa `Drawer`/`ConfirmDialog` sobre Radix Dialog com `Portal`. Um diálogo aberto **de dentro** de outro é renderizado **dentro do `Content` do pai** (Radix aninha `DismissableLayer`: Esc e clique fora fecham só o de cima; o de baixo fica `inert` via `aria-modal`/foco preso pelo Radix).
- **z-index por profundidade**: `DialogDepthContext` (0, 1, 2…); overlay `z = 40 + 20·d`, conteúdo `z = 50 + 20·d`. Proibido `z-*` fixo em diálogo fora deste componente (regra de lint por `grep` no `check:imports` ou teste de unidade que varre `src/**/*.tsx`).
- **Contraste nos tokens**: estados `hover`, `focus-visible`, `aria-selected/data-active` e `disabled` passam a usar tokens semânticos (`--surface-hover`, `--surface-active`, `--text-on-active`, `--text-disabled`, `--focus-ring`) definidos para claro e escuro em `globals.css`; componentes deixam de combinar utilitários de cor soltos para esses estados.
- **Testes**
  - Unidade: `contrast.test.ts` lê os pares (texto × fundo) de cada estado nos dois temas a partir do `globals.css` e exige ≥ 4,5:1 (texto) e ≥ 3:1 (anel de foco).
  - E2E: `@axe-core/playwright` (dependência de dev) com regra `color-contrast` em Início, Extrato, Contas, A pagar, detalhe do lançamento, em `colorScheme: light` e `dark`, forçando `:hover`/`:focus` nos itens do checklist da história. Cenários BDD: "Confirmação cobre o detalhe" (a confirmação é o elemento do topo em `elementFromPoint` do centro; detalhe com `inert`/`aria-hidden`), "Esc fecha só o de cima".

## 2. US-057 — conta fora do saldo disponível

- **Migração `v0_conta_reserva`**: `bank_accounts."excludeFromAvailable" BOOLEAN NOT NULL DEFAULT false`.
- **Contratos**: `CreateAccountSchema`/`UpdateAccountSchema` ganham `excludeFromAvailable: z.boolean().optional()`; `AccountDTO.excludeFromAvailable: boolean`; `AccountsResponse` = `{ items, totalBalanceInCents /* = disponível */, reservesInCents }`.
- **Fonte única**: o filtro existe **só** em `listAccounts` (`src/modules/contas/service.ts`): `totalBalanceInCents` = ativas ∧ ¬reserva; `reservesInCents` = ativas ∧ reserva. Resumo (`currentBalanceInCents`, `projectedBalanceInCents`), card de saldos da Início e US-060 consomem esses campos; ninguém soma saldos por conta.
- **Não muda**: `accountBalances`, transferências, acerto, receitas/despesas do Resumo, sugestão de conta (reserva continua selecionável).
- **UI**: interruptor "Não conta no saldo disponível" + ajuda; selo "Reserva"; linha "Reservas" no card (oculta se 0); `Money` mascara.
- **Testes**: unidade do somatório (ativa/arquivada × reserva/não); integração com os 5 cenários (transferência Corrente→Reserva: disponível −500, reservas +500); regressão S1..S16 e valores homologados; E2E dos 5 cenários.

## 3. US-058 + US-059 — recorrência mensal e conta de pagamento (domínio crítico)

### 3.1 Modelo (migração `v0_recorrencia_e_conta_prevista`)
```prisma
model RecurringExpense {             // @@map("recurring_expenses")
  id                    String    @id @default(uuid()) @db.Uuid
  familyId              String    @db.Uuid
  description           String    // 2..100
  amountInCents         BigInt    // > 0 (CHECK)
  categoryId            String    @db.Uuid
  responsibleMemberId   String    @db.Uuid
  isSharedExpense       Boolean   @default(false)
  paymentAccountId      String?   @db.Uuid          // US-059
  dayOfMonth            Int       // 1..31 (CHECK)
  startMonth            DateTime  @db.Date          // dia 1 do mês
  endMonth              DateTime? @db.Date          // dia 1; null = sem fim; "N meses" => startMonth + N − 1
  generatedThroughMonth DateTime? @db.Date          // último mês já materializado
  endedAt               DateTime? @db.Timestamptz(3)
  endedByMemberId       String?   @db.Uuid
  authorMemberId        String    @db.Uuid
  updatedByMemberId     String?   @db.Uuid
  version               Int       @default(1)
  createdAt / updatedAt
  @@unique([familyId, id])
  @@index([familyId, endedAt, generatedThroughMonth])
}
// planned_expenses (acréscimos)
seriesId          String?  @db.Uuid   // FK (familyId, seriesId) -> recurring_expenses
occurrenceMonth   DateTime? @db.Date  // dia 1; CHECK ((seriesId IS NULL) = (occurrenceMonth IS NULL))
isException       Boolean  @default(false)
paymentAccountId  String?  @db.Uuid   // FK (familyId, paymentAccountId) -> bank_accounts; US-059
@@unique([familyId, seriesId, occurrenceMonth])   // sem filtro de deletedAt: nunca recria
```
Previstas antigas: colunas novas nulas/`false`; nenhuma reescrita de dados.

### 3.2 Funções puras (`src/modules/previstas/recurrence.ts`)
```ts
export type MonthISO = `${number}-${number}`;                 // "2026-10"
export function occurrenceDueOn(month: MonthISO, day: number): DateISO; // min(day, últimoDia(month))
export function monthsToGenerate(s: { startMonth; endMonth: MonthISO | null; generatedThroughMonth: MonthISO | null; endedAt: Date | null },
                                 currentMonth: MonthISO, horizon = 12): MonthISO[];
// = meses m com max(startMonth, generatedThroughMonth+1) <= m <= min(endMonth ?? ∞, currentMonth + horizon − 1); [] se endedAt
export function endMonthFromCount(startMonth: MonthISO, n: number): MonthISO; // n >= 1
```

### 3.3 Decisões de domínio
| Tema | Decisão |
| :-- | :-- |
| **Centavos** | `amountInCents` inteiro (> 0, ≤ limite do `moneySchema`); a ocorrência copia o valor da série, sem divisão nem arredondamento. |
| **Datas e fuso** | Tudo `DATE` civil. "Hoje" e "mês corrente" vêm de `todayInFamilyTz(ctx.clock)` (fuso da família; padrão `APP_TIMEZONE=America/Sao_Paulo`). Mês = **mês civil** do vencimento (independente do `cutDay`). |
| **Dia 29–31** | `occurrenceDueOn` usa o último dia do mês quando o dia não existe (31 → 28/29 fev, 30/04). A série guarda o dia pedido (31), não o ajustado. |
| **Horizonte** | 12 meses a partir do mês corrente: `[mêsCorrente, mêsCorrente+11]`, limitado por `startMonth`/`endMonth`. `startMonth` aceita do mês corrente até +11; se o dia da ocorrência do mês corrente já passou, ela é criada mesmo assim (aparece como atrasada). |
| **Fim por N meses** | Contado **a partir do `startMonth`** (`endMonth = start + N − 1`), não das ocorrências restantes. "Seguro por 6 meses" = 6 ocorrências. |
| **Geração** | `ensureRecurrenceHorizon(tx, ctx)`: (1) consulta indexada de séries ativas com `generatedThroughMonth < alvo`; se nada, retorna (custo ~1 consulta); (2) `pg_advisory_xact_lock(hashtext('recurrence:'||familyId))`; (3) por série, `createMany({ data: ocorrências, skipDuplicates: true })`; (4) `generatedThroughMonth = último mês gerado`. Chamada numa **transação curta própria** antes do `REPEATABLE READ` de leitura em: `GET /home`, `GET /payables`, `GET /planned-expenses`, `GET /summary`; e dentro da transação de criar/editar série. **Sem cron**: família sem acesso não precisa de previstas novas. |
| **Idempotência** | Garantida pela unique `(familyId, seriesId, occurrenceMonth)` + `skipDuplicates`; reexecução e corrida entre abas/membros não duplicam. `POST /recurring-expenses` exige `Idempotency-Key` (ADR-009). |
| **Ocorrência excluída/baixada** | Nunca recriada (unique inclui excluídas; `generatedThroughMonth` só avança). |
| **Editar só esta** | `PATCH /planned-expenses/:id` (rota existente). Se `seriesId` não nulo e mudou valor, data, descrição, categoria, conta, responsável ou divisão ⇒ `isException = true`. Selo "Recorrente · alterada". A série não muda. |
| **Editar esta e as próximas** | `PATCH /recurring-expenses/:id` com `effectiveFrom: MonthISO` (padrão: mês corrente; ≥ mês corrente). Atualiza a série e reescreve as ocorrências **afetadas** = `seriesId = :id ∧ status = PREVISTO ∧ deletedAt IS NULL ∧ isException = false ∧ occurrenceMonth ≥ effectiveFrom ∧ dueOn ≥ hoje`. Baixadas, exceções e atrasadas não mudam. Mudança de dia recalcula `dueOn` das afetadas. Mudança de `endMonth` para antes: exclui (lógico) afetadas além do novo fim; para depois/sem fim: a geração completa o horizonte. Na UI, "Editar esta e as próximas" a partir de uma ocorrência envia `effectiveFrom = occurrenceMonth` dela. |
| **Pré-visualização** | `GET /recurring-expenses/:id/impact?effectiveFrom=` → `{ affectedCount, keptPaidCount, keptExceptionCount }` para a confirmação "N previstas serão alteradas/removidas". |
| **Encerrar série** | `POST /recurring-expenses/:id/end` `{ version }`: `endedAt = now`; ocorrências pendentes com `dueOn ≥ hoje` (inclusive exceções) recebem exclusão lógica (`deletedAt`, `deletedByMemberId`); baixadas e atrasadas permanecem. **Não há `DELETE` físico da série** (histórico/auditoria). Encerrada não reabre (cria-se outra). |
| **Baixa e desfazer** | Fluxo US-019 **sem mudança** (`payPlannedExpense`/`undoPlannedPayment`, com `lockFamilySplit`). Desfazer devolve a ocorrência a PREVISTO, mantendo o vínculo com a série. |
| **Acerto e "Só meu"** | A série guarda `isSharedExpense` (padrão "Só meu", US-030); a ocorrência copia; editar a série reescreve só as afetadas. Previstas não entram no acerto; só a `Transaction` da baixa entra, pelo motor atual. **Nenhum cálculo do acerto/EN-002 muda.** Quando a SDD-015 levar `splitMode` às previstas, a série ganha o mesmo campo com a mesma regra. |
| **Concorrência de edição** | `version` otimista na série e na ocorrência (ADR-009); edição da série e geração usam a mesma trava consultiva da família. |

### 3.4 US-059 — conta de pagamento
- `paymentAccountId` (só **conta bancária** na v0: a baixa atual cria despesa em conta; "cartão" em "Pagar com" fica fora da v0 — **D-TL-v0-1, a confirmar com o PO**; para cartão, o usuário continua lançando a compra no cartão).
- Validação: conta da família, não excluída, não arquivada (422 `INVALID_REF` "Escolha uma conta ativa").
- **Sugestão** "conta mais usada": reusa `usageCountByMember` (últimos 90 dias, membro logado) + `suggestSourceAccount` (SDD-013); nunca arquivada.
- **Baixa**: `PayPlannedDialog` pré-preenche `accountId = paymentAccountId` se a conta estiver ativa; se arquivada/excluída ou nula, campo vazio (+ aviso "A conta prevista foi arquivada" quando for o caso). O servidor da baixa não muda (continua exigindo `accountId`).
- Geração: ocorrência copia `paymentAccountId` da série; se a conta estiver arquivada no momento da geração, copia `null`.

### 3.5 Contratos (Zod)
```ts
const monthISO = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export const CreateRecurringExpenseSchema = z.object({
  description: z.string().trim().min(2).max(100), amountInCents: moneySchema /* int > 0 */,
  categoryId: z.uuid(), responsibleMemberId: z.uuid().optional(), isSharedExpense: z.boolean().default(false),
  paymentAccountId: z.uuid().nullable().optional(), dayOfMonth: z.number().int().min(1).max(31),
  startMonth: monthISO, end: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("NONE") }), z.object({ kind: z.literal("COUNT"), months: z.number().int().min(1).max(120) }) ]),
}).strict();
export const UpdateRecurringExpenseSchema = CreateRecurringExpenseSchema.omit({ startMonth: true }).partial()
  .extend({ version: versionSchema, effectiveFrom: monthISO.optional() }).strict();
export const EndRecurringExpenseSchema = z.object({ version: versionSchema }).strict();
// PlannedExpenseDTO += { series: { id, dayOfMonth } | null, isException, paymentAccount: AccountRef | null }
// Create/UpdatePlannedExpenseSchema += paymentAccountId: z.uuid().nullable().optional()
```
**Rotas** (`/api/v1`, padrão `withApi`, família da sessão): `POST /recurring-expenses` (201 + `{ series, generatedCount }`), `GET /recurring-expenses`, `GET /recurring-expenses/:id`, `PATCH /recurring-expenses/:id` (200 + `{ series, affectedCount }`), `GET /recurring-expenses/:id/impact`, `POST /recurring-expenses/:id/end`. Erros: 409 `VERSION_CONFLICT`, 409 `SERIES_ENDED`, 422 validação.
**Serviço**: `src/modules/previstas/recurring-service.ts` (`createSeries`, `updateSeries`, `endSeries`, `seriesImpact`, `ensureRecurrenceHorizon`); repo em `recurring-repo.ts`.

### 3.6 UI
Formulário de prevista: interruptor "Repetir todo mês" ⇒ campos dia (1–31, ajuda "nos meses sem esse dia, vence no último dia"), início (mês), fim ("Sem fim" | "Por N meses"); "Pagar com" (sugestão). Selo "Recorrente" na linha. Menu da ocorrência: "Editar só esta" / "Editar esta e as próximas" / "Encerrar recorrência", confirmação com contagem do `impact`. Estados: loading (skeleton), vazio, erro, 409 "alterada por {Nome}". 375 e 1280 px.

### 3.7 Testes (Dev & QA)
- **Unidade** (`recurrence.test.ts`): `occurrenceDueOn` — 31 em fev/2026 (28), fev/2028 (29), abr (30), dia 10, dia 1; `monthsToGenerate` — sem fim (12), N=6 (6, sem o 7º), início futuro, horizonte já gerado (vazio), série encerrada (vazio), virada de ano; `endMonthFromCount`.
- **Integração**:
  - G1 criar sem fim ⇒ 12 linhas, `dueOn` dia 10; G2 `ensureRecurrenceHorizon` 2× no mesmo mês ⇒ 12; G3 avançar relógio 1 mês ⇒ 13 (1 nova); G4 **corrida**: 2 transações paralelas de `ensureRecurrenceHorizon` ⇒ sem duplicata e sem erro; G5 ocorrência excluída não volta; G6 fuso: relógio em 2026-10-31T23:30-03:00 (já 01/11 em UTC) usa outubro.
  - E1 editar valor com setembro baixado ⇒ futuras pendentes 130,00, setembro 120,00 (e a `Transaction` intacta); E2 exceção (dezembro 200,00) sobrevive à edição da série; E3 mudar dia 10→31 recalcula `dueOn` das afetadas; E4 `effectiveFrom` futuro preserva meses anteriores; E5 encurtar fim exclui as além do novo fim; E6 `impact` bate com o efeito real; E7 409 por versão.
  - F1 encerrar ⇒ futuras pendentes excluídas, baixadas e atrasadas mantidas, geração não cria mais; F2 encerrar 2× ⇒ 409 `SERIES_ENDED`.
  - B1 baixa e desfazer de ocorrência pelo fluxo US-019; B2 ocorrência "comum" baixada entra no acerto igual a uma prevista avulsa; **regressão S1..S16 e valores homologados**.
  - C1 (US-059) `paymentAccountId` arquivada ⇒ 422 na criação; C2 geração com conta arquivada copia `null`; C3 sugestão ignora arquivada.
  - Reconciliação: propriedade do SDD-018 (A pagar = Resumo) com séries ativas.
- **E2E (BDD 1:1)**: os 7 cenários da US-058 e os 4 da US-059, 375 e 1280 px, relógio fixo via `/api/dev/clock` (outubro de 2026).

## 4. US-061 — Início enxuta
- `HomeDTO` (aditivo): `dueSoon: { items: PayableItemDTO[] /* ≤ 10 */, totalCount, overdue: { count, totalInCents } }` via `sliceWindow(collectOpenPayables())` (SDD-018; janela hoje..hoje+7 + atrasados); `recent` passa de 5 para **10** (mantém `occurredUntil: hoje`); `monthSummary` e `balances` inalterados.
- Ordem na tela: ações rápidas (reusa `QuickAdd`) → "Vence nos próximos dias" ("Ver tudo" ⇒ `/previstas`) → "Extrato recente" ("Ver extrato") → card "Resumo do mês" **fechado por padrão** com síntese (resultado do mês), estado lembrado em `prefs` por dispositivo (`home.summaryOpen`, padrão `false`).
- Estados por bloco: skeleton, vazio ("Nada vence nos próximos dias"), erro com retry; `Money` mascara.
- **Testes**: unidade de `sliceWindow` (SDD-018); integração: os itens de `dueSoon` são subconjunto de `listPayables` do período corrente com os mesmos valores; E2E dos 6 cenários.

## 5. US-062 — filtros do Extrato
Cliente apenas: painel fechado ao abrir; `activeFilterCount(filters)` (função pura; mês não conta) ⇒ "Filtros (N)"; "Limpar filtros" (já existente) só com N > 0 e mantendo o mês. **Testes**: unidade do contador; E2E dos 4 cenários (ajustar o E2E da US-039 se assumia painel aberto).

## 6. US-063 — "Previstas" no Resumo do Mês
`MonthSummaryDTO` (aditivo; nada existente muda de valor):
```ts
planned: {
  invoicesInCents,      // faturas com vencimento no período (pagas ou não) + atrasadas não pagas se corrente
  openInCents,          // previstas PREVISTO do recorte do período (= toPay.plannedInCents)
  paidInCents,          // previstas baixadas cuja Transaction cai no período
  totalInCents,         // soma dos três
  openToPayInCents,     // "A pagar em aberto" = toPay.totalInCents (reconcilia com a tela A pagar)
},
unplannedInCents,       // EXPENSE do período sem cartão e sem vínculo de baixa de prevista
projectedExpenseInCents // planned.totalInCents + unplannedInCents ("Despesas")
```
- **Ponto para o PO (D-TL-v0-2)**: com essa composição, "Despesas" vira **projeção do mês** (inclui o que está em aberto e usa a fatura no lugar das compras no cartão), diferente de `expenseInCents` (realizado, que alimenta "Resultado"). Proposta: mostrar "Despesas" = projeção, manter "Resultado" sobre o realizado com rótulo "Resultado até hoje". O Dev implementa assim salvo objeção do PO antes do L6.
- **Testes**: unidade da composição; integração com o exemplo do Gherkin (1.129,00 + 400,00 = 1.529,00) e propriedade `openToPayInCents === listPayables().totals.dueInCents`; E2E dos 3 cenários.

## 7. Resumidas (Should)
- **US-064 (2)**: em ≥ 1024 px, `AppShell` troca a barra inferior por `nav` lateral fixa usando os mesmos itens e os tokens da US-056; E2E de navegação + axe nos dois temas.
- **US-060 (3)**: `GET /payables` ganha `byAccount: [{ account, dueInCents, balanceInCents, shortfallInCents }]` agregando previstas pendentes do recorte por `paymentAccountId` (nulo ⇒ grupo "Sem conta"), saldo de `listAccounts` (reservas excluídas do disponível, mas listadas se forem a conta de pagamento). Faturas não entram (não têm conta). Propriedade: Σ `dueInCents` por conta = `plannedInCents` do recorte.

## 8. Rastreabilidade
US-056..064 ⇒ SDD-019 (US-052/055 ⇒ SDD-018) ⇒ ADR-025/026 ⇒ TASK-048..055 ([tasks-board](../../developer/tasks/tasks-board.md)).
