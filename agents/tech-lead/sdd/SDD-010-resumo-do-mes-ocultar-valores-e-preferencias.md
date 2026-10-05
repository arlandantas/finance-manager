# SDD-010: Resumo do Mês, ocultar valores e preferências de exibição (US-025, US-026, US-027, US-036, US-037, US-038)

- **Histórias**: [US-025](../../product-owner/backlog/stories/US-025-resumo-do-mes-na-home.md) · [US-026](../../product-owner/backlog/stories/US-026-saldos-das-contas-em-card-recolhivel.md) · [US-027](../../product-owner/backlog/stories/US-027-ocultar-valores.md) · [US-036](../../product-owner/backlog/stories/US-036-detalhe-da-transacao-na-home.md) · [US-037](../../product-owner/backlog/stories/US-037-tema-claro-escuro.md) · [US-038](../../product-owner/backlog/stories/US-038-navegacao-desktop-conteudo-contido.md)
- **Fluxos**: [FLUXO-006](../../product-owner/flows/FLUXO-006-home-resumo-do-mes.md), [FLUXO-007](../../product-owner/flows/FLUXO-007-ocultar-valores.md), [FLUXO-013](../../product-owner/flows/FLUXO-013-preferencias-navegacao-e-detalhe.md)
- **Rastreabilidade**: NEED-014, NEED-015 (RN-015.1..7), NEED-022 (RN-022.1/2), NEED-009 (RN08 rebaixado) · Q-F03/F03b/F04/F06 · D-PO-13, D-PO-15, D-PO-21..23 · [ADR-010](../adrs/ADR-010-periodo-e-datas.md), [ADR-013](../adrs/ADR-013-isolamento-por-familia.md), [ADR-018](../adrs/ADR-018-multiplos-grupos-spike.md) (predicado único)
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-005](SDD-005-extrato-e-home.md) (`ledgerTotals`, `buildLedgerWhere`, Home), [SDD-009](SDD-009-despesas-previstas.md) (`payables`), [SDD-008](SDD-008-cartoes-fatura.md) (faturas), [SDD-004](SDD-004-contas-e-ledger.md) (saldos) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md) (**sem migração** neste SDD)
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA
- **Ordem técnica recomendada** (muda a do PO em um ponto): **US-027 → US-022 (SDD-011) → US-023/024 (SDD-013) → US-025 → US-026 → … → US-036 → US-037 → US-038**. Motivo: todo valor monetário novo das demais histórias deve nascer dentro do componente `Money`; fazê-lo depois obriga a refazer as telas.

---

## 1. Gaps técnicos e decisões

