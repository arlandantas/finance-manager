# SDD-015: Percentual por lançamento, migração do acerto e divisão por categoria (EN-002, US-043, US-044) — **ESBOÇO** (R3)

- **Histórias**: [EN-002](../../product-owner/backlog/stories/EN-002-percentual-gravado-por-lancamento.md) · [US-043](../../product-owner/backlog/stories/US-043-dividir-no-lancamento-tres-modos.md) · [US-044](../../product-owner/backlog/stories/US-044-lembrar-dividir-por-categoria-e-revisao-do-mes.md)
- **Fluxo**: [FLUXO-008](../../product-owner/flows/FLUXO-008-lancar-despesa-r21-r3.md)
- **Rastreabilidade**: NEED-018 (RN-018.1..5) · Q-F02, Q-F02b, Q-08/D-GES-08 · D-PO-16, D-PO-27 · **[ADR-016](../adrs/ADR-016-percentual-gravado-por-lancamento.md)** (modelo, regra de centavos, migração: **leitura obrigatória**), [ADR-011](../adrs/ADR-011-regra-de-divisao-versionada.md) (emendado)
- **Depende de**: SDD-002 (motor e vetores S1..S13), SDD-011 (`explainPeriodSplit`, indicador, `copy`), SDD-012 (ex-membros), SDD-001 (`updateTransaction`, mês acertado/US-013b)
- **Status**: **Esboço** · Autor: Agente Tech Lead · Estimativa: **EN-002 = 13 (002a = 5 modelo e motor · 002b = 8 migração, gate e harness) · US-043 = 5 · US-044 = 3**
- **Ordem**: EN-002a ➜ EN-002b ➜ **release com motor STORED e interface inalterada** ➜ US-043 (CUSTOM) ➜ US-044. A EN-002 deve ser tratada como **Must** se a US-042 for Must (TL-07).

## 1. Contratos (rascunho)
```typescript
export const SplitModeSchema = z.enum(["NONE", "RULE", "CUSTOM"]);
export const SplitInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("NONE") }).strict(),
  z.object({ mode: z.literal("RULE") }).strict(),                                      // vetor = regra vigente em occurredOn (ou data da compra, parcelas)
  z.object({ mode: z.literal("CUSTOM"), shares: z.array(z.object({ memberId: uuidSchema, bps: bpsSchema }).strict()).min(2) }).strict()
    .refine((v) => sum(v.shares) === 10000, { path: ["shares"], message: "Os percentuais precisam somar 100%" }),
]);
// CreateExpenseSchema / UpdateExpenseSchema: `split?: SplitInputSchema` (substitui o booleano). Compatibilidade R2.1:
//   isSharedExpense:true  ≡ { mode:"RULE" } ; isSharedExpense:false ≡ { mode:"NONE" } ; informar os dois ⇒ 400.
export type SplitDTO = { mode: "NONE" | "RULE" | "CUSTOM"; ruleVersionId: string | null;
                         shares: Array<{ member: MemberRef; bps: number; amountInCents: number }> };   // TransactionDTO.split
export function splitAmount(i: { amountInCents: number; shares: Array<{ memberId; bps; ordinal }>; payerMemberId: string }): Record<string, number>;
```
## 2. Vetores de `splitAmount` (regra do ADR-016 §2)
| # | Entrada | Esperado |
| :-- | :-- | :-- |
| V1 | 5 centavos, 50/50, pagador Lucas | Lucas 3, Mariana 2 |
| V2 | 9000, 40/40/20 | 3600/3600/1800 |
| V3 | 20000, Lucas 100% / Mariana 0%, pagadora Mariana | 20000/0 (sem sobra) |
| V4 | 100, 3333/3333/3334, pagador de 3333 | pagador 34, outros 33 e 33 |
| V5 | pagador com 0% e sobra > 0 | sobra ao participante de maior resto (menor ordinal) |
| Propriedades | `Σ = valor`; cada parte ∈ {⌊exato⌋, ⌈exato⌉}; determinístico; ordem de entrada irrelevante |

## 3. Dados (migração `en002_percentual_por_lancamento`; ver `modelo-de-dados.md` §9)
`SplitMode`, `transactions.splitMode`, `transactions.splitRuleVersionId`, `transaction_splits`, `families.splitEngine`, `split_migration_snapshots`, `data_migrations`; `CHECK ("isSharedExpense" = ("splitMode" <> 'NONE'))`; *constraint trigger* `DEFERRABLE INITIALLY DEFERRED` (Σ bps = 10000 e Σ valores = valor do lançamento). Migração de dados em `scripts/migrate-split.ts` (**ADR-016 §5**).

