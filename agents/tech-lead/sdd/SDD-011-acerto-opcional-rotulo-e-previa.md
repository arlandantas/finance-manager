# SDD-011: Acerto opcional, rótulo honesto, "Só meu" por padrão e prévia da regra (US-022, US-028, US-029, US-030, US-031)

- **Histórias**: [US-022](../../product-owner/backlog/stories/US-022-rotulo-honesto-da-regra-de-divisao.md) · [US-028](../../product-owner/backlog/stories/US-028-acerto-de-contas-opcional.md) · [US-029](../../product-owner/backlog/stories/US-029-indicador-neutro-de-acerto-e-divida-antiga.md) · [US-030](../../product-owner/backlog/stories/US-030-dividir-desligado-por-padrao.md) · [US-031](../../product-owner/backlog/stories/US-031-previa-de-impacto-da-regra-e-sugestao-pela-renda.md)
- **Fluxos**: [FLUXO-003](../../product-owner/flows/FLUXO-003-acerto-de-contas.md), [FLUXO-006](../../product-owner/flows/FLUXO-006-home-resumo-do-mes.md), [FLUXO-008](../../product-owner/flows/FLUXO-008-lancar-despesa-r21-r3.md), [FLUXO-009](../../product-owner/flows/FLUXO-009-acerto-opcional.md)
- **Rastreabilidade**: NEED-007 (RN-007.4..6), NEED-018, NEED-019 (RN-019.1..6) · Q-F01, Q-F02 · Q-08/D-GES-08, D-GES-15 (revisa Q-22) · D-PO-14, D-PO-16 · [ADR-011](../adrs/ADR-011-regra-de-divisao-versionada.md), **[ADR-016](../adrs/ADR-016-percentual-gravado-por-lancamento.md)** (o que a R2.1 prepara) · [ADR-019](../adrs/ADR-019-ciclo-de-vida-do-vinculo-ex-membro.md) (`FamilyEvent`)
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-002](SDD-002-split-e-acerto.md) (motor e DTO), [SDD-003](SDD-003-auth-familia-convite.md) (família/onboarding), [SDD-005](SDD-005-extrato-e-home.md), [SDD-010](SDD-010-resumo-do-mes-ocultar-valores-e-preferencias.md) (Home, `Money`, `ledger-where`) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md) §8
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA
- **Garantia central da R2.1**: **o motor `computeSettlement` não muda** (nenhuma linha de `settlement.ts`, `rules.ts`). Mudam só a explicação, a exposição e padrões de formulário. A regressão obrigatória é rodar S1..S13 e os dados homologados (§8) **antes e depois**.

---

## 1. Gaps técnicos e decisões