| Gap / Pergunta do PO | Resolução |
| :-- | :-- |
| **Predicado único de período** (reconciliação RN-015.5 e preparo do parcelamento, ADR-017) | Novo módulo `src/modules/transacoes/ledger-where.ts` exporta `periodPredicate(alias, start, end)` (R2.1: `alias."occurredOn" BETWEEN :start AND :end`) e `visibilityPredicate(alias, memberId)` (**no-op `TRUE`**, gancho do ADR-018). **Toda** consulta por período (Extrato lista/totais, Resumo, `byMember`, carga do acerto, `/settlement/expenses`, pendências, "Só meu") usa essas funções. `check:imports` ganha regra: `occurredOn` com `BETWEEN`/`gte`/`lte` fora de `ledger-where.ts` e de testes ⇒ falha. Na R3 a única linha que muda é a do predicado (`competenceOn`). |
| Agregado único do Resumo reaproveitando o Extrato (pergunta US-025) | `getMonthSummary` chama **as mesmas** `ledgerTotals(buildLedgerWhere)` e `paidByMember` do Extrato/Home; **não** reimplementa soma. Propriedade de teste: `Resumo.income/expense` == `GET /transactions` (`totals`) para o mesmo `period` e sem filtros, em dados aleatórios (§8). |
| "A pagar" e "saldo previsto": meses passados, corrente e futuros | Definições fechadas em §4.2 (hipótese do PO mantida e documentada). Itens: previstas `PREVISTO` com `dueOn` no período **+** faturas **não pagas** (abertas **ou** fechadas, total > 0) com `dueDate` no período; no período **corrente** soma também **todo atrasado de períodos anteriores**. Mês passado: só o que **permanece pendente** (a mesma consulta, naturalmente atrasada). Mês futuro: itens com vencimento naquele mês e **saldo atual** (não projeta meses intermediários; limitação registrada em TL-09). |
| Fatura aberta em "A pagar" sem duplicar despesa (Q-F03b) | Linha própria `invoicesInCents`; **nunca** entra em `expenseInCents` (a compra já entrou pela data). O pagamento da fatura continua fora dos totais (ADR-014). |
| Navegar entre meses sem recarregar a Home inteira | `GET /api/v1/month-summary?period=` (mesma função do bloco da Home). A Home usa `HomeDTO.monthSummary` para o mês corrente; setas do Resumo trocam para `["month-summary", period]`. |
| Armazenamento da preferência (US-027/026/037) | **`localStorage` por usuário e dispositivo**, chave `fm:v1:u:<userId>:<pref>`; **tema por dispositivo** em `fm:v1:theme` (D-PO-22). Módulo único `src/lib/prefs.ts`, com `try/catch` em toda leitura/escrita e **fallback em memória** (cenário "navegador não permite guardar"). Sem cookie (não há necessidade de o servidor conhecer a preferência) e **sem dado financeiro** nunca. |
| "Dispositivo/sessão novo" e troca de usuário no mesmo dispositivo | `hideValues` ausente ⇒ **oculto** (padrão). Como a chave inclui `userId`, Mariana no navegador onde Lucas mostrou os valores **começa oculta**. "Sessão nova" = ausência de preferência salva para aquele usuário naquele dispositivo (não há expiração; decisão: preferência persiste até o usuário mudar). |
| Anti-*flash* dos valores | Valores só são renderizados **depois do carregamento** das *queries* (cliente); o *snapshot* de servidor de `usePref` é sempre o **padrão** (`hideValues = true`). Nenhuma tela rende número em HTML de servidor. Regra de código: `formatBRL` só dentro de `Money`/`MoneyInput` (§4.4). |
| Um componente `Money` para todo valor de leitura | **Sim.** `src/components/money.tsx` (cliente). Gráficos e totais futuros (R3) usam o mesmo componente/`useHideValues`. |
| Alertas e mensagens que embutem valor | Texto vindo do servidor (`error.message`, ex.: "O valor não pode ser maior que o devido (R$ 400,00)") passa por `maskMoneyInText()` quando oculto. Toasts de sucesso **não** recebem valor. `document.title` e `aria-label` nunca contêm valor. |
| Tema (US-037): anti-*flash* e auditoria de cores fixas | *Script* inline em `<head>` (padrão do guia de Next, `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`) lê `fm:v1:theme`, resolve `system` por `matchMedia` e aplica `data-theme` e `color-scheme` em `<html>` (com `suppressHydrationWarning`). O Tailwind 4 expõe a paleta como variáveis CSS (`--color-slate-*`, `--color-white`): o tema escuro **redefine as variáveis** em `[data-theme="dark"]`, sem tocar em cada componente; auditoria restante em §4.5. |
| Detalhe da transação na Home (US-036): rota ou estado | **Estado + parâmetro de URL** `?tx=<id>` (abre/fecha com `router.push/replace`, voltar fecha). **Sem** rotas paralelas/interceptadas (custo e fragilidade sem ganho). Um único `TransactionDetail` (extraído de `extrato/transaction-detail-drawer.tsx`) usado pelo Extrato e pela Home. |
| Layout contido no desktop (US-038) | Um único *container* `max-w-[960px] mx-auto` em `(app)/layout.tsx` que envolve **menu e conteúdo** a partir de `lg` (1024 px); barra inferior `lg:hidden`. O drawer de lançamento é um `Dialog` (Radix) renderizado em portal e **não** depende da largura do container. O "+" fica ancorado ao container (§6.4). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/home/schemas.ts  (emenda ao SDD-005 §2 e SDD-009 §2)
export const MonthSummaryQuerySchema = z.object({ period: periodKeySchema.optional() }).strict();   // até hoje + 12 meses

export type PayableBreakdownDTO = {
  totalInCents: number;            // plannedInCents + invoicesInCents
  plannedInCents: number;          // previstas PREVISTO
  invoicesInCents: number;         // linha "Faturas" (faturas não pagas)
  overdueInCents: number; overdueCount: number;     // vencimento < hoje
  items: PayableItemDTO[];         // SDD-009 §2; até 5; atrasados primeiro, depois dueOn, depois título
  totalCount: number;              // itens existentes (para "Ver todas")
};