## 4. Motor
`computeSettlement(input, source: "LEGACY" | "STORED")`: LEGACY intacto em `settlement-legacy.ts` (cópia testada pelos S1..S13); STORED soma `TransactionSplit.amountInCents` por membro; mesmas propriedades. `explainPeriodSplit` ganha a implementação por rateio gravado (mesma saída). A coluna `Family.splitEngine` seleciona; novos lançamentos de famílias `LEGACY` gravam **também** o rateio (assim a virada é só de leitura).

## 5. Harness de regressão (obrigatório; falha o deploy)
- **Casos nomeados** (dados homologados): outubro/2026 (316990 comum ⇒ cota 158495, diferença 114995), setembro/2026 (71700 ⇒ 35850; 26050), mês com troca (40000 em 02/10, 100000 em 10/10, 50/50 ➜ 58/42 em 04/10 ⇒ **78000/62000**; lançamento de 02/10 gravado 50/50, o de 10/10 gravado 58/42), acerto registrado de 50000 em outubro (saldo restante igual), lançamento pessoal sem rateio, regra alterada depois sem mudar lançamentos antigos.
- **Aleatório com semente** (`tests/support/prng.ts`): ≥ 200 famílias (N = 2..4; troca de regra em dia aleatório; membro que entra no mês; membro removido; valores ímpares; acertos parciais; despesas excluídas/editadas; compras no cartão) × todos os meses: `LEGACY(antes) == STORED(depois)` em **todos** os campos (cota, diferença, saldo, total, sugestões, status, rótulo ponderado). **Qualquer divergência de 1 centavo falha o teste e o *gate* do script.**
- **Idempotência** (rodar duas vezes), **retomada** (falha injetada na metade da família ⇒ rollback e reaplicar), **rollback** (`--rollback` devolve o motor LEGACY e remove rateios `BACKFILL`; acerto idêntico ao snapshot), **atomicidade por família**.
- **Propriedade do rótulo**: `explainPeriodSplit` LEGACY == STORED.

## 6. US-043 (CUSTOM) e US-044
- US-043: seletor de três modos ("Só meu" padrão; "Pela regra (58% / 42%)" com a regra vigente; "De outro jeito" com mini-formulário por membro e soma ao vivo), validação "Os percentuais precisam somar 100%", `0%/100%` permitido, N > 2 (US-009b), edição em mês acertado (US-013b), previstas e parcelas usam o mesmo seletor (baixa herda). Liberada **depois** da EN-002 (janela de reversão do ADR-016).
- US-044: `Category.defaultSplit boolean NOT NULL DEFAULT false` (edição por qualquer membro; categoria arquivada preserva); escolha manual **não** é sobrescrita ao trocar a categoria (estado `userPicked`); revisão do mês encerrado: `GET /settlement/review?period=` (despesas "Só meu" do período, `Money`), ação "Dividir" = `PATCH` `{ split: { mode: "RULE" } }` (mês acertado ⇒ confirmação da US-013b), dispensa por mês em `settlement_review_dismissals(familyId, periodKey, dismissedByMemberId, at)` único por `(familyId, periodKey)`; nunca bloqueia o acerto; só com acerto ligado.

## 7. Testes principais (a expandir)
Unidade (V1..V5, propriedades; schema discriminado), integração (criação/edição recalcula centavos com os mesmos bps; mês acertado; ex-membro com rateio; `isSharedExpense` coerente via `CHECK`; trigger de soma), regressão (§5), E2E dos BDD da US-043/044.

## 8. Lista de impacto
`split/{settlement,service,repo,schemas}.ts` (+ `settlement-legacy.ts`), `transacoes/{schemas,service,mutations}.ts`, `previstas/service.ts` (baixa copia o rateio da previsão), `cartoes` (parcelas, SDD-014), `categorias/*` (`defaultSplit`), `transaction-drawer.tsx`, `edit-transaction-form.tsx`, `acerto-screen.tsx`, `scripts/migrate-split.ts` (novo), pipeline de deploy (etapa obrigatória), `tests/support/factories.ts` (`split`), `prisma/seed.ts`.