| Gap / Pergunta do PO | Resolução |
| :-- | :-- |
| US-022: o DTO expõe trechos de vigência e o ponderado, **da mesma fonte das cotas**? | **Sim.** `SettlementDTO.splitExplanation` é calculado em `toSettlementDto` a partir do **mesmo** `SettlementResult` (cotas) e das mesmas regras; o ponderado é `apportion(1000, quotas)` (décimos de ponto percentual, soma exata 100,0%; sem `float`). O texto é montado no cliente por função pura `formatSplitLabel` (testada com vetores §4.1). |
| Percentual ponderado "nasce antes da EN-002 e continua igual depois" | Interface única `explainPeriodSplit` (ADR-016 §6). R2.1: implementação **por vigência**. R3: **por rateio gravado**; o gate da migração e um teste de propriedade garantem a igualdade. |
| US-028: onde guardar a chave | Coluna `Family.settlementEnabled boolean NOT NULL DEFAULT true` (famílias existentes ficam **ligadas**), mais `Family.version`, `updatedAt`, `updatedByMemberId` (conflito "alterada por"). Sem tabela de preferências. Exposta em `MeDTO.membership.settlementEnabled` e `FamilyDTO.family.settlementEnabled` (o menu e o formulário decidem sem outra chamada). |
| US-028: reação da API com o recurso desligado | **`409 SETTLEMENT_DISABLED`** "O acerto de contas está desligado nesta família" em: `GET/PUT /split-rule`, `GET /split-rule/history`, `POST /split-rule/preview`, `GET /settlement`, `GET /settlement/expenses`, `POST /settlements`. **Exceções (continuam funcionando)**: `POST /transfers/:id/undo` de um acerto já registrado (desfazer não pode ficar preso) e todas as leituras do Extrato. As telas tratam o código com a mensagem + link "Voltar para o início" (nunca erro técnico). |
| US-028: religar não recalcula nada | Nenhum *job*, nenhuma coluna derivada: `isSharedExpense`, `SplitRuleVersion` e `TransferGroup(SETTLEMENT)` **não são tocados** ao ligar/desligar (teste de **imutabilidade por *checksum*** das linhas antes/depois). |
| US-028 × US-029: "diferença em aberto (qualquer mês)" × "janela de 12 meses" | **Decisão do TL**: uma função `pendingSettlementMonths(from, to)`. A **Home** usa janela de **12 meses** (custo previsível); a confirmação de **desligar** usa **todos os meses** desde a 1ª despesa dividida (teto de 120 meses). Custo: um `SELECT` de despesas comuns do intervalo + acertos por `settlementPeriod` e `computeSettlement` puro por mês (em memória), dentro de `REPEATABLE READ`. Sem cache além do `staleTime` de 30 s. |
| US-030: mudar o padrão não exige mudar `computeSettlement`? | **Confirmado.** A mudança é: default do **schema** (`isSharedExpense` ⇒ `false`) em despesa e previsão, default de coluna em `planned_expenses`, e o formulário. **Contrato de API muda** (quem omitia o campo recebia `true`): ver §5 e a lista de testes de R1/R2 a atualizar (§9). |
| US-030: campo "Dividir" com acerto desligado/único membro | Servidor: com acerto **desligado**, `isSharedExpense: true` em `POST/PATCH` ⇒ `422 SETTLEMENT_DISABLED` (não grava despesa "dividida" inerte). Com **um** membro o servidor **aceita** (sem efeito até haver 2º membro); só a UI esconde. A **baixa** de previsão mantém o `isSharedExpense` da previsão (herdado por serviço, fora da guarda de API). |
| US-031: prévia reaproveitando `computeSettlement` "e se" | `POST /split-rule/preview` (**sem gravar**, `idempotent: false`, `ADMIN`): chama `computeSettlement` **duas vezes** (regras atuais e regras + candidata) sobre as mesmas despesas do mês corrente. Impacto = `Σ|Δ saldo| ÷ 2` (para 2 membros = diferença do valor a acertar). Custo = 2 cálculos em memória + 1 leitura. |
| US-031: renda dos membros | **Nunca** enviada nem gravada: `suggestBpsFromIncomes` roda **no cliente** (função pura). |
| Linha "N despesas Só meu" (US-030) | `SettlementDTO.personal = { count, totalInCents }` de `EXPENSE` ativas **não** divididas do período (todos os pagadores), por `periodPredicate`; link para `/extrato?period=…&shared=false` (filtro **já existe**, SDD-005). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/split/schemas.ts  (acréscimos)
export type SplitSegmentDTO = {
  ruleVersionId: string; kind: "EQUAL" | "PROPORTIONAL";
  isDefault: boolean;                          // versão inicial (effectiveFrom 1970-01-01) => "(padrão)"
  from: string | null;                         // 1º dia do trecho DENTRO do período; null = desde o início do período
  to: string | null;                           // último dia do trecho dentro do período; null = até o fim do período
  shares: Array<{ memberId: string; bps: number }>;   // EQUAL: partes iguais dos participantes do período (equalShares)
  expensesCount: number; totalInCents: number;        // despesas comuns do trecho (informativo)
};
export type SplitExplanationDTO = {
  segments: SplitSegmentDTO[];                 // regras em vigor em algum dia do período e já vigentes (effectiveFrom <= min(fim do período, hoje))
  weighted: null | { shares: Array<{ memberId: string; permille: number }> };   // Σ permille = 1000; null se total comum = 0
  showWeighted: boolean;                       // há ≥ 2 vetores de percentual DIFERENTES entre os trechos e weighted != null
};
// SettlementDTO (SDD-002 §2) ganha:
//   splitExplanation: SplitExplanationDTO | null       // null quando totalSharedInCents = 0
//   personal: { count: number; totalInCents: number }  // despesas "Só meu" do período
export type SplitHistoryResponse = { items: RuleVersionDTO[] };   // todas as versões, effectiveFrom desc, createdAt desc

export type SettlementIndicatorDTO = {
  current: null | { periodKey: string; state: "PENDING" | "IN_ORDER"; toSettleInCents: number };
  //  null: mês sem despesas comuns (EMPTY) ou menos de 2 membros ativos
  previous: null | { monthsCount: number; totalInCents: number; oldestPeriodKey: string };   // janela de 12 meses antes do período corrente
};

// src/modules/split/preview.ts  (puro)
export const PreviewRuleSchema = SplitRuleInputSchema;     // mesmo corpo do PUT (kind, shares, effectiveFrom?)
export type RulePreviewDTO = {
  effectiveFrom: string;                                     // padrão: hoje
  currentShares: Array<{ memberId: string; bps: number }>;   // regra vigente hoje
  nextShares: Array<{ memberId: string; bps: number }>;
  period: { key: string };                                   // mês corrente
  currentToSettleInCents: number; nextToSettleInCents: number;
  impactInCents: number;                                     // Σ|Δ saldo| ÷ 2 (inteiro)
  affectedExpensesCount: number;                             // despesas comuns com occurredOn >= effectiveFrom no mês
};
export function suggestBpsFromIncomes(i: Array<{ memberId: string; ordinal: number; incomeInCents: number }>): Array<{ memberId: string; bps: number }>;
//   percentual inteiro: apportion(100, rendas) * 100; soma de rendas 0 => RangeError (UI: "Informe as rendas")

