# SDD-000: Convenções Transversais (API, erros, idempotência, dinheiro, datas, testes)

- **Escopo**: vale para **todos** os SDDs (001..006). Cada SDD só repete o que desvia daqui.
- **Histórias**: EN-001, US-001..013 (transversal)
- **Rastreabilidade**: ADR-001, ADR-009, ADR-010, ADR-013 · `working-agreement.md` (DoD)
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA
- **Versões em uso no repositório** (confirmadas em `package.json`): Next 16 (App Router), React 19, Prisma 7 (`prisma-client`, driver adapter `@prisma/adapter-pg`), **Zod 4** (usar `z.uuid()`, `z.email()`, `z.iso.date()`), Vitest 5, Playwright + playwright-bdd. Onde este SDD mostrar API de biblioteca e a versão instalada divergir, **vale a instalada**; o contrato (nomes, formatos, códigos) é o que vincula.

---

## 1. Estrutura de código

```text
src/
  app/
    (public)/login/ · convite/[token]/        # páginas sem sessão
    (app)/…                                   # páginas protegidas (layout = gate, SDD-003 §5)
    onboarding/
    api/health/ · api/auth/[...nextauth]/ · api/dev/login/
    api/v1/…                                  # Route Handlers REST (finos: validam, chamam serviço)
  lib/
    api/        with-api.ts · errors.ts · idempotency.ts · response.ts
    money.ts · period.ts · clock.ts · dates.ts · ids.ts · apportion.ts
    db.ts · env.ts · logger.ts (pino)
  modules/
    familia/    schemas.ts · service.ts · repo.ts · invitations/ …
    contas/     schemas.ts · service.ts · repo.ts · ledger-queries.ts · transfers.ts
    transacoes/ schemas.ts · service.ts · repo.ts · extrato.ts
    split/      rules.ts (puro) · settlement.ts (puro) · service.ts · repo.ts
    home/       service.ts
  components/ …  (UI; hooks TanStack Query em src/modules/*/hooks.ts)
tests/{unit,integration,e2e,support}
```
- Regras puras (`apportion`, `period`, `rules`, `settlement`, `money`) **não importam** Prisma, Next nem `Date.now()`.
- Os nomes de módulo seguem os diretórios já criados no EN-001 (`contas`, `familia`, `transacoes`, `split`); criar `home` e `lib/api`.
- `schemas.ts` de cada módulo é a **fonte única** de Zod + tipos, importado por UI (React Hook Form) e servidor.

## 2. Convenções de API REST

| Item | Regra |
| :-- | :-- |
| Base | `/api/v1`, JSON UTF-8. Datas como `YYYY-MM-DD` (contábeis) ou ISO-8601 UTC (eventos). Dinheiro **sempre** `…InCents` inteiro. |
| Autenticação | Cookie de sessão do Auth.js (sessão em banco). Sem `Bearer`. Sem sessão → `401`. |
| Família | **Nunca** vem do cliente: deriva do `Member` da sessão (ADR-013). Usuário sem família em rota de domínio → `403 NO_FAMILY`. |
| CSRF | Mutação exige `Content-Type: application/json` e `Origin` igual ao host de `AUTH_URL` (senão `403 BAD_ORIGIN`). Cookie `SameSite=Lax`. |
| Idempotência | `Idempotency-Key: <uuid v4>` obrigatório em `POST/PATCH/PUT` (ADR-009). `GET` não usa. |
| Concorrência | `version` no corpo de `PATCH`/ações de estado; conflito → `409 VERSION_CONFLICT`. |
| Paginação | *Keyset*: `limit` (padrão 30, máx 100) + `cursor` opaco (base64url de JSON); resposta `{ items, nextCursor: string \| null }`. |
| Sucesso | `200` (leitura/ação), `201` (criação) com o recurso ou `{ …agregado }`; sem envelope `data`. |

### 2.1 Envelope de erro (todas as rotas)

```typescript
export type ApiErrorBody = {
  error: {
    code: ErrorCode;          // estável, em SCREAMING_SNAKE_CASE, usado pela UI e pelos testes
    message: string;          // pt-BR, já apresentável ao usuário
    details?: Array<{ path: string; message: string }> | Record<string, unknown>;
  };
};
```