export type MonthSummaryDTO = {
  period: { key: string; start: string; end: string; isCurrent: boolean; isFuture: boolean };
  incomeInCents: number;           // ledgerTotals.income (RN-015.1)
  expenseInCents: number;          // ledgerTotals.expense (competência; compra no cartão pela data; sem fatura/transferência/acerto)
  resultInCents: number;           // income − expense (pode ser negativo)
  toPay: PayableBreakdownDTO;      // RN-015.2 (caixa)
  currentBalanceInCents: number;   // Σ saldos das contas ativas (cartão não entra)
  projectedBalanceInCents: number; // current − toPay.totalInCents (RN-015.4; sem receitas previstas até a US-051)
  byMember: Array<{ member: MemberRef; paidInCents: number; sharePercent: number }>;   // Σ sharePercent = 100 (apportion, SDD-005 §3.2.3)
  isEmpty: boolean;                // sem receita, sem despesa e sem item a pagar no período => "Nada lançado neste mês ainda"
};

export type HomeDTO = {            // substitui o HomeDTO do SDD-005 §2 (campos removidos: familyBalanceInCents, accounts, payables, settlement)
  period: { key: string; start: string; end: string };
  monthSummary: MonthSummaryDTO;
  balances: { totalInCents: number; accounts: AccountDTO[] };              // card recolhível (US-026); contas ARQUIVADAS não entram (SDD-012)
  settlementIndicator: SettlementIndicatorDTO | null;                        // SDD-011 §3 (null com acerto desligado)
  recent: TransactionDTO[];                                                  // 5 últimos (sem OPENING; já `occurredOn <= hoje` a partir da R3)
  onboarding: { hasAccount: boolean; hasOtherMember: boolean; hasTransaction: boolean; showChecklist: boolean };
  memberCount: number;
};
```

```typescript
// src/lib/prefs.ts   (cliente; nada de dado financeiro)
export type UserPrefKey = "hideValues" | "balancesExpanded";
export const DEFAULT_USER_PREFS = { hideValues: true, balancesExpanded: false } as const;
export const THEME_KEY = "fm:v1:theme";                          // "system" | "light" | "dark" (por dispositivo)
export const prefKey = (userId: string, k: UserPrefKey) => `fm:v1:u:${userId}:${k}`;
export function usePref<K extends UserPrefKey>(k: K): [(typeof DEFAULT_USER_PREFS)[K], (v: (typeof DEFAULT_USER_PREFS)[K]) => void];
// useSyncExternalStore: getServerSnapshot = DEFAULT; getSnapshot = localStorage ?? memória; escuta o evento "storage" (outras abas)

