# SDD-020: Compra parcelada com parcelas já pagas na entrada (US-065)

- **História**: [US-065](../../product-owner/backlog/stories/US-065-parcelas-ja-pagas-na-entrada.md) · **Fluxo**: [FLUXO-014](../../product-owner/flows/FLUXO-014-parcelamento-tags-e-analise.md) §1 (acréscimo)
- **Rastreabilidade**: NEED-024 (RN-024.1..7) · NEED-003 · Q-U03 · D-PO-54, D-PO-55, D-PO-56 · D-GES-29/30 · **[ADR-027](../adrs/ADR-027-parcelas-anteriores-ao-app.md)** (leitura obrigatória) · ADR-017, ADR-020, ADR-014
- **Depende de**: [SDD-014](SDD-014-parcelamento-esboco.md) (US-040a/b **implementadas**: `src/modules/cartoes/installments.ts`), [SDD-008](SDD-008-cartoes-fatura.md) (ciclo, fatura, limite), [SDD-000](SDD-000-convencoes-transversais.md). **Não** depende da EN-002 nem da US-042 (cenário `@depende-us-042` só roda quando `INSTALLMENT_SPLIT_RELEASED = true`).
- **Status**: **Aprovado para Desenvolvimento** (R4-A) · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA (modelo intermediário basta: o domínio crítico está resolvido aqui)
- **Estimativa**: **5** (confirma o PO). Detalhe em §9.

---

## 1. Gaps técnicos e respostas às dúvidas do PO

| Dúvida / Gap | Resolução |
| :-- | :-- |
| **Modelo** (PO: contador ou registros marcados?) | **Contador** `InstallmentPlan.paidBeforeAppCount` (ADR-027 §1). Nenhuma linha para as pagas; nenhuma consulta de valor muda. |
| **Resto de centavos com a 1ª paga** | Valores do **plano completo** `splitInstallments(total, N)`; lançam-se os índices `P..N−1`. Com `P ≥ 1` as restantes valem `⌊total ÷ N⌋` (a sobra ficou na 1ª, paga). Confirma a hipótese do PO. Prévia avisa quando `total mod N ≠ 0` e `P ≥ 1`. |
| **RN-024.7 (parcela atual × data da compra)** | A data da compra **deixa de ser exigida** quando `P ≥ 1`. O campo de data vira **âncora** da próxima parcela (padrão hoje ⇒ fatura aberta). A coerência é garantida pela prévia ("a próxima (5/10) na fatura de nov/2026") e pela regra existente `INVOICE_ALREADY_PAID`. |
| Fatura fechada e não paga (entre fechamento e vencimento) | O seletor "Próxima parcela na fatura de" mostra a aberta (padrão) e, se existir, a **fechada não paga** imediatamente anterior; a escolha vira `occurredOn = closingDate` dela. |
| `count = 1` / à vista | `paidBeforeApp` só é aceito com `installments ≥ 2` e cartão. |
| Restar só 1 parcela (ex.: 10x, 9 pagas) | Válido: plano com **uma** linha `10/10`. `CHECK` do plano continua `installmentCount BETWEEN 2 AND 24`. |
| Total mínimo | Mantém `total ≥ installments` (≥ 1 centavo por parcela do plano completo). |
| Limite (D-PO-55) | Sem regra nova: `cardUsage` só vê as lançadas. BDD "R$ 3.500,00" sai do cálculo existente. |
| Exclusão (040b) e Desfazer | Inalterados: atuam nas parcelas lançadas; o carimbo (ADR-020 §3) não conhece as pagas. Limite volta a 5.000,00. |
| Edição (US-041, quando entrar) | Só linhas lançadas; `THIS_AND_NEXT` parte da selecionada; as anteriores ao app nunca são alvo. `paidBeforeAppCount` imutável (sem rota de edição). |
| Acerto (US-042) | Rateio só nas lançadas, cada uma no mês da sua competência; meses passados intocados. Enquanto `INSTALLMENT_SPLIT_RELEASED = false` vale `INSTALLMENT_SPLIT_UNAVAILABLE` (Só meu + aviso da US-052). |
| Mês acertado | Criar não pede confirmação (regra do SDD-014 §1). Com âncora na fatura aberta a competência é futura/corrente. |
| Idempotência / atomicidade / concorrência | Iguais à US-040a: uma transação, faturas travadas em ordem crescente de `ref`, `Idempotency-Key` cobre a compra inteira. |
| "Ver compra" | Mostra "Parcelas 1 a P: anteriores ao app (já pagas)" (singular se P = 1: "Parcela 1: anterior ao app (já paga)") + lista das lançadas. Data da compra exibida só se `purchaseOnKnown`. |
| Otimista | Nenhuma (como a compra parcelada, SDD-014 §1). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/cartoes/installments.ts (PURO) — acréscimos
export type RemainingInstallmentsInput = {
  totalInCents: number; count: number;          // plano COMPLETO (2..24)
  paidBeforeApp: number;                         // 0..count-1
  anchorOn: DateISO;                             // P = 0: data da compra; P ≥ 1: data na fatura da próxima parcela
  closingDay: number; dueDay: number;
};
/** Rascunhos SÓ das parcelas a lançar (no = P+1..N). P = 0 ⇒ idêntico a buildInstallments. */
export function buildRemainingInstallments(i: RemainingInstallmentsInput): InstallmentDraft[];
// Implementação (obrigatória, não reescrever o ciclo):
//   amounts = splitInstallments(total, count)            // RangeError se total < count
//   if (paidBeforeApp < 0 || paidBeforeApp >= count || !Number.isInteger(paidBeforeApp)) throw RangeError
//   remaining = count - paidBeforeApp
//   ref1 = invoiceRefFor(anchorOn, closingDay)
//   para j em 0..remaining-1: no = paidBeforeApp + j + 1; amountInCents = amounts[paidBeforeApp + j];
//     invoiceRef = addMonthsToRef(ref1, j); occurredOn = addMonthsClamped(anchorOn, j);
//     competenceOn = invoiceDates(invoiceRef, closingDay, dueDay).closingDate
//   (remaining = 1 é permitido aqui; o serviço garante count ≥ 2)