| HTTP | `code` (exemplos; cada SDD acrescenta os seus) | Quando |
| :-- | :-- | :-- |
| 400 | `VALIDATION_ERROR` (com `details: [{path, message}]` vindos do Zod), `IDEMPOTENCY_KEY_REQUIRED`, `INVALID_JSON` | corpo/params inválidos |
| 401 | `UNAUTHENTICATED` | sem sessão |
| 403 | `FORBIDDEN` (papel insuficiente), `NO_FAMILY`, `BAD_ORIGIN` | autorização |
| 404 | `NOT_FOUND` | inexistente **ou de outra família** |
| 409 | `VERSION_CONFLICT`, `DUPLICATE_…` (nome duplicado, convite duplicado, etc.), `ALREADY_IN_FAMILY` | conflito de estado |
| 422 | regras de negócio (`FUTURE_DATE_NOT_ALLOWED`, `CATEGORY_KIND_MISMATCH`, `IDEMPOTENCY_KEY_REUSED`, …) | sintaxe ok, regra viola |
| 500 | `INTERNAL` | erro inesperado; mensagem genérica, detalhe só no log (pino) com `requestId` |

**Mensagens de validação em pt-BR** vêm dos schemas Zod (cada regra recebe a `message` exata das histórias). `VALIDATION_ERROR` usa a mensagem do primeiro erro em `error.message` e a lista completa em `details`.

### 2.2 Wrapper `withApi` (obrigatório em todo Route Handler `api/v1`)

```typescript
// src/lib/api/with-api.ts
export type RequestContext = { userId: string; memberId: string; familyId: string; role: "ADMIN" | "MEMBER" };

export type ApiOptions<B, Q> = {
  auth?: "family" | "user" | "none";       // padrão "family" (exige sessão + Member). "user": só sessão (ex.: criar família)
  role?: "ADMIN";                          // exige papel; senão 403 FORBIDDEN
  body?: z.ZodType<B>;                     // valida JSON
  query?: z.ZodType<Q>;                    // valida searchParams
  idempotent?: boolean;                    // padrão true para métodos não-GET
};

export function withApi<B, Q>(
  opts: ApiOptions<B, Q>,
  handler: (a: { ctx: RequestContext; body: B; query: Q; tx: Tx; req: Request }) => Promise<ApiResult>,
): RouteHandler;
```
Ordem executada pelo wrapper (e **testada** em integração): 1) CSRF/Origin; 2) sessão → `401`; 3) `Member` → `403 NO_FAMILY`; 4) papel → `403`; 5) validação Zod → `400`; 6) `Idempotency-Key` → `400`; 7) abre transação Prisma `$transaction`, registra/consulta `IdempotencyRecord` (ADR-009), chama o handler com `tx`; 8) serializa `ApiResult` (`{status, body}`), grava no registro, *commit*; 9) `ApiError` lançado dentro do handler faz *rollback* e vira o envelope; exceção desconhecida → `500 INTERNAL`.

`class ApiError extends Error { constructor(status: number, code: ErrorCode, message: string, details?: …) }` com *factories* (`notFound()`, `forbidden()`, `conflict(code, msg)`, `unprocessable(code, msg, details?)`).

### 2.3 Repositório com `familyId` (ADR-013)

```typescript
export function makeRepos(tx: Tx, ctx: Pick<RequestContext, "familyId">) {
  return {
    accounts: accountsRepo(tx, ctx.familyId),
    transactions: transactionsRepo(tx, ctx.familyId),
    // …
  };
}
```
Todo método de repositório inclui `familyId` no `where`/`data`. Buscar por `id` de outra família retorna `null` (o serviço converte em `404`). **Lint:** restringir imports de `@/lib/db` a `src/lib/api/**`, `src/modules/**/repo.ts`, testes e `prisma/seed.ts` (regra `noRestrictedImports` do Biome ou verificação por *script* de CI `pnpm check:imports`).

## 3. Dinheiro (`src/lib/money.ts`)