// src/modules/familia/schemas.ts  (acréscimos)
export const UpdateFamilySettingsSchema = z.object({
  version: versionSchema,
  settlementEnabled: z.boolean(),
  confirmPending: z.boolean().optional(),                    // true = "Desligar mesmo assim"
}).strict();
// CreateFamilySchema ganha: settlementEnabled: z.boolean().optional()   (padrão true)
// MeDTO.membership e FamilyDTO.family ganham: settlementEnabled: boolean
```

---

## 3. Contratos de API

| Rota | Papel | Corpo/params | Sucesso | Erros |
| :-- | :-- | :-- | :-- | :-- |
| `GET /api/v1/settlement?period=` | todos | — | `200 SettlementDTO` (+ `splitExplanation`, `personal`) | 409 `SETTLEMENT_DISABLED` |
| `GET /api/v1/split-rule/history` | todos | — | `200 SplitHistoryResponse` | 409 `SETTLEMENT_DISABLED` |
| `POST /api/v1/split-rule/preview` | **ADMIN** | `PreviewRuleSchema` | `200 RulePreviewDTO` (nada gravado) | 400 (somas) · 403 · 409 `SETTLEMENT_DISABLED` · 422 `SHARES_MEMBER_MISMATCH` / `EFFECTIVE_FROM_IN_PAST` |
| `PATCH /api/v1/family/settings` | **ADMIN** | `UpdateFamilySettingsSchema` | `200 { family: FamilyDTO["family"] }` | 403 · 409 `VERSION_CONFLICT` ("A família foi alterada por {Nome}. Recarregue para continuar.") · **409 `SETTLEMENT_PENDING`** (`details: { pendingInCents, months: Array<{ period, toSettleInCents }> }`, "Há R$ X a acertar entre os membros") quando desliga com diferença e `confirmPending` ≠ true |
| `POST /api/v1/families` | usuário | `CreateFamilySchema` (+ `settlementEnabled?`) | `201` (família nasce com a chave informada; padrão ligada) | — |
| `POST /api/v1/transactions` · `PATCH /transactions/:id` · previstas | todos | `isSharedExpense` | — | **422 `SETTLEMENT_DISABLED`** quando `true` e o acerto está desligado |
| `GET /api/v1/transactions/defaults` | todos | — | `TransactionDefaults` ganha `split: { available: boolean; ruleShares: Array<{ memberId; bps }> \| null }` (`available = settlementEnabled ∧ membros ativos ≥ 2`) | — |

`PATCH /family/settings` é idempotente (`Idempotency-Key`); o `409 SETTLEMENT_PENDING` **não** é gravado no registro de idempotência (ADR-009 §4): o reenvio com `confirmPending: true` usa **nova** chave. Sem diferença em aberto ⇒ desliga direto. Desligar/ligar grava `FamilyEvent(SETTLEMENT_TOGGLED)` (SDD-012/ADR-019) e incrementa `Family.version`. Nada mais é escrito.

---

## 4. Regras e algoritmos

### 4.1 Trechos de vigência e ponderado (US-022) — `src/modules/split/explain.ts` (puro)
```typescript
export function explainByRules(i: { period: Period; today: DateISO; rules: RuleInput[]; members: MemberInput[];
                                    expenses: ExpenseInput[]; result: SettlementResult }): SplitExplanationDTO | null;