export type InstallmentPreview = {                // EMENDA (campos novos com default para P = 0)
  count: number; firstInCents: number; othersInCents: number; sameAmount: boolean; firstInvoiceRef: string;
  paidBeforeApp: number;                          // 0 = comportamento atual
  remainingCount: number;                         // count - paidBeforeApp
  nextNo: number;                                 // paidBeforeApp + 1
  remainingEachInCents: number;                   // valor de cada restante quando P ≥ 1 (todas iguais)
  remainingTotalInCents: number;                  // Σ lançadas
  remainderOnPaidParcel: boolean;                 // P ≥ 1 && total % count !== 0
};
export function previewInstallments(i: { totalInCents: number; count: number; purchaseOn: DateISO; closingDay: number;
  paidBeforeApp?: number }): InstallmentPreview;  // paidBeforeApp ausente = 0 (chamadas atuais não mudam)

// src/modules/transacoes/schemas.ts — CreateExpenseSchema ganha:
const PAID_MSG = "Informe menos parcelas pagas do que o total do parcelamento";
paidBeforeApp: z.number({ error: "Informe um número inteiro de parcelas pagas" })
  .int("Informe um número inteiro de parcelas pagas").min(0, "Informe um número inteiro de parcelas pagas")
  .max(MAX_INSTALLMENTS - 1, PAID_MSG).default(0),
// superRefine (além dos atuais):
//   paidBeforeApp > 0 && installments < 2          ⇒ path ["paidBeforeApp"], "Parcelas já pagas só valem para compra parcelada"
//   paidBeforeApp >= installments (installments ≥ 2) ⇒ path ["paidBeforeApp"], PAID_MSG
// (cardId ausente com installments > 1 já é recusado pela regra existente)