```typescript
export const MAX_AMOUNT_IN_CENTS = 9_999_999_999;
export const amountInCentsSchema = z.number({ error: "Informe um valor maior que zero" })
  .int("O valor deve ser um número inteiro de centavos")
  .positive("Informe um valor maior que zero")
  .max(MAX_AMOUNT_IN_CENTS, "Valor acima do limite permitido");

export function parseBRL(input: string): number | null;   // "R$ 1.250,90" → 125090 ; "-R$ 300,00" → -30000 ; "1250,9" → 125090; inválido → null
export function formatBRL(cents: number): string;         // 125090 → "R$ 1.250,90" ; -30000 → "-R$ 300,00" (espaço NBSP conforme Intl)
export function toCents(v: bigint): number;               // asserta Number.isSafeInteger, senão lança
export function fromCents(n: number): bigint;
```
- **Nunca** `parseFloat` nem aritmética com decimais. `parseBRL` remove `R$`, espaços e pontos de milhar, troca vírgula por ponto **como texto**, exige no máximo 2 casas e converte por inteiros (`Math.round` proibido; usar `BigInt`/manipulação de string).
- Na UI, o campo valor usa máscara que acumula dígitos (digitar `1`,`5`,`0`,`5`,`0` → `R$ 150,50`).
- Percentuais da regra de divisão trafegam em **basis points inteiros** (`6000` = 60%).

## 4. Maior resto (`src/lib/apportion.ts`)

```typescript
/** Divide `total` (centavos inteiros >= 0) proporcionalmente a `weights` (inteiros >= 0, soma > 0).
 *  Σ resultado === total, sempre. Desempate: maior resto, depois menor `ordinal`. */
export function apportion(total: number, parts: Array<{ key: string; weight: number; ordinal: number }>): Record<string, number>;
```
Algoritmo (usar `BigInt` internamente): `raw_i = total × weight_i`; `base_i = raw_i ÷ W` (divisão inteira, `W = Σ weight`); `rem_i = raw_i mod W`; `sobra = total − Σ base_i`; ordenar por `rem_i` **desc**, depois `ordinal` **asc**; somar 1 centavo aos primeiros `sobra` itens. Se `W = 0` → lança `RangeError`. Testes em SDD-002 §8.

## 5. Datas e período (ADR-010)

```typescript
// src/lib/dates.ts   (tudo em "datas de calendário" YYYY-MM-DD; sem Date local)
export type DateISO = string;                       // "2026-10-04"
export const dateISOSchema = z.iso.date({ error: "Data inválida" });
export function todayInFamilyTz(clock: Clock): DateISO;          // fuso America/Sao_Paulo
export function addDays(d: DateISO, n: number): DateISO; export function compareDate(a: DateISO, b: DateISO): -1|0|1;

// src/lib/period.ts
export type Period = { key: string /* "2026-10" */; start: DateISO; end: DateISO /* inclusivo */ };
export function periodOf(date: DateISO, cutDay = 1): Period;
export function periodFromKey(key: string, cutDay = 1): Period;     // valida /^\d{4}-(0[1-9]|1[0-2])$/
export function previousPeriod(p: Period, cutDay = 1): Period; export function nextPeriod(p: Period, cutDay = 1): Period;
```
`periodOf("2026-10-04", 1) → { key: "2026-10", start: "2026-10-01", end: "2026-10-31" }`; `periodOf("2026-10-04", 15) → { key: "2026-09", start: "2026-09-15", end: "2026-10-14" }`.

## 6. Contratos comuns (Zod 4)

```typescript
export const uuidSchema = z.uuid({ error: "Identificador inválido" });
export const versionSchema = z.number().int().min(1);
export const periodKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Período inválido");
export const idempotencyKeySchema = z.uuid();
export const memberRefSchema = z.object({ id: uuidSchema, name: z.string(), image: z.string().nullable() }); // "MemberRef"
```
Todo `z.object` de **entrada** usa `.strict()` (campos desconhecidos → `400`; impede o cliente de injetar `familyId`, `authorMemberId` etc.).

## 7. Estados técnicos de UI (padrão para todas as telas)