```
1. `limit = min(period.end, today)`. `segmentsStart = ruleAt(rules, period.start)` e, para cada versão com `effectiveFrom ∈ (period.start, limit]` (ordenadas; **mesma data ⇒ vale a de `createdAt` maior**, como `ruleAt`), um novo trecho. `from` = `effectiveFrom` do trecho (primeiro: `null`); `to` = dia **anterior** ao `effectiveFrom` do seguinte (último: `null`).
2. `shares` do trecho: `EQUAL` ⇒ `equalShares(participantes)` com participantes `joinedOn <= period.end`; `PROPORTIONAL` ⇒ `bps` da regra (membros ausentes = 0). `expensesCount/total` por `ruleAt(occurredOn)`.
3. `weighted = apportion(1000, quotas do SettlementResult)` na ordem canônica; `result.totalSharedInCents = 0` ⇒ `explanation = null`.
4. `showWeighted` ⇔ há ≥ 2 vetores `shares` distintos entre trechos ∧ `weighted != null`.

```typescript
export function formatSplitLabel(e: SplitExplanationDTO, order: string[]): { label: string; weightedLine: string | null };
```
- 1 trecho: `isDefault` ⇒ `"Divisão igual (padrão)"`; senão `"Divisão igual (50% / 50%)"` ou `"Divisão proporcional (58% / 42%)"` (percentuais na `order` canônica; `formatBpsList`).
- ≥ 2 trechos: `"50% / 50% até 03/10 · 58% / 42% a partir de 04/10"`; com 3+: intermediários `"… de 04/10 a 19/10"`. Datas `dd/MM`.
- `weightedLine = showWeighted ? "Na prática neste mês: 55,7% / 44,3%" : null` (`permille` ⇒ `formatPermille(557) = "55,7"`; sem `float`).
**Vetores obrigatórios**
| # | Entrada | Esperado |
| :-- | :-- | :-- |
| X1 | regras: `EQUAL` (1970) e `PROPORTIONAL` Mariana 58 / Lucas 42 desde 04/10/2026; 400,00 em 02/10 (Mariana), 1.000,00 em 10/10 (Lucas); período 2026-10, hoje 12/10 | 2 trechos (`to 2026-10-03` / `from 2026-10-04`); quotas 78000/62000; `weighted` [557, 443]; label `50% / 50% até 03/10 · 58% / 42% a partir de 04/10`; linha "Na prática neste mês: 55,7% / 44,3%" |
| X2 | X1, período 2026-09 | 1 trecho `EQUAL`; label `Divisão igual (50% / 50%)` (regra 58/42 **não** aparece; vigência futura ao período) |
| X3 | só a versão inicial (1970), 71700 em setembro | `Divisão igual (padrão)`; `showWeighted false` |
| X4 | 3 membros `EQUAL` | `33,34% / 33,33% / 33,33%` |
| X5 | regra nova com `effectiveFrom` em 25/10, hoje 28/10, **sem** despesas após 25/10 | 2 trechos (segundo com `expensesCount 0`); label mostra ambos |
| X6 | total comum 0 | `splitExplanation = null` (UI: "Nenhuma despesa dividida neste mês"; sem "Na prática") |
| X7 | duas regras **com a mesma `effectiveFrom`** | vale a de `createdAt` maior (uma só trecho) |
| X8 | `apportion(1000, [78000, 62000])` | `[557, 443]` (soma 1000) |
`GET /split-rule/history` lista `effectiveFrom`, tipo e percentuais; membros que saíram aparecem como "(ex-membro)" (ADR-019).

### 4.2 Pendências de acerto (US-028/029) — `src/modules/split/pending.ts`
```typescript
export function pendingSettlementMonths(tx, ctx, a: { fromPeriodKey?: string; toPeriodKey: string; capMonths?: number }):
  Promise<Array<{ periodKey: string; toSettleInCents: number }>>;   // só períodos com status PENDING; ordenados do mais antigo