// DTOs (emendas ao SDD-014 §2)
export type InstallmentPlanDTO = {
  /* …campos atuais… */
  paidBeforeApp: { count: number; fromNo: 1; toNo: number; amountInCents: number } | null;  // null se P = 0; amountInCents = Σ das pagas (INFORMATIVO, nunca somado em total)
  purchaseOnKnown: boolean;                                                                  // P = 0
  // purchaseOn: data nominal da 1ª parcela LANÇADA (= data da compra quando P = 0)
  // totalInCents: total ORIGINAL; currentTotalInCents: Σ ATIVAS (lançadas e não removidas)
};
```

---

## 3. Contratos de API

| Rota | Mudança | Erros novos |
| :-- | :-- | :-- |
| `POST /api/v1/transactions` (`cardId` + `installments ≥ 2` + `paidBeforeApp ≥ 0`) | Aceita `paidBeforeApp`; `occurredOn` = âncora quando `paidBeforeApp ≥ 1`. Resposta `201 CreateTransactionResponse` com `transaction` = **primeira parcela lançada** (`no = P+1`) e `plan` completo. | 400 `paidBeforeApp` ("Informe menos parcelas pagas do que o total do parcelamento"; "Parcelas já pagas só valem para compra parcelada"; "Informe um número inteiro de parcelas pagas"). Demais erros do SDD-014 §3 inalterados (`INSTALLMENT_TOTAL_TOO_SMALL`, `INSTALLMENT_SPLIT_UNAVAILABLE`, `INVOICE_ALREADY_PAID`, `FUTURE_DATE_NOT_ALLOWED` sobre a âncora, `INVALID_REFERENCE`). |
| `GET /api/v1/installment-plans/:id` | `paidBeforeApp`, `purchaseOnKnown` | — |
| `GET /api/v1/defaults` / drawer | sem mudança (o seletor de fatura usa `GET /cards/:id/invoices` já existente para saber se a fechada anterior está paga) | — |
| `delete`/`restore` do plano, `PATCH` de parcela | sem mudança de contrato | — |

`.strict()` continua rejeitando `paidBeforeAppCount`, `installmentNo` e afins vindos do cliente: o único nome aceito é `paidBeforeApp`.

---

## 4. Regras e algoritmos

### 4.1 `createInstallmentPurchase` (emenda ao SDD-014 §4.2)
1. `P = input.paidBeforeApp ?? 0`; `anchorOn = occurredOn ?? hoje`; `anchorOn ≤ hoje` (`FUTURE_DATE_NOT_ALLOWED`, mensagem atual).
2. Guardas atuais (cartão ativo, categoria, pagador, total ≥ N, divisão).
3. `drafts = buildRemainingInstallments({ totalInCents, count: N, paidBeforeApp: P, anchorOn, closingDay, dueDay })` (para P = 0 é exatamente o `buildInstallments` atual: teste de equivalência).
4. Travas e faturas: **só** as `ref` dos `drafts` (N − P faturas), em ordem crescente; pagamento ativo ⇒ `422 INVOICE_ALREADY_PAID`.
5. `INSERT InstallmentPlan { totalInCents: total, installmentCount: N, paidBeforeAppCount: P, purchaseOn: anchorOn, … }`.
6. `INSERT` das N − P linhas (`installmentNo = draft.no`, `installmentCount = N`). Rateio/tags/revisões como hoje, só nelas.
7. Revisão `CREATE` de cada parcela inclui `installment: { planId, no, count, paidBeforeApp: P }`.

### 4.2 Invariantes (testadas)
1. Linhas do plano recém-criado = N − P; `no` = P+1..N únicos; refs consecutivas a partir de `invoiceRefFor(anchorOn)`.
2. Σ lançadas = Σ `splitInstallments(total, N).slice(P)`; `paidBeforeApp.amountInCents` = Σ `.slice(0, P)`; soma das duas = `total`.
3. Nenhuma linha com `competenceOn` < `closingDate(invoiceRefFor(anchorOn))` pertence ao plano (nada no passado).
4. `usedInCents` do cartão aumenta exatamente Σ lançadas; excluir o plano devolve o mesmo valor.
5. `paidBeforeAppCount` nunca muda após o `INSERT` (nenhum `UPDATE` o toca; teste por varredura de `prisma.installmentPlan.update` com esse campo + teste de integração).

### 4.3 Prévia (componente `InstallmentPreview`, montada com `<Money>`)
- P = 0: texto atual (SDD-014 §4.1).
- P ≥ 1: **"Restam {N−P} parcelas de {Money(remainingEach)} · a próxima ({P+1}/{N}) na fatura de {formatInvoiceLabel(firstInvoiceRef)}"**; se `N − P = 1`: "Resta 1 parcela de … · ({N}/{N}) na fatura de …". Se `remainderOnPaidParcel`: linha secundária "A diferença de centavos ficou na 1ª parcela, já paga".
- Erro `P ≥ N`: mensagem do schema no campo, botão salvar desabilitado (validação no cliente com o **mesmo** schema).

---

## 5. Dados e migração (`us065_parcelas_anteriores`, SQL cru após o Prisma)

```prisma
model InstallmentPlan {
  // …
  paidBeforeAppCount Int @default(0) // ADR-027: parcelas 1..P pagas antes do app; imutável
  // purchaseOn: data nominal da 1ª parcela LANÇADA (= data da compra quando paidBeforeAppCount = 0)
}
```
```sql
ALTER TABLE "installment_plans" ADD CONSTRAINT installment_plans_paid_before_chk
  CHECK ("paidBeforeAppCount" >= 0 AND "paidBeforeAppCount" < "installmentCount");