// src/components/money.tsx
export const MONEY_MASK = "R$ •••••";                           // largura fixa; não revela sinal nem ordem de grandeza
export function Money(p: { cents: number; signed?: boolean; className?: string }): JSX.Element;
export function maskMoneyInText(text: string): string;           // /-?R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g => MONEY_MASK
export function useHideValues(): { hidden: boolean; toggle: () => void; revealed: (id: string) => boolean };
```

---

## 3. Contratos de API

| Rota | Papel | Corpo/params | Sucesso | Erros |
| :-- | :-- | :-- | :-- | :-- |
| `GET /api/v1/home?period=` | todos | `HomeQuerySchema` (SDD-005) | `200 HomeDTO` (acima) | 400 · 401 · 403 `NO_FAMILY` |
| `GET /api/v1/month-summary?period=` | todos | `MonthSummaryQuerySchema` | `200 MonthSummaryDTO` | 400 (período inválido ou além de +12 meses) |
| `GET /api/v1/transactions/:id` | todos | — | `200` (já existe, SDD-001); passa a incluir `splitLabel` (US-036) e `invoice` | 404 |

Leituras sem `Idempotency-Key`. `GET /home` e `GET /month-summary` rodam em transação **somente leitura `REPEATABLE READ`** (um instantâneo). Nenhuma mutação nova neste SDD. Remoção de compat: o campo `payables` do `HomeDTO` do SDD-009 §4.6 é **substituído** por `monthSummary.toPay` (a regra "atrasados ou até +7 dias" deixa de existir; vale a regra do mês).

---

## 4. Regras e algoritmos

### 4.1 Predicado único e consultas (`ledger-where.ts`)
```typescript
export function periodPredicate(alias: string, start: DateISO, end: DateISO): Prisma.Sql;     // R2.1: BETWEEN em occurredOn
export function visibilityPredicate(alias: string, memberId: string): Prisma.Sql;              // R2.1: Prisma.sql`TRUE`
```
`ledgerTotals`, `buildLedgerWhere`, `homeRepo.paidByMember`, `split/repo.sharedExpenses`, `pendingSettlementMonths` (SDD-011) e `personalSummary` (SDD-011) o consomem. O SQL de referência do SDD-002 §5.1 passa a ser gerado com essas funções.

### 4.2 `getMonthSummary(tx, ctx, periodKey?)`
1. `period = periodFromKey(key, cutDay)` (padrão `periodOf(hoje)`); `isCurrent`, `isFuture` por comparação com `periodOf(hoje)`.
2. `totals = ledgerTotals({ familyId, start, end, includeDeleted: false })` ⇒ `income`, `expense`; `result = income − expense`.
3. `byMember` = `paidByMember(start, end)` + `apportion(100, …)` como no SDD-005; todos os membros ativos **e** ex-membros com valor > 0 (ADR-019).
4. `toPay` (**uma** função `listDueItems(tx, ctx, { period, today })`, em `previstas/payables.ts`, que também alimenta `/previstas`):
   - previstas: `status = PREVISTO AND deletedAt IS NULL AND dueOn BETWEEN start AND end`; **se `isCurrent`**, `OR dueOn < start` (atrasadas de meses anteriores);
   - faturas: `card_invoices` cujo **total de compras ativas > 0**, **sem pagamento ativo** (`cardUsage`/`invoiceTotals`), com `dueDate BETWEEN start AND end` (e, se `isCurrent`, `OR dueDate < start`); **abertas, fechadas ou vencidas** (a "aberta" mostra o total corrente);
   - `overdue` = `dueOn/dueDate < hoje`; `totalInCents = planned + invoices`.
5. `currentBalanceInCents = Σ accountBalances` das contas **ativas** (SDD-004; arquivadas ignoradas, SDD-012) `projected = current − toPay.total` (pode ser negativo).
6. `isEmpty = income = 0 ∧ expense = 0 ∧ toPay.totalCount = 0`.
**Invariantes (teste)**: (i) `toPay.total` não altera `expense` nem `income`; (ii) pagar uma fatura/dar baixa numa previsão reduz `toPay` e **não** altera `expense` do mês da compra (a baixa cria despesa na data do pagamento ⇒ `expense` do mês do pagamento sobe, `toPay` desce; nenhuma duplicidade); (iii) **reconciliação**: `income`, `expense` e `Σ byMember.paid` (despesas) coincidem com `GET /transactions` (totais e `byMember`) do mesmo período.

### 4.3 Texto do saldo previsto e estados
Rótulos (constantes em `modules/home/copy.ts`): `"Saldo atual menos o que ainda vai pagar neste mês"`; negativo ⇒ `"Seu saldo não cobre o que falta pagar"` (estado de atenção com texto, não só cor). `isEmpty` ⇒ `"Nada lançado neste mês ainda"`. Família nova (`onboarding.showChecklist`) mantém o passo a passo da US-012.

### 4.4 Ocultar valores (US-027)
- **Regra de render**: `Money` lê `useHideValues()`. Oculto ⇒ `<span role="img" aria-label="valor oculto" data-money="hidden"><span aria-hidden>R$ •••••</span></span>`; visível ⇒ `formatBRL(cents)` (com `signed`, mostra `+`/`−` só visível). Toque no valor oculto (`onClick`) revela **por 5 s** (estado local + `setTimeout` limpo no *unmount*); o olho do cabeçalho alterna tudo (`aria-pressed`, dica "Oculta os valores na tela. Não protege seus dados.").
- **Escopo**: toda leitura (saldos, Resumo, acerto, faturas, extrato, previstas, detalhe, contas, cartões, limite). **Entradas** (`MoneyInput`) e **percentuais, quantidades, datas e nomes** permanecem visíveis.
- **Disciplina por regra de código** (verificada por `check:imports`): `formatBRL`/`Intl.NumberFormat(... currency)` só em `src/components/money.tsx`, `src/components/money-input.tsx`, `src/lib/money.ts` e testes. Qualquer outro uso em `src/app/**`/`src/components/**` falha o CI.
- **Mensagens com valor**: `maskMoneyInText` aplicado por `toastMessage()`/`ErrorDialog` quando oculto; as mensagens "ficará negativa" já são texto sem valor.
- **Sincronização**: evento `storage` mantém abas coerentes. Sem *flash*: ver §1.

### 4.5 Tema (US-037)
- `THEME_KEY ∈ {system, light, dark}`; *script* de `<head>` (constante `THEME_BOOTSTRAP_SCRIPT`, testada por unidade): lê o valor, resolve `system` com `matchMedia("(prefers-color-scheme: dark)")`, grava `document.documentElement.dataset.theme` e `style.colorScheme`; `try/catch` (sem storage ⇒ `system`). Hook `useTheme()` aplica a mudança na hora e persiste; com `system` escuta `matchMedia` `change`.
- **Paleta**: `globals.css` define, em `[data-theme="dark"]`, as variáveis `--color-white`, `--color-slate-50..950` e os tons de estado (`emerald/red/amber/sky-*`) **invertidos/escurecidos** (tabela de mapeamento no próprio CSS). Auditoria obrigatória: `grep` por `#[0-9a-f]{3,8}`, `rgb(`, `bg-black/white` fixos e estilos inline em `src/**` (lista de exceções documentada: avatar/imagem).
- **Contraste AA** como teste de unidade: função pura `contrastRatio(fg, bg)` e uma tabela de **pares semânticos** (texto/fundo, "Atrasada", "saldo insuficiente", chips, bordas de foco, valores positivos/negativos) × 2 temas; todos ≥ 4,5:1 (texto) e ≥ 3:1 (ícones/pontos). Estados nunca só por cor (texto presente; coberto por teste de componente).

### 4.6 Detalhe e navegação (US-036/038)
- `TransactionDetail` recebe `id` e `source: "home" | "extrato"`; busca `GET /transactions/:id` (`["transaction", id]`, `staleTime` 30 s) e `/history`; renderiza ações **rotuladas** (`Editar`, `Excluir`, `Histórico`) conforme regras do SDD-001 §4 (US-013a/013b/016b, `LINKED_TO_PLANNED`, `INVOICE_PAID_LOCKED`). "Ver no Extrato" ⇒ `/extrato?period=<periodOf(occurredOn)>&highlight=<id>` (a tela do Extrato rola e destaca o item; **parâmetro só de UI**, a API ignora). Excluir ⇒ `toast` com **duração ≥ 8 000 ms** e ação "Desfazer" (`POST /transactions/:id/restore`). Conflito `409` ⇒ diálogo padrão (SDD-000 §7).
- Mobile (`< 1024`): *bottom sheet* (`Dialog` com `side="bottom"`); desktop (`>= 1024`, `useMediaQuery`): painel lateral à direita. Foco volta ao item de origem ao fechar; `Esc` fecha.
- Layout: ver §1 e §6.4.

---

## 5. Dados
Nenhuma migração. Alterações de código de acesso: `homeRepo` (período por `periodPredicate`), `previstas/payables.ts` (`listDueItems`), `contas/service.ts` (saldo ignora arquivadas após o SDD-012, sem mudar este SDD). `GET /home` deixa de montar `settlement` completo (a Home recebe só o indicador, SDD-011 §3).

---

## 6. Interface

### 6.1 Home (`/`) — ordem (D-PO-13)
(1) **Resumo do Mês** (card herói): título do mês + setas ◀ ▶; cinco linhas (`Receitas`, `Despesas`, `Resultado do mês` e `Saldo previsto` em destaque, `A pagar` expansível: previstas / **Faturas** / atrasadas com selo "Atrasada"); abaixo, as linhas de acerto (SDD-011 §3). (2) **Participação por membro**. (3) **Saldos das contas** (card recolhível, US-026). (4) **Últimos lançamentos** (toque abre o detalhe, US-036). (5) FAB "+". Skeletons por bloco; erro por bloco ("Não foi possível carregar o resumo do mês" + "Tentar de novo"; **o "+" continua disponível**).
### 6.2 Card de saldos (US-026)
Cabeçalho (total + chevron + `aria-expanded`), recolhido por padrão, `usePref("balancesExpanded")`; lista de contas **ativas**; "Cadastrar conta" no fim; vazio "Nenhuma conta cadastrada" + botão. Respeita `Money`.
### 6.3 Olho no cabeçalho e menu do avatar
Olho (44 px) em todas as telas; menu do avatar ganha **Aparência** (Sistema/Claro/Escuro com marca de seleção) e **Configurações > Categorias** (US-039).
### 6.4 Layout desktop
`<div className="mx-auto w-full max-w-[960px]">` envolve cabeçalho/menu e `main`; menu superior `hidden lg:flex`; barra inferior `lg:hidden`; FAB: `fixed bottom-4 right-4 lg:right-[max(1rem,calc((100vw-960px)/2+1rem))]`. Telas de formulário de página inteira (regra de divisão, SDD-011) escondem o FAB por lista `HIDE_FAB_ROUTES` no `app-shell` (US-039).
### 6.5 Chaves de cache e invalidação
`["home", period]`, `["month-summary", period]`, `["transaction", id]`. **Toda** mutação de lançamento, conta, transferência, acerto, regra, previsão, baixa, fatura e arquivamento invalida `["home"]` e `["month-summary"]` (lista centralizada em `invalidateFinancialCaches(qc)`; teste de unidade garante que `useCreateTransaction`, `usePayInvoice`, `usePayPlanned` etc. a chamam). A preferência de valores **não** invalida cache (só re-render).

---

## 7. Segurança e isolamento
`familyId` da sessão (ADR-013); `GET /month-summary` e `GET /home` só leem a família do contexto; `period` fora da janela ⇒ 400. Preferências ficam no navegador e **nunca** carregam valores; `maskMoneyInText` é só exibição (não é controle de acesso, e a dica do controle diz isso). Logs (pino) sem valores do resumo.

---

## 8. Testes obrigatórios (BDD → teste) — U = unidade, C = componente (Vitest + Testing Library), I = integração (`db-test`), E = E2E

> Convenções do SDD-000 §9. Relógio fixo `2026-10-12T15:00:00Z` (12/10/2026 em SP) nos testes de Resumo. Gerador de dados aleatórios com **semente fixa** (`tests/support/prng.ts`, mulberry32) para as propriedades.

### US-027 (ordem 1)
| Cenário BDD | Testes |
| :-- | :-- |
| Dispositivo novo começa oculto / Mostrar com um toque / Lembrado / Ocultar de novo / Por dispositivo | **U**: `usePref` (padrão `true`; leitura/escrita; chave `fm:v1:u:<id>:hideValues`). **E**: contexto novo ⇒ `R$ •••••` e olho "Valores ocultos"; clicar ⇒ `R$ 7.349,50`; `page.reload()` mantém; segundo contexto do navegador ⇒ oculto. |
| Máscara em todo o app / Extrato mantém data e descrição | **E**: percorrer Home, Extrato, Acerto, Cartões, Contas a pagar, Contas com valores ocultos e afirmar **nenhum** texto `R\$\s?\d`; extrato mostra descrição/data. **U**: `check:imports` falha para `formatBRL` fora dos arquivos permitidos (teste do script). |
| Percentuais e quantidades visíveis | **E**: "75%" e "3 compras" visíveis com valores ocultos. |
| Revelar pontualmente | **C** (relógio falso): clique em `Money` revela, após 5 000 ms volta; *unmount* limpa o *timer*. |
| Lançar com valores ocultos | **E**: `MoneyInput` mostra "R$ 150,50"; toast "Despesa registrada com sucesso!" sem valor. |
| Alertas não vazam valor | **U**: `maskMoneyInText("O valor não pode ser maior que o devido (R$ 400,00)")` ⇒ máscara; aviso "A conta de origem ficará negativa" sem número. |
| Leitor de tela / Dica | **C**: `getByRole("img", { name: "valor oculto" })`; `title` do olho. |
| Outro usuário no mesmo dispositivo | **E**: Lucas mostra e sai; `loginAs(mariana)` no mesmo contexto ⇒ oculto. |
| Preferência indisponível | **E**: `addInitScript` lança no acesso a `localStorage` ⇒ valores ocultos; olho funciona na sessão. **U**: `readPref` captura o erro e usa memória. |
| (infra) Sincronização entre abas | **C/E**: evento `storage` atualiza `Money`. |

### US-025 (ordem 5)
| Cenário BDD | Testes |
| :-- | :-- |
| Resumo com os cinco números | **I**: seed (Itaú 650000, Nubank 84950; receita 500000; despesas 120000; previstas 65000 e 12990 em outubro; fatura aberta 47900 vencendo 15/10) ⇒ `income 500000`, `expense 120000`, `result 380000`, `toPay.total 125890` (`planned 77990`, `invoices 47900`), `projected 609060`. **E**: textos do cenário. |
| Fórmula explicada / Saldo alto não esconde conta a pagar | **U**: constantes de `copy.ts`. **I**: saldo 100000 e `toPay` 125890 ⇒ `projected −25890`. **E**: "-R$ 258,90" com texto "Seu saldo não cobre o que falta pagar". |
| Pagamento de fatura e transferência não são despesa | **I (regressão)**: transferência 100000 e pagamento de fatura 47900 não alteram `expense`. |
| Compra no cartão conta no mês da compra | **I**: compra 30000 em 10/10 que cai na fatura de novembro ⇒ `expense` de outubro `+30000`. |
| Fatura em linha própria, sem duplicar despesa | **I**: `toPay.invoicesInCents = 47900`, `expense` não soma 47900. |
| Itens atrasados destacados | **I**: previsão `dueOn 2026-10-04` ⇒ `overdueCount 1`, `overdueInCents 12990`; **E**: selo "Atrasada". |
| Totais reconciliam com o Extrato | **I (propriedade, ≥ 200 conjuntos aleatórios)**: `income/expense/byMember` do resumo == `GET /transactions?period=` (`totals`) e `Σ byMember.paid == expense`; inclui transferência, acerto, abertura, excluídos, cartão e pagamento de fatura. |
| Navegar mês anterior / Mês sem movimento | **I**: `period=2026-09` ⇒ `expense 90000`; `period=2026-11` sem dados ⇒ `isEmpty true`, `result 0`. **E**: títulos "Setembro de 2026" e "Nada lançado neste mês ainda". |
| Meses passados e futuros (A pagar) | **I**: previsão pendente de setembro aparece como atrasada no resumo de setembro; no corrente, atrasada de setembro **também** entra; mês futuro só com vencimentos do mês; `period` > +12 meses ⇒ 400. |
| Família nova mantém o passo a passo / Carregamento / Erro / Responsivo | **I**: `onboarding.showChecklist`. **E**: skeleton sem salto (CLS ≤ 0,01), erro por bloco com "+" disponível, 375/1280 px sem rolagem horizontal. |
| (infra) Instantâneo e isolamento | **I**: `REPEATABLE READ` (spy no `$transaction`); resumo da família B nunca contém dados da A. |
| (infra) Invalidação | **U**: todas as mutações financeiras chamam `invalidateFinancialCaches`. |

### US-026 (ordem 6)
| Cenário BDD | Testes |
| :-- | :-- |
| Recolhido por padrão / Expandir / Recolher / Lembrado / Por dispositivo | **E** (contexto novo; `reload`; segundo contexto). **U**: `usePref("balancesExpanded")` padrão `false`. |
| Total acompanha nova despesa / Sem contas / Valores ocultos / Teclado | **E**: total muda após lançar; "Nenhuma conta cadastrada"; `Money` mascarado; `Enter` alterna e `aria-expanded`. **I**: `balances.totalInCents` ignora arquivadas (liga com US-032). |

### US-036, US-037, US-038
| Cenário BDD | Testes |
| :-- | :-- |
| (036) Tocar abre o detalhe sem sair da Home / Ações visíveis / Editar / Excluir com desfazer ≥ 8 s / Histórico / Ver no Extrato | **E**: `?tx=<id>` na URL, Home por trás, botões `Editar/Excluir/Histórico`; toast com `Desfazer` visível ao menos 8 s (relógio do Playwright). **I**: `GET /transactions/:id` e `/history`. **C**: `TransactionDetail` renderiza as mesmas ações no Extrato e na Home (componente único). |
| (036) Transferência sem Editar / Baixa orienta o desfazer / Compra no cartão mostra a fatura / Conflito por outro membro / Responsivo / Valores ocultos | **E/C**: variantes por `type`; mensagem `LINKED_TO_PLANNED`; "Fatura de out/2026"; `409` ⇒ "Este lançamento foi alterado por Mariana. Recarregue para continuar."; botões ≥ 44 px; `Money` mascarado. |
| (037) Padrão segue o sistema / Claro / Escuro / Lembrado / Por dispositivo / Voltar a Sistema | **U**: `THEME_BOOTSTRAP_SCRIPT` com `storage` vazio + `matchMedia` escuro ⇒ `data-theme=dark`; valores `light/dark/system`. **E**: `emulateMedia({ colorScheme: "dark" })`; troca imediata; `reload`; segundo contexto segue o sistema. |
| (037) Sem piscar | **E**: `addInitScript` com `MutationObserver` em `documentElement` registra o primeiro `data-theme` ⇒ `dark` antes de qualquer pintura (`requestAnimationFrame` posterior). |
| (037) Estados legíveis nos dois temas / Preferência indisponível | **U**: `contrastRatio` para a tabela de pares × 2 temas ≥ 4,5:1 / 3:1; **C**: "Atrasada" e "saldo insuficiente" têm texto. **E**: `localStorage` negado ⇒ tema vale na sessão. |
| (038) Menu superior e conteúdo centralizado / Mobile mantém barra / Tablet 800 px / "+" visível dentro do container / Nenhuma tela quebra / Listas largas | **E** (viewports 1440, 375, 800): `boundingBox` do `main` ≤ 960 e centrado; menu alinhado; barra inferior só `< 1024`; FAB dentro do container; seis telas sem `scrollWidth > innerWidth`; Extrato com 40 linhas legível. |

---

## 9. Estimativa, dependências e impacto no código existente

| História | PO | **TL** | Observação |
| :-- | :-: | :-: | :-- |
| US-027 | 5 | **5** | `Money`, `prefs`, olho, `maskMoneyInText`, regra `check:imports`, auditoria de todas as telas (maior parte do esforço) |
| US-025 | 5 | **5** | Limite superior: `getMonthSummary`, `listDueItems`, `GET /month-summary`, reorganização da Home e teste de reconciliação. Entregar em *commits* (API ➜ UI) |
| US-026 | 2 | **2** | Reusa `usePref` |
| US-036 | 3 | **3** | Extrai `TransactionDetail`, `?tx=`, toast ≥ 8 s |
| US-037 | 3 | **3** | Inversão de paleta por variáveis CSS; risco: componentes com cor fixa (auditoria) |
| US-038 | 2 | **2** | Container único e FAB ancorado |
Dependências: US-027 antes de qualquer tela nova; US-025 depende de `payables` (US-018) e `cardUsage` (US-017a); US-026 de US-025; US-036 de US-013a; US-037 independente (a US-050 depende dela).

**Impacto em R1/R2 (lista de verificação para o Dev):**
| Arquivo / teste | Mudança |
| :-- | :-- |
| `src/modules/home/{service,schemas,repo}.ts`, `home-screen.tsx` | `HomeDTO` novo; `monthSummary` v2; `settlementIndicator`; sem `payables`/`settlement` completos |
| `src/modules/previstas/payables.ts` (`homePayables`) | Substituída por `listDueItems`; `/previstas` e o Resumo compartilham |
| `src/modules/transacoes/extrato.ts`, `split/repo.ts`, `home/repo.ts` | Período via `periodPredicate` |
| `tests/e2e/features/US-012-home-dashboard.feature` ("Home com dados", "Resumo do mês exclui transferências e acertos", "Card de acerto abre o painel") e `tests/integration/us-012-home.int.test.ts` | Reescritos para o novo layout: saldo no card recolhível, Resumo do Mês, indicador de acerto (SDD-011) |
| `tests/integration/us-018-despesa-prevista.int.test.ts` (bloco "A pagar" da Home) | Passa a validar `monthSummary.toPay` |
| `scripts/check-imports.ts` | Regras `formatBRL` e `occurredOn BETWEEN`; módulos puros novos: `home/copy`, `prefs` (cliente, sem Prisma) |
| `src/components/app-shell.tsx`, `src/app/(app)/layout.tsx`, `globals.css`, `src/app/layout.tsx` | Olho, menu Aparência, container, tema, script de `<head>` |