```
Carrega **uma vez** as despesas comuns ativas do intervalo (`periodPredicate`) e os acertos ativos (`settlementPeriod` no intervalo), agrupa por `periodOf(occurredOn, cutDay)`, executa `computeSettlement` por período (membros, regras uma vez). `toSettleInCents = Σ suggestions.amount`. **Home**: `to = período anterior ao corrente`, `from = to − 11 meses`; `current` vem do `computeSettlement` do período corrente (já carregado no instantâneo). **Desligar**: `from = mês da 1ª despesa dividida` (teto 120 meses), `to = período corrente` (inclui o corrente). `pendingInCents = Σ toSettleInCents`.
**Indicador (`SettlementIndicatorDTO`)**: `current`: `EMPTY`/`NEEDS_MORE_MEMBERS` ⇒ `null`; `PENDING` ⇒ `{ state: "PENDING", toSettleInCents }`; `BALANCED`/`SETTLED` ⇒ `IN_ORDER`. `previous`: `monthsCount`, `totalInCents`, `oldestPeriodKey` dos meses anteriores pendentes; `null` se nenhum. Acerto **desligado** ⇒ `HomeDTO.settlementIndicator = null`.
**Fonte única**: o indicador e o painel usam o **mesmo** `computeSettlement` ⇒ nunca divergem (teste de igualdade).

### 4.3 Linguagem neutra (`src/modules/split/copy.ts`; tudo por constante, testado)
| Chave | Texto |
| :-- | :-- |
| `hero.PENDING` | `Para equilibrar o mês: {De} transfere {R$} para {Para}` (valor via `Money`) |
| `toSettle` | `Valor a acertar: {R$}` (uma linha no painel quando `PENDING`) |
| `indicator.pending` / `indicator.inOrder` | `Acerto do mês: {R$} a acertar` / `Acerto do mês: em dia` |
| `indicator.previous` | `Acertos pendentes de meses anteriores: {n} mês(es) ({R$})` (1 mês / N meses) |
| `empty` | `Nenhuma despesa dividida neste mês` (substitui "Nenhuma despesa comum neste mês."; o complemento "Marque despesas como Dividir com a família…" permanece) |
| `disabled` | `O acerto de contas está desligado nesta família` + link `Voltar para o início` |
| `personal` | `{n} despesa(s) Só meu neste mês ({R$})` · link `Ver no Extrato` |
**Teste de unidade**: nenhuma constante de `copy.ts` nem texto renderizado das telas de acerto/Home casa `\bdeve(m)?\b` (a palavra "deve" não existe; "Cota devida" pode ficar). Sem cor de alerta no indicador (classes de estado "atenção/erro" proibidas no componente; teste de componente).

### 4.4 Desligar/ligar (US-028)
`updateFamilySettings` (transação): `SELECT … FROM families WHERE id FOR UPDATE`; `version` divergente ⇒ `409 VERSION_CONFLICT`; se `enabled → false` e `!confirmPending`: `pending = pendingSettlementMonths(todos)`; `Σ > 0` ⇒ `409 SETTLEMENT_PENDING`; grava `settlementEnabled`, `version+1`, `updatedBy`, `FamilyEvent`. Ligar: só grava. Sem mudança de valor ⇒ `200` sem tocar `version`. **Duplo clique**: mesma chave ⇒ 1 efeito; chaves diferentes ⇒ a 2ª recebe `VERSION_CONFLICT`.
**Onboarding**: passo opcional "Como vocês dividem as despesas?" (marcado "Quero acertar as diferenças entre os membros"; alternativa "Só controlar, sem dividir") envia `settlementEnabled`; dica "Você pode mudar isso depois em Configurações da família".

### 4.5 "Só meu" por padrão (US-030)
- `CreateExpenseSchema.isSharedExpense`: `.default(false)`. `CreatePlannedExpenseSchema.isSharedExpense`: `.default(false)`; migração ajusta o *default* de coluna (linhas existentes **não** mudam). `UpdateTransactionSchema`/`UpdatePlanned…` inalterados.
- Formulário: interruptor **desligado** ao abrir, **não** lembra a escolha anterior; visível só se `defaults.split.available`; rótulo dinâmico `"Só meu"` / `"Divisão igual (50% / 50%)"` (de `defaults.split.ruleShares` ou `["split-rule"]`). Receita nunca tem o campo. Quatro toques do lançamento rápido preservados (nenhum campo novo obrigatório).
- Painel: linha `personal` (§4.3) só se `count > 0`.

### 4.6 Prévia da regra (US-031) — `src/modules/split/preview.ts` (puro) + `previewRule` (serviço)
1. Valida como o `PUT` (cobertura dos membros ativos; soma 100%; `effectiveFrom` ≥ início do período corrente), **sem gravar**.
2. Despesas comuns do mês corrente; `A = computeSettlement(regras atuais)`; `B = computeSettlement(regras + candidata { effectiveFrom, createdAt = agora })`.
3. `impactInCents = (Σ_m |B.balance_m − A.balance_m|) ÷ 2` (soma sempre par); `currentToSettle`, `nextToSettle` = Σ das sugestões; `affectedExpensesCount` = despesas com `occurredOn >= effectiveFrom`.
4. Mensagens: `"Vale a partir de {dd/MM/aaaa}. Lançamentos anteriores não mudam."` e `"Impacto no acerto de {mês}: {R$}"`.
**Vetores**
| # | Cenário (hoje 12/10/2026; Mariana ord. 0, Lucas ord. 1; regra atual EQUAL) | Esperado |
| :-- | :-- | :-- |
| P1 | despesa 100000 de Lucas em 10/10; candidata 58/42 | `impact 0` |
| P2 | P1 + 50000 de Lucas em 12/10 | quotas B: Mariana 79000 / Lucas 71000; `A.balance Lucas +75000`, `B +79000` ⇒ **`impact 4000`** (R$ 40,00); `affectedExpensesCount 1` |
| P3 | candidata com soma ≠ 100% | 400 "Os percentuais precisam somar 100%"; nada gravado |
| P4 | `effectiveFrom` antes do início do período | 422 `EFFECTIVE_FROM_IN_PAST` |
| R1 | `suggestBpsFromIncomes([650000, 480000])` | `[5800, 4200]` (apportion(100) = 58/42) |
| R2 | rendas `[0, 0]` | `RangeError` ⇒ UI "Informe as rendas" |
| R3 | rendas iguais, 3 membros | `[3400, 3300, 3300]` |
**Salvar** usa o `PUT /split-rule` existente (inalterado); a UI volta ao painel com toast "Regra de divisão atualizada" e esconde o FAB (SDD-010 §6.4).

---

## 5. Dados e migração (R2.1)

Migração `r21_familia_configuracoes` (SQL, nome acompanha a história 028; **não** editar migração aplicada):
```sql
ALTER TABLE "families" ADD COLUMN "settlementEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedByMemberId" UUID;
ALTER TABLE "planned_expenses" ALTER COLUMN "isSharedExpense" SET DEFAULT false;     -- linhas existentes inalteradas
CREATE TYPE "FamilyEventType" AS ENUM ('FAMILY_RENAMED','ROLE_CHANGED','SETTLEMENT_TOGGLED','MEMBER_REMOVED','MEMBER_LEFT','INVITATION_RESENT');
CREATE TABLE "family_events" ( "id" UUID PRIMARY KEY, "familyId" UUID NOT NULL REFERENCES "families"("id"),
  "type" "FamilyEventType" NOT NULL, "actorMemberId" UUID NOT NULL, "targetMemberId" UUID, "changes" JSONB NOT NULL DEFAULT '{}',
  "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP );
ALTER TABLE "family_events" ADD CONSTRAINT family_events_actor_fkey FOREIGN KEY ("familyId","actorMemberId") REFERENCES "members"("familyId","id");
CREATE INDEX family_events_family_at_idx ON "family_events" ("familyId","at" DESC);
CREATE TRIGGER family_events_append_only BEFORE UPDATE OR DELETE ON "family_events" FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
```
`transactions.isSharedExpense` já tem `@default(false)` no Prisma: **sem mudança** (a mudança é do *schema Zod*). Sem `DELETE` em nenhuma tabela do ledger. Rodar a suíte inteira após a migração.

---

## 6. Interface
- **Acerto (`/acerto`)**: título do mês; **rótulo** (US-022) logo abaixo + link "Ver histórico de regras" (drawer, `GET /split-rule/history`); mês misto: 2ª linha "Na prática neste mês: …"; hero neutro; "Valor a acertar"; cartões por membro; lista "Ver despesas comuns do período" (rótulo "n/N" nas parcelas só na R3); linha "N despesas Só meu neste mês (R$ X) · Ver no Extrato". Estados: skeleton, vazio ("Nenhuma despesa dividida neste mês"), `NEEDS_MORE_MEMBERS`, desligado, erro "Não foi possível carregar a regra de divisão" + "Tentar de novo" (histórico).
- **Regra (`/acerto/regra`)**: campos por membro com soma ao vivo; painel **Prévia** (atualiza ao digitar, chamada `POST /split-rule/preview` com *debounce* de 300 ms e cancelamento; só desabilita "Salvar regra" se a soma ≠ 100%); "Sugerir pela renda" recolhido, campos de renda não persistidos e nota "As rendas informadas não são guardadas"; Membro vê leitura + "Só o Administrador altera a regra"; **FAB oculto**; "Salvar regra" nunca coberto.
- **Configurações da família** (`/familia`): chave "Acerto de contas entre membros" (Admin; desabilitada para Membro com dica); diálogo de confirmação com "Há R$ X a acertar entre os membros" / "Desligar mesmo assim" / "Cancelar".
- **Home**: linha(s) de acerto no card Resumo (SDD-010 §6.1); sem card separado "Acerto do mês".
- **Menu**: "Acerto" some com o recurso desligado (`MeDTO.membership.settlementEnabled`).
- **Chaves de cache**: `["split-rule"]`, `["split-rule-history"]`, `["settlement", period]`, `["family"]`, `["me"]`, `["home"]`. `PATCH /family/settings` invalida `["family"]`, `["me"]`, `["home"]`, `["settlement"]`, `["split-rule"]`, `["transactions"]`. Em `409 SETTLEMENT_DISABLED` a tela invalida `["me"]` e mostra o estado "desligado". Preview: sem cache (`gcTime: 0`).

---

## 7. Segurança e isolamento
`PATCH /family/settings`, `PUT` e `preview` só ADMIN (matriz de permissão). `familyId` da sessão; `Family` lida/gravada só pela do contexto. A renda nunca sai do navegador. `.strict()` rejeita `familyId`, `splitEngine`, `settlementEnabled` fora da rota certa. Logs sem valores.

---

## 8. Testes obrigatórios (BDD → teste) — U/C/I/E como no SDD-010

### Regressão do motor (obrigatória antes e depois da R2.1)
`computeSettlement` vetores **S1..S13** (SDD-002 §4.7) e **dados homologados** como casos nomeados (integração, relógio fixo): outubro/2026 = 316990 comum, cota 158495 a 50/50, diferença 114995; setembro/2026 = 71700, cota 35850, diferença 26050; mês com troca 50/50 ➜ 58/42 (40000 em 02/10 e 100000 em 10/10) ⇒ cotas **78000 e 62000**. Mesmos valores devem aparecer em `GET /settlement`, na Home (`settlementIndicator`) e no `explain`.

### US-022 (ordem 2)
| Cenário BDD | Testes |
| :-- | :-- |
| Regra única mostra a regra do mês / Mês passado não herda regra futura | **U**: X2, X3. **I**: `GET /settlement?period=2026-09` ⇒ 1 trecho `EQUAL`, cota 35850; regra 58/42 desde 04/10 não aparece. **E**: "Divisão igual (50% / 50%)" e sem "58%". |
| Mês com mudança: dois trechos e ponderado / Ponderado bate com as cotas | **U**: X1, X8. **I**: `splitExplanation.weighted` [557,443], `Σ quotas = totalShared`. **E**: textos do cenário e cotas "R$ 780,00"/"R$ 620,00". |
| Mês sem despesas comuns | **U**: X6. **E**: "Nenhuma despesa dividida neste mês" sem "Na prática". |
| Todos veem o histórico / Administrador altera e o rótulo se atualiza | **I**: `GET /split-rule/history` como MEMBER ⇒ 200 (sem ação de alterar na UI); `PUT` a partir de hoje ⇒ `explain` do mês corrente com os 2 trechos e a data de hoje. **E**. |
| Números homologados permanecem | **I**: regressão acima + rótulo `Divisão igual (50% / 50%)`. |
| Falha ao carregar o histórico | **E**: `route.abort()` ⇒ "Não foi possível carregar a regra de divisão" + "Tentar de novo". |
| (infra) Mesma fonte | **I (propriedade, ≥ 200 casos)**: `weighted == apportion(1000, quotas)`; `Σ permille = 1000`; trechos cobrem o período sem sobreposição. |

### US-028 (ordem 7)
| Cenário BDD | Testes |
| :-- | :-- |
| Existentes ligadas / Nova nasce ligada e pergunta no onboarding / Escolher não dividir | **I**: migração mantém `settlementEnabled = true` nas famílias existentes; `POST /families` sem o campo ⇒ `true`; com `false` ⇒ desligada. **E**: passo "Como vocês dividem as despesas?" e dica. |
| Desligar sem diferença / esconde telas e campo | **I**: `PATCH` ⇒ 200, `version+1`; `GET /settlement` ⇒ 409 `SETTLEMENT_DISABLED`; `POST /transactions` com `isSharedExpense:true` ⇒ 422. **E**: menu sem "Acerto", Home sem indicador, formulário sem "Dividir". |
| Desligar com diferença exige confirmação / Cancelar mantém | **I**: 1º `PATCH` ⇒ 409 `SETTLEMENT_PENDING` com `pendingInCents 38000` e meses; com `confirmPending` ⇒ 200. **E**: aviso e "Desligar mesmo assim"; "Cancelar" mantém a chave. |
| Desligar não apaga e religar restaura / Totais não mudam | **I**: *checksum* de `transactions(isSharedExpense)`, `split_rule_versions`, `transfer_groups` idêntico antes/depois; religar ⇒ painel igual; `ledgerTotals` e saldos idênticos com o recurso desligado. |
| Membro não altera | **I** (matriz de permissão): MEMBER ⇒ 403. **E**: chave desabilitada com a dica. |
| Endereço direto desligado / Linguagem neutra | **E**: `/acerto` ⇒ "O acerto de contas está desligado nesta família" + "Voltar para o início"; painel com "Valor a acertar: R$ 380,00" e sem "deve" (**U** em `copy.ts`). |
| Falha de rede / Duplo clique | **E**: `route.abort()` ⇒ mensagem padrão e chave volta; **I**: `Promise.all` mesma chave ⇒ 1 `FamilyEvent`; chaves diferentes ⇒ 1×200 e 1×409. |
| (infra) Pendências em todos os meses | **U/I**: `pendingSettlementMonths` com 3 meses pendentes e 1 acertado ⇒ só os 3; teto de 120 meses. |

### US-029 (ordem 8)
| Cenário BDD | Testes |
| :-- | :-- |
| Indicador mostra o valor / sem "deve" / Mês equilibrado / Sem despesas comuns | **I**: `settlementIndicator.current` `PENDING 38000` / `IN_ORDER` / `null`. **E**: "Acerto do mês: R$ 380,00 a acertar", "em dia", sem linha. |
| Tocar abre o painel / Dívida de mês anterior / aviso leva ao mês mais antigo / Mês acertado não gera aviso / some após acertar | **I**: setembro com 26050 pendente ⇒ `previous { monthsCount 1, totalInCents 26050, oldestPeriodKey "2026-09" }`; após `POST /settlements` de 26050 ⇒ `previous null`. **E**: navegação para `/acerto?period=2026-09`. |
| Valores ocultos / Acerto desligado / Reconcilia com o painel | **E/C**: "Acerto do mês: R$ ••••• a acertar"; **I**: desligado ⇒ `settlementIndicator null`; **I (propriedade)**: indicador == `getSettlement` do mesmo mês. |
| (infra) Janela de 12 meses | **I**: pendência de 13 meses atrás **não** entra em `previous`; de 12 meses entra. |

### US-030 (ordem 9)
| Cenário BDD | Testes |
| :-- | :-- |
| Nova despesa nasce Só meu / Quatro toques / não lembra a escolha | **U**: `CreateExpenseSchema.parse` sem `isSharedExpense` ⇒ `false`; idem previsão. **E**: interruptor desligado; segundo formulário volta a desligado; "Salvar" em 4 interações. |
| Ligar divide pela regra vigente | **I**: `isSharedExpense:true` + regra igual ⇒ cota 15000 para cada membro em 30000; **E**: rótulo "Divisão igual (50% / 50%)". |
| Campo some (desligado / único membro) / Previsão e cartão também / Receita sem campo | **I**: `defaults.split.available false` nos dois casos; **E**: ausência do interruptor; previsão e compra no cartão nascem "Só meu". |
| Lançamentos antigos preservam a marcação | **I**: linhas anteriores à migração mantêm `isSharedExpense`; acerto idêntico. |
| Painel informa as Só meu / sem Só meu | **I**: `personal { count 2, totalInCents 12500 }`; **E**: "2 despesas Só meu neste mês (R$ 125,00)" e o link filtra `shared=false`. |
| (infra) Compatibilidade de contrato | **I**: `POST` sem o campo grava `false`; `POST` com `true` e acerto desligado ⇒ 422; baixa de previsão herda o valor da previsão. |

### US-031 (ordem 10)
| Cenário BDD | Testes |
| :-- | :-- |
| Prévia mostra vigência e impacto / considera lançamentos a partir da vigência | **U**: P1, P2. **I**: `POST /split-rule/preview` ⇒ `impactInCents 0` e `4000`; **nada gravado** (contagem de `split_rule_versions` igual). **E**: textos. |
| Sugestão pela renda / editável | **U**: R1..R3. **E**: preenche 58%/42%, nota "As rendas informadas não são guardadas"; edição manual atualiza a prévia. |
| Soma ≠ 100% / Prévia sem salvar não altera / Salvar volta ao painel / Membro vê leitura / "+" não cobre o salvar | **I**: 400; MEMBER ⇒ 403 no preview; **E**: toast "Regra de divisão atualizada", FAB oculto a 375 px, "Salvar regra" totalmente visível. |

---

## 9. Estimativa, dependências e impacto em testes e código existentes

| História | PO | **TL** | Observação |
| :-- | :-: | :-: | :-- |
| US-022 | 3 | **3** | `explainByRules`, `formatSplitLabel`, `GET /split-rule/history`, UI |
| US-028 | 5 | **5** | Migração, guarda `SETTLEMENT_DISABLED`, `PATCH /family/settings`, `pendingSettlementMonths`, onboarding, `FamilyEvent` |
| US-029 | 3 | **3** | Indicador (reusa `pending`), cópia neutra, Home |
| US-030 | 3 | **3** | Mudança de **contrato** (default) com varredura de testes; linha "Só meu" |
| US-031 | 3 | **3** | Função pura + rota `preview` + UI (debounce, renda) |
Dependências: 022 antes de 031; 028 antes de 029/030; 029 depende do Resumo (SDD-010).

**Cenários e testes de R1/R2 que mudam** (atualizar na mesma história que os provoca; nenhum número de acerto muda):
| Origem | O que muda | Por quê |
| :-- | :-- | :-- |
| `US-005` (feature + `tests/integration/us-005-006-lancamentos.int.test.ts`): "Despesa comum com sucesso" (linha "está marcada como Dividir"), "Despesa pessoal" | Padrão passa a ser **Só meu**; "comum" exige **ligar** o interruptor; "pessoal" é o padrão | US-030 |
| `US-016a` ("Compra pessoal no cartão", "Compra compartilhada…") e `tests/integration/us-016a-compra-cartao.int.test.ts` | Idem (dividir só ao ligar) | US-030 |
| `US-018` ("Dividir com a família desligado") e `us-018-despesa-prevista.int.test.ts`, `tests/unit/previstas/rules.test.ts` | Previsão nasce "Só meu" (revisa Q-22) | US-030 / D-GES-15 |
| `US-009` (linhas "Lucas deve R$ 400,00 para Mariana"), `US-011`, `US-013`, `US-013b`, `US-016a` (`…deve R$ 150,00…`) | Texto do herói: "Para equilibrar o mês: Lucas transfere R$ 400,00 para Mariana"; "Valor a acertar: R$ 400,00" | US-028 (RN-019.4) |
| `US-009` ("Mês sem despesas comuns") | Texto "Nenhuma despesa dividida neste mês" | US-022 |
| `US-012` ("Home com dados", "Card de acerto abre o painel", resumo) e `us-012-home.int.test.ts` | Home reorganizada (SDD-010); card "Acerto do mês" vira linha do Resumo | US-025/029 |
| Testes de integração que criam despesas **via API** esperando `isSharedExpense = true` por omissão (`us-009`, `us-011`, `us-013`, `us-013b`, `us-016a`, `us-017b`, `us-019`) | Passar `isSharedExpense: true` **explícito** (ou usar a fábrica, que grava direto) | US-030 |
| `tests/unit/transacoes/schemas.test.ts` (default `true`), `optimistic.test.ts` | Default `false` | US-030 |
| `tests/support/factories.ts` (`makeTransaction`) | Parâmetro `isSharedExpense` explícito nas fábricas usadas pelo acerto; aceitar `split?` (ignorado até a EN-002, ADR-016) | US-030 / preparação |
| `tests/e2e/steps/*` que semeiam por UI o interruptor | Ligar o interruptor explicitamente | US-030 |

**Arquivos de código afetados**: `split/{service,schemas,hero,labels}.ts` + novos `explain.ts`, `pending.ts`, `preview.ts`, `copy.ts`; `familia/{schemas,service,repo}.ts` (`settlementEnabled`, `PATCH /family/settings`, onboarding); `transacoes/{schemas,service}.ts` e `previstas/{schemas,service}.ts` (default e guarda); `app/(app)/acerto/*`, `home-screen.tsx`, `transaction-drawer.tsx`, `planned-drawer.tsx`, `onboarding-flow.tsx`; `src/app/api/v1/{split-rule,family,settlement}/**`.