-- Sem retropreenchimento: planos existentes ficam com 0 (DEFAULT).
-- tx_installment_shape_chk e tx_sync_competence NÃO mudam (installmentNo BETWEEN 1 AND count já cobre P+1..N).
CREATE OR REPLACE FUNCTION installment_plan_paid_before_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."paidBeforeAppCount" <> OLD."paidBeforeAppCount" THEN
    RAISE EXCEPTION 'paidBeforeAppCount is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER installment_plans_paid_before_immutable BEFORE UPDATE ON "installment_plans"
  FOR EACH ROW EXECUTE FUNCTION installment_plan_paid_before_immutable();
```
Fábrica: `makeInstallmentPurchase({ …, paidBeforeApp? })` (via serviço). Seed: um plano demonstrativo "Sofá 10x, 4 pagas".

---

## 6. Interface
- **Drawer** (`transaction-drawer.tsx`): com `installments ≥ 2` aparece **"Parcelas já pagas"** (`<input type="number" inputmode="numeric" min=0 max=N−1>`, padrão 0, texto de apoio "Quantas já foram pagas antes de usar o app?") logo abaixo de "Parcelas"; com 1x ou conta, o campo some e o valor volta a 0.
- Com P ≥ 1, o campo de data é substituído pelo **seletor "Próxima parcela na fatura de"** (opções: fatura aberta — padrão — e, se houver, a fechada não paga anterior; `<select>` nativo, ≥ 44 px). Ao voltar a P = 0, reaparece o campo de data (valor hoje).
- Prévia sempre visível (`aria-live="polite"`); aviso de limite usa **Σ lançadas** (não o total original).
- **"Ver compra"** (`InstallmentPlanDialog`): bloco cinza no topo "Parcelas 1 a {P}: anteriores ao app (já pagas)" (sem valores clicáveis; `aria-label` igual ao texto); tabela das lançadas como hoje; "Total da compra {Money(total)} · restante lançado {Money(currentTotal)}".
- **Estados**: iguais ao SDD-014 §6 (skeleton, erro com "Tentar de novo", sem conexão preserva o formulário, 409 ⇒ recarregar).
- **Cache**: as mesmas invalidações da compra parcelada.
- Responsivo 375/1280 px; texto sempre presente (não só cor).

---

## 7. Segurança e isolamento
Sem superfície nova: `familyId` da sessão; `paidBeforeApp` é inteiro validado; logs sem descrição/valores. Teste de isolamento existente do plano cobre o DTO novo.

---

## 8. Testes obrigatórios (U = unidade, C = componente, I = integração `db-test`, E = E2E)

**Vetores** (`tests/unit/cartoes/installments.test.ts`, 100% de ramos em `buildRemainingInstallments`):
| # | Entrada | Esperado |
| :-- | :-- | :-- |
| P1 | total 250000, N 10, P 4, âncora 2026-11-10, fechamento 25, venc. 5 | 6 drafts, `no` 5..10, 25000 cada, refs `2026-11 … 2027-04`, `competenceOn 2026-11-25 … 2027-04-25`, datas `2026-11-10 … 2027-04-10` |
| P2 | P = 0 (qualquer entrada dos vetores I1..I12) | **idêntico** a `buildInstallments` (teste de equivalência sobre todos os vetores I*) |
| P3 | total 100001, N 3, P 1, âncora 2026-11-10 | `[33333, 33333]` (`no` 2, 3); Σ pagas 33335; `remainderOnPaidParcel = true` |
| P4 | N 10, P 9 | 1 draft `no 10` |
| P5 | P = N, P = −1, P = 1.5 | `RangeError` |
| P6 | âncora 2026-11-28 (após fechamento 25), N 10, P 4 | 1ª lançada `5/10` em `ref 2026-12` |
| P7 | âncora = `closingDate` da fatura fechada anterior (2026-10-25), hoje 2026-11-01 | 1ª lançada em `ref 2026-10` |
| P8 | fechamento 28, âncora 2027-01-31, N 6, P 3 | refs `2027-02`, `2027-03`, `2027-04` (ADR-020: uma por fatura) |
| Propriedade (≥ 1000 casos, semente fixa) | N 2..24, P 0..N−1, totais aleatórios ≥ N, âncoras aleatórias | `drafts.length = N − P`; Σ drafts + Σ pagas = total; refs consecutivas; `no` contíguos terminando em N; propriedades do ADR-020 §1 |

**BDD → teste**
| Cenário | Testes |
| :-- | :-- |
| Campo aparece só com parcelamento / não aparece à vista | **C**: drawer com 10x mostra "Parcelas já pagas" = 0; com 1x some e o valor zera. **E**. |
| Prévia mostra o saldo restante | **U**: `previewInstallments` P1. **C**: texto exato "Restam 6 parcelas de R$ 250,00 · a próxima (5/10) na fatura de nov/2026" (com valores visíveis). **E**. |
| Só as restantes viram lançamentos | **I** (relógio 2026-11-10): `POST` ⇒ 6 linhas; `GET /cards/:id/invoices/2026-11` tem "Sofá" 5/10 25000; `2027-04` 10/10; nenhuma `2027-05`. |
| Nada é criado em meses passados | **I**: `GET /transactions?period=2026-10` sem "Sofá"; `GET /cards/:id/invoices/2026-10` sem "Sofá"; Resumo de out inalterado (*checksum*). |
| Saldos das contas não mudam | **I**: `accountBalances` antes = depois. |
| Limite consumido só pelo restante | **I**: `availableInCents` 500000 ⇒ **350000**. |
| Pagas não podem ser todas | **U/I**: `paidBeforeApp: 10` com 10x ⇒ 400 com a mensagem; `paidBeforeApp: 2` com 1x ⇒ 400 "Parcelas já pagas só valem para compra parcelada". **C**: botão desabilitado. |
| Ver compra identifica as anteriores | **I**: `GET /installment-plans/:id` ⇒ `paidBeforeApp {count 4, toNo 4, amountInCents 100000}`, 6 parcelas. **E**: texto "Parcelas 1 a 4: anteriores ao app (já pagas)". |
| Excluir remove só as restantes | **I**: `delete` ⇒ fatura nov sem "Sofá", `availableInCents` 500000; `restore` ⇒ 6 de volta, 350000. |
| Fora do acerto enquanto Só meu | **I**: `GET /settlement?period=2026-11` antes = depois. |
| `@depende-us-042` Restantes entram no acerto | **I** (marcado; só roda com `INSTALLMENT_SPLIT_RELEASED = true`): nov considera 25000 pagos por Lucas; out inalterado. |
| (infra) Imutabilidade | **I** (SQL cru): `UPDATE installment_plans SET "paidBeforeAppCount" = 0` ⇒ erro `check_violation`; `CHECK` com P = N ⇒ erro. |
| (infra) Idempotência/atomicidade | **I**: `Promise.all` mesma chave ⇒ 1 plano com 6 linhas; falha injetada na 3ª linha ⇒ nada gravado. |
| (infra) Fatura paga no intervalo | **I**: âncora na fatura fechada já paga ⇒ 422 `INVOICE_ALREADY_PAID`. |
| (infra) Regressão | Vetores I1..I12, testes da US-040a/b, propriedade de reconciliação do SDD-014 §4.6 **com** planos `P > 0` no gerador. |

---

## 9. Estimativa, ordem de *commits* e impacto
**5 pontos** (PO: 5): função pura + vetores (1), schema/serviço/migração (2), drawer com seletor de fatura e prévia (1,5), "Ver compra" e BDD (0,5).
*Commits* atômicos: (1) migração + `schema.prisma` + testes SQL; (2) `buildRemainingInstallments`/`previewInstallments` + vetores P1..P8 + propriedade; (3) schema Zod + `createInstallmentPurchase` + DTO; (4) drawer (campo, seletor, prévia); (5) `InstallmentPlanDialog` + E2E/BDD.
**Impacto**: `cartoes/installments.ts`, `transacoes/{schemas,service}.ts` (criação), `cartoes/queries.ts` (DTO do plano), `transaction-drawer.tsx`, `installment-preview.tsx`, `installment-plan-dialog.tsx`, `tests/support/factories.ts`, `prisma/seed.ts`. **Não tocar** em `ledger-where.ts`, `cardUsage`, motor do acerto.
**Pedidos ao PO (não bloqueantes)**: (a) o campo de data vira o seletor "Próxima parcela na fatura de" quando P ≥ 1 — incluir no FLUXO-014 e um cenário "Fatura fechada ainda não paga"; (b) texto da prévia para 1 parcela restante ("Resta 1 parcela…"); (c) linha "A diferença de centavos ficou na 1ª parcela, já paga".