| Estado | Regra |
| :-- | :-- |
| Carregando | **Skeleton** com a forma do conteúdo (sem salto de layout); nunca *spinner* de página inteira. |
| Vazio | Texto explicativo + ação principal (cada história define o texto). |
| Erro de leitura | Cartão "Não foi possível carregar" + botão *Tentar de novo* (refaz a query). |
| Sem conexão | `navigator.onLine === false` ou falha de `fetch`: banner "Sem conexão." e **mutação bloqueada** com "Sem conexão. Seus dados continuam na tela, tente de novo." (ADR-004); o formulário **preserva** o que foi digitado. |
| Enviando | Botão desabilitado com rótulo "Salvando…"; **a `Idempotency-Key` é gerada ao abrir o formulário** e reaproveitada em reenvios até sucesso. |
| Sucesso | Toast + fechar *drawer* + invalidar as queries afetadas (chaves em cada SDD). |
| Conflito 409 | Diálogo com `error.message`; ação *Recarregar* (refaz `GET` e descarta edição). |
| Validação | Erro no campo (`aria-invalid`, texto em vermelho) com a mensagem do Zod; foco no primeiro campo inválido. |
- **TanStack Query:** `staleTime` 30 s; `retry: false` em mutações; chaves `["accounts"]`, `["transactions", filtros]`, `["home", period]`, `["settlement", period]`, `["family"]`, `["me"]`.
- **Responsivo:** 375 px e 1280 px sem rolagem horizontal; alvos de toque ≥ 44 px; contraste AA.
- Acessibilidade: *drawer* com `role="dialog"`, foco preso, `Esc` fecha; rótulos textuais em todos os controles.

## 8. Relógio injetável (`src/lib/clock.ts`)

```typescript
export interface Clock { now(): Date }
export const systemClock: Clock = { now: () => new Date() };
export function getClock(): Clock; // honra APP_NOW_OVERRIDE (ISO-8601) SOMENTE se NODE_ENV !== "production"
```
Serviços recebem `clock` por injeção (`ctx.clock`); testes unitários passam relógio fixo; E2E que dependem de "hoje" definem `APP_NOW_OVERRIDE` no `webServer.env`.

## 9. Guia de testes comum (vale para toda história)

1. **Nomenclatura rastreável:** `describe("US-005 …")`, `it("…")` com o **título do cenário Gherkin** entre aspas; `.feature` em `tests/e2e/features/<US-xxx>-<slug>.feature` com os cenários **copiados** da história (mesmo texto), steps em `tests/e2e/steps`.
2. **Pirâmide:** regras puras → unidade; rotas/serviços/SQL → integração (Postgres real `db-test`); jornadas → E2E. Cada SDD traz a tabela *Cenário BDD → teste(s) obrigatório(s)*.
3. **Fábricas de teste** (`tests/support/factories.ts`): `makeFamily({members:[…]})`, `makeAccount`, `makeTransaction`, `asUser(email)` (sessão pronta para chamar `Route Handlers` em integração). Reaproveitadas pelo seed (SDD-006 §5).
4. **Teste de isolamento (obrigatório por recurso, DoD):**
```typescript
it("isolamento: usuário da Família B não lê nem escreve dados da Família A", async () => {
  const a = await makeFamily(); const b = await makeFamily();
  const rec = await createRecurso(a);
  expect((await call(b, "GET", `/api/v1/recurso/${rec.id}`)).status).toBe(404);
  expect((await call(b, "PATCH", `/api/v1/recurso/${rec.id}`, { …, version: 1 })).status).toBe(404);
  expect((await call(b, "GET", "/api/v1/recurso")).body.items).toHaveLength(0);
});
```
5. **Idempotência (obrigatório por mutação):** duas chamadas simultâneas (`Promise.all`) com a mesma chave → exatamente **1** efeito, ambas devolvem o mesmo `status/body` (a segunda com `Idempotent-Replay: true`); mesma chave com corpo diferente → `422 IDEMPOTENCY_KEY_REUSED`; sem a chave → `400 IDEMPOTENCY_KEY_REQUIRED`.
6. **Transações:** teste de integração que força falha no meio (ex.: *mock* do repositório lançando na 2ª escrita) e prova *rollback* total.
7. **Matriz de permissão:** para cada rota com `role`, testar ADMIN → sucesso, MEMBER → `403`, sem sessão → `401`.
8. **Verificação visual manual** (navegador integrado, autorizada pelo Gestor): 375 px e 1280 px, estados vazio/carregando/erro, registrada no `tasks-board.md`.
9. **Cobertura mínima de domínio puro:** 100% dos ramos em `apportion`, `period`, `money`, `rules`, `settlement`.

## 10. Formato dos demais SDDs
Cada SDD segue: 1 Gaps e decisões · 2 Contratos de tipos/Zod · 3 Contratos de API · 4 Regras de negócio/algoritmos · 5 Dados (trechos Prisma/SQL) · 6 UI (rotas, estados, chaves de cache) · 7 Segurança/isolamento · 8 Testes obrigatórios (tabela BDD → teste) · 9 Estimativa e dependências.
