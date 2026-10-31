# SDD-031: Porta única "Já aconteceu / Vai acontecer" e "Repetir todo mês" (US-090, US-091)

- **Histórias**: [US-090](../../product-owner/backlog/stories/US-090-prever-na-mesma-porta-do-lancamento.md), [US-091](../../product-owner/backlog/stories/US-091-repetir-todo-mes-na-mesma-porta.md) · **Necessidade**: [NEED-031](../../stakeholder/needs/NEED-031-previsao-na-mesma-porta-do-lancamento.md) (Q-U21) · **Fluxo**: [FLUXO-019](../../product-owner/flows/FLUXO-019-lancar-ou-prever-na-mesma-porta.md) · **Pedido**: TL-U7 ([`pedidos-ao-tech-lead-uso-real.md`](../../product-owner/backlog/pedidos-ao-tech-lead-uso-real.md))
- **Base**: SDD-001 (lançamento), SDD-009 (prevista), SDD-019/ADR-025 (série), ADR-009 (idempotência), SEC-025/026/038 e `so-meu.md` (captura), US-085 (controle segmentado), US-086 (espaçamento).
- **Status**: **SDD pronto, aprovado para Dev** · **Autor**: Agente Tech Lead · **Data**: 2026-10-26
- **Estimativa (TL)**: US-090 **5 pts** + US-091 **3 pts** = **8 pts** (confirma o PO; §9). **Executor**: Dev & QA, modelo **Sonnet**. **Sem migração, sem rota nova, sem mudança de serviço de servidor.**
- **Restrição central**: a unificação é **só de porta (tela)**. Cada modo chama **o mesmo serviço de hoje** com o mesmo corpo; nenhum efeito, regra, validação de servidor ou permissão muda. Tela "Previstas" e `PlannedDrawer` continuam como estão.

## 1. Verificação no código (o código vence a doc)
| Achado | Consequência |
| :-- | :-- |
| `TransactionDrawer` (`components/transaction-drawer.tsx`, 701 linhas) faz `POST /transactions` (`useCreateTransaction(key)`); `PlannedDrawer` (`app/(app)/previstas/planned-drawer.tsx`, 829 linhas) faz `POST /planned-expenses` ou, com "Repetir", `POST /recurring-expenses` (`useCreatePlanned`/`useCreateSeries`). **A série já existe no formulário da prevista.** | US-091 é mover/oferecer a mesma entrada na porta; o serviço e o schema (`CreateRecurringExpenseSchema`) não mudam. |
| **Cada modo é UMA requisição.** Não há fluxo de várias chamadas por salvar. | Orquestração no **cliente**, sem rota nova e sem rollback parcial (§2, D-TL-U7-1). |
| "Só meu" nasce **igual nos dois**: `shared=false` no `TransactionDrawer` (US-030) e no `PlannedDrawer` (D-GES-15); o servidor usa `isSharedExpense` padrão `false` nos dois schemas. SEC-026: "Só meu" = em nome de quem lança (`effectivePayerId`/`effectiveResponsibleId`). | Hoje **não há padrões diferentes**; o aviso "Padrão deste modo" é informativo (D-TL-U7-4, hipótese TL-U7-2). |
| Real: `description` **opcional** (US-024), `occurredOn` opcional (padrão hoje, **não futura**, dentro de "Mais detalhes"), tags (US-045), parcelas (US-040a/065), pagador "Quem pagou?". Prevista: `description` obrigatória 2..100, `dueOn` opcional (padrão hoje, **futura ou passada**), `paymentAccountId` opcional na API (a UI da prevista exige), responsável, **sem tags nem parcelas**. Série: `paymentAccountId` **obrigatório**, `dayOfMonth`, `startMonth`, `end`, **sem observação**. | Matriz de campos por modo (§3.2). |
| Mensagens de data futura do servidor: "A data da compra não pode ser futura" / "A data da receita…" (`transacoes/service.ts`). | O texto do BDD ("A data não pode ser futura") é de **troca de modo no cliente** (§4.3, hipótese TL-U7-3). |
| Chaves de idempotência: `claimIdempotencyKey` guarda `userId + key` com hash de `método + caminho + corpo`; outra rota/corpo com a mesma chave = `IDEMPOTENCY_KEY_REUSED`. Os drawers geram **uma chave por abertura**. | Política de chave por serviço (§5). |
| E2E existentes usam: `getByRole("button", { name: "Salvar Despesa" })`/`"Salvar Receita"` (≥ 20 passos, `save()` sem `exact`), `getByRole("dialog", { name: "Nova Despesa" })`, botões `"Nova Receita"` com `exact: true` (US-006 ×3, são os botões do seletor de tipo), e `"Nova despesa prevista"` + rótulos "Valor previsto"/"Vencimento" (US-018/019/058/059). Playwright compara `name` sem `exact` **sem diferenciar caixa**. | Decisões de rótulo (D-TL-U7-3) e lista de passos a atualizar (§8.3). |
| `useInvalidatePlanned` = `planned`, `payables`, `home` (o Resumo está sob `["home","month-summary",…]`); `useInvalidateAfterTransactionChange` cobre contas/cartões/extrato etc. | Invalidação por serviço (§5.3). |
| `GET /transactions/defaults` já devolve `accountId`, `cardId`, `payerMemberId`, `today`, `split.*`. | Fonte do "hoje" e dos padrões; nada novo no servidor. |

## 2. Decisões
| ID | Decisão |
| :-- | :-- |
| D-TL-U7-1 | **Orquestração no cliente, sem rota nova.** Um módulo **puro** `src/modules/lancamento/door.ts` traduz o estado do formulário em `{ service, input }`; o drawer chama o hook do serviço escolhido. Descartada a rota `POST /entries` (união discriminada): duplicaria schemas, mudaria a superfície de segurança (SEC-025/026/038) e o MCP para ganho zero, já que cada modo é uma chamada. |
| D-TL-U7-2 | **Registro de serviços** `DOOR_SERVICES` indexado por `kind × when × repeat`: hoje `EXPENSE/INCOME × NOW -> TRANSACTION`, `EXPENSE × LATER × NONE -> PLANNED`, `EXPENSE × LATER × MONTHLY -> SERIES`. Pontos de extensão **sem reescrever a porta**: US-051 liga `INCOME × LATER` (flag `DOOR_FLAGS.incomePlanned`, hoje `false`); US-096 acrescenta `when = "SUBSCRIPTION"` (cartão); US-100 acrescenta `kind = "TRANSFER"`. |
| D-TL-U7-3 | **Rótulos (conflito entre US-085 e US-090):** botão de salvar em "Já aconteceu" = **"Salvar despesa" / "Salvar receita"** (regra da US-085, e preserva ≥ 20 passos E2E por correspondência sem caixa); em "Vai acontecer" = **"Salvar previsão"**. O "Salvar lançamento" da US-090 **não** é adotado (hipótese TL-U7-1: o PO ajusta o Gherkin). Título do drawer = "Nova despesa"/"Nova receita" (segue o tipo; não muda com o "Quando?"). |
| D-TL-U7-4 | **Padrão por modo em tabela**, não em `if`: `MODE_DEFAULTS = { NOW: { shared: false }, LATER: { shared: false } }`. Ao trocar de modo, o valor **só é reposto se o usuário ainda não mexeu** em "Dividir" (campo "sujo" mantém). O texto "Padrão deste modo: Só meu" aparece sob o controle em "Vai acontecer" (e some ao dividir). Se um dia os padrões divergirem, só a tabela muda. |
| D-TL-U7-5 | **Um estado, uma data.** O mesmo campo `date` serve a `occurredOn` (NOW) e a `dueOn` (LATER); o rótulo muda ("Data"/"Vencimento"). Trocar o modo **revalida** (§4.3) e **nada digitado se perde** (todo o estado fica no mesmo componente; campos exclusivos de um modo ficam ocultos, não zerados). |
| D-TL-U7-6 | **`PlannedDrawer` e o botão "Nova despesa prevista" ficam como estão** (cadastro próprio, edição, edição de série, todos os E2E de US-018/019/058/059 intactos). A porta **duplica só a apresentação**; a lógica de montar o corpo vai para `door.ts` e o `PlannedDrawer` pode adotá-la depois (dívida registrada, não nesta entrega). |
| D-TL-U7-7 | **"Vai acontecer" indisponível no cartão e na receita (até a US-051)**: `aria-disabled="true"` (focável, não `disabled`) + dica ligada por `aria-describedby`. Cartão escolhido ⇒ "No cartão, use Assinatura (todo mês)" (texto já combinado; a Assinatura é a US-096). Receita ⇒ "Receita prevista ainda não está disponível". |
| D-TL-U7-8 | **"Pagar com" em "Vai acontecer" é opcional** (como na API/US-090): opção inicial "Escolher ao dar baixa"; pré-seleciona a última conta usada (padrão atual). Em "Repetir: Todo mês" fica **obrigatório** ("Séries exigem conta de pagamento", mensagem do cliente; o servidor mantém a dele). Cartões saem da lista em "Vai acontecer". |
| D-TL-U7-9 | **Idempotência:** uma chave por abertura **e por serviço** (§5.1). Nenhuma mudança em `withApi`. |
| D-TL-U7-10 | **Observação em série não é guardada** (a série não tem `note`): com "Repetir: Todo mês" o campo fica oculto e, se já havia texto, aparece aviso "A observação não é guardada em séries; ela volta se você desmarcar Repetir" (nada se perde no estado). Tags e parcelas não existem em previsão: ocultas (estado preservado). |

## 3. Contrato (cliente)

### 3.1 Tipos e funções puras (`src/modules/lancamento/door.ts`, sem React, sem relógio)
```ts
export type DoorKind = "EXPENSE" | "INCOME";            // US-100 acrescenta "TRANSFER"
export type DoorWhen = "NOW" | "LATER";                  // US-096 acrescenta "SUBSCRIPTION"
export type DoorRepeat = "NONE" | "MONTHLY";             // só vale com LATER
export type DoorService = "TRANSACTION" | "PLANNED" | "SERIES";

export type DoorState = {
  kind: DoorKind; when: DoorWhen; repeat: DoorRepeat;
  cents: number; description: string; categoryId: string;
  source: string;            // "acc:<id>" | "card:<id>" | ""   (cartão só em NOW/EXPENSE)
  payerId: string;           // pagador (NOW) = responsável (LATER)
  shared: boolean; sharedTouched: boolean;
  date: string;              // "" = padrão do servidor (hoje)
  note: string; tags: string[];
  installments: number; paidBeforeApp: number;            // NOW + cartão
  day: string; startMonth: string; endKind: "NONE" | "COUNT"; endMonths: string;   // SERIES
};
export type DoorCtx = { today: string; me: string; splitAvailable: boolean; splitBlocked: boolean; flags: { incomePlanned: boolean } };

export const MODE_DEFAULTS: Record<DoorWhen, { shared: boolean }>;
export function serviceOf(s: Pick<DoorState, "kind" | "when" | "repeat">, flags: DoorCtx["flags"]): DoorService | null; // null = combinação indisponível
export function availability(s: DoorState, ctx: DoorCtx): {
  later: { enabled: boolean; reason?: "CARD_SELECTED" | "INCOME_NOT_AVAILABLE" };
  repeat: { enabled: boolean };                                    // só LATER + EXPENSE
};
export function validateDateForWhen(date: string, when: DoorWhen, today: string): string | null; // "A data não pode ser futura" só em NOW
export function effectLine(when: DoorWhen, repeat: DoorRepeat): string;     // textos do §4.1
export function saveLabel(s: Pick<DoorState, "kind" | "when">): string;      // "Salvar despesa" | "Salvar receita" | "Salvar previsão"
export function buildSubmission(s: DoorState, ctx: DoorCtx):
  | { service: "TRANSACTION"; input: CreateTransactionInput }
  | { service: "PLANNED"; input: CreatePlannedExpenseInput }
  | { service: "SERIES"; input: CreateRecurringExpenseInput };
```
**Sem schema Zod novo no servidor.** O cliente valida o corpo montado com os schemas **existentes** (`CreateTransactionSchema`, `CreatePlannedExpenseSchema`, `CreateRecurringExpenseSchema`): uma única fonte da verdade. `door.ts` só acrescenta as regras de porta (`availability`, `validateDateForWhen`, "série exige conta").

### 3.2 Mapeamento estado → corpo (`buildSubmission`)
| Campo do estado | TRANSACTION (NOW) | PLANNED (LATER, NONE) | SERIES (LATER, MONTHLY) |
| :-- | :-- | :-- | :-- |
| `kind` | `type` | só `EXPENSE` | só `EXPENSE` |
| `cents` | `amountInCents` | `amountInCents` | `amountInCents` |
| `description` | opcional (US-024) | **obrigatória** 2..100 | **obrigatória** 2..100 |
| `categoryId` | `categoryId` | `categoryId` | `categoryId` |
| `source` | `accountId` ou `cardId` | `paymentAccountId` (opcional; `acc:` só) | `paymentAccountId` (**obrigatório**) |
| `payerId` | `payerMemberId` (= eu se "Só meu", SEC-026) | `responsibleMemberId` (= eu se "Só meu") | idem |
| `shared` | `isSharedExpense` (`splitAvailable && shared && !splitBlocked`) | `isSharedExpense` (`splitAvailable ? shared : false`) | idem |
| `date` | `occurredOn` | `dueOn` | **não usado** (substituído por dia/início); prefill de `day` e `startMonth` |
| `note` | `note` | `note` | **não enviado** (D-TL-U7-10) |
| `tags`, `installments`, `paidBeforeApp` | enviados (regras atuais) | **não enviados** | **não enviados** |
| `day`, `startMonth`, `endKind/endMonths` | — | — | `dayOfMonth`, `startMonth`, `end: {kind:"NONE"} \| {kind:"COUNT", months}` |
Os corpos são **idênticos** aos que `TransactionDrawer` e `PlannedDrawer` montam hoje para o mesmo estado (teste de paridade, §8.1-2).

### 3.3 Rotas (todas existentes)
| Modo | Rota | Sucesso | Erros relevantes (inalterados) |
| :-- | :-- | :-- | :-- |
| NOW | `POST /api/v1/transactions` | 201 | 400/422 de validação; `FUTURE_DATE_NOT_ALLOWED`; `INVALID_REFERENCE`; `INVOICE_PAID_LOCKED`; limite de cartão só como aviso |
| LATER | `POST /api/v1/planned-expenses` | 201 | 422 `INVALID_REFERENCE` (`paymentAccountId`, `categoryId`, `responsibleMemberId`); SEC-026/038 (`PERSONAL_*`) |
| LATER + MONTHLY | `POST /api/v1/recurring-expenses` | 201 `{ series, generatedCount }` | 422 de `dayOfMonth`/`startMonth`/`end.months`/`paymentAccountId` |
Todas com `Idempotency-Key` (`withApi`). Erros de campo (`details[].path`) mapeiam para os campos do formulário (§6.3).

## 4. Regras de interface

### 4.1 Controles e textos
- Ordem: **Tipo** (US-085) → **Quando?** (`SegmentedChoice` da US-085: "Já aconteceu" | "Vai acontecer", `radiogroup`, padrão "Já aconteceu") → linha de efeito → Valor → demais campos.
- **Linha de efeito** (`aria-live="polite"`, texto, não só cor):
  - NOW: "Já aconteceu: entra no extrato e nos saldos agora"
  - LATER/NONE: "Vai acontecer: fica em A pagar até você dar baixa; não muda saldo nem extrato"
  - LATER/MONTHLY: acrescenta "Cria uma série mensal; as próximas 12 aparecem em A pagar" (texto da US-091).
- **Botão de salvar:** `saveLabel` (D-TL-U7-3). Desabilitado só durante o envio (como hoje).
- **"Repetir: Não | Todo mês"** só em LATER + Despesa, abaixo de "Vencimento". "Todo mês" troca "Vencimento" por **Dia do mês** (1..31; padrão = dia da data digitada, senão o de hoje), **Início** (12 meses a partir do atual, como no `PlannedDrawer`) e **Fim** (Sem fim | Após N meses, 1..120).
### 4.2 Matriz de visibilidade
| Campo | NOW Despesa | NOW Receita | LATER | LATER + Todo mês |
| :-- | :-: | :-: | :-: | :-: |
| Valor, categoria, pagador/responsável, "Dividir" | sim | sim (sem dividir) | sim | sim |
| Pagar com / Receber em | conta ou cartão | conta | **só contas**, opcional | **só contas**, obrigatório |
| Descrição | opcional | opcional | **obrigatória** | obrigatória |
| Data / Vencimento | em "Mais detalhes" (como hoje) | idem | **Vencimento fora de "Mais detalhes"** (é o dado central) | substituído por Dia/Início/Fim |
| Parcelas, "já paguei antes", tags | sim | só tags | não | não |
| Observação | em "Mais detalhes" | idem | em "Mais detalhes" | oculta (aviso se havia texto) |
**Importante:** o layout de NOW (campos, rótulos, ids `tx-*`, "Mais detalhes") **não muda** além do que a US-085/086 pedem. Campos ocultos mantêm o estado, não são enviados e não geram erro.
### 4.3 Disponibilidade e revalidação
- `availability.later.enabled = false` quando `source` é cartão ou `kind = INCOME` (enquanto `incomePlanned = false`). O botão "Vai acontecer" fica `aria-disabled` com a dica (D-TL-U7-7). Se o usuário escolhe um **cartão estando em LATER**, não é possível: cartões não estão na lista de LATER (D-TL-U7-8); se o **padrão** do último meio era um cartão, "Vai acontecer" nasce indisponível até ele escolher uma conta.
- Trocar para NOW com `date` futura: `validateDateForWhen` devolve **"A data não pode ser futura"** no campo (abre "Mais detalhes"); trocar para LATER limpa esse erro. O envio mantém as validações do servidor.
- Trocar de modo/tipo não zera `cents`, `description`, `categoryId` (categoria de outro tipo é zerada como hoje em `switchKind`), nem `note`.

## 5. Idempotência, estado de envio e cache

### 5.1 Chave
`key` nasce por abertura (como hoje) e é **regerada ao mudar o serviço** (`service` derivado muda: NOW ⇄ LATER ⇄ MONTHLY) **se nenhuma tentativa foi iniciada**; depois de uma tentativa com `NetworkError` (resultado desconhecido) a chave **não** muda e o seletor "Quando?/Repetir" fica travado até sucesso ou fechar, com o aviso existente do banner. Risco residual aceito: após falha de rede com resultado desconhecido, fechar e reabrir e salvar de novo no outro modo cria objetos distintos (lançamento **e** prevista), nunca o mesmo duas vezes.
### 5.2 Envio duplo
`submitting.current` (já existente) trava toque duplo em qualquer modo; a mesma chave + mesmo corpo repete a resposta guardada (ADR-009). `isPending` de **todas** as mutações (`create`, `createPlanned`, `createSeries`) alimenta o desabilitar do botão.
### 5.3 Cache (TanStack Query)
`useDoorSubmit(key)` (`src/modules/lancamento/use-door-submit.ts`) expõe `submit(submission)` e escolhe a mutação:
| Serviço | Invalidar ao salvar |
| :-- | :-- |
| TRANSACTION | `useInvalidateAfterTransactionChange` (como hoje, mais atualização otimista do Extrato como hoje) |
| PLANNED | `["planned"]`, `["payables"]`, `["home"]` (cobre Resumo e Início) |
| SERIES | `["planned"]`, `["payables"]`, `["home"]`, `["recurring"]` |
Efeito prático: salvar uma previsão a partir do FAB em qualquer tela (Início, Extrato, A pagar) atualiza "A pagar", Início e Resumo; **não** invalida contas, extrato nem acerto (nada gravado no livro-caixa). Sucesso: toast "Despesa registrada com sucesso!" (NOW, igual a hoje), "Previsão cadastrada!" (LATER), "Despesa recorrente cadastrada: {n} previstas criadas" (SERIES, igual ao `PlannedDrawer`).

## 6. Estados técnicos de UI
### 6.1 Estados
| Estado | Comportamento |
| :-- | :-- |
| Idle | "Já aconteceu", linha de efeito, botão "Salvar despesa"; foco inicial em Valor (`tx-amount`). |
| Defaults carregando | iguais a hoje (campos utilizáveis; `source` preenche quando `defaults` chega). |
| Troca de modo | animação nenhuma; foco permanece no controle; linha de efeito anuncia por `aria-live`. |
| Indisponível | `aria-disabled` + dica; clique/Enter não troca e **move o foco para a dica** (`tabindex=-1` + `focus()`), sem erro. |
| Enviando | botão desabilitado, rótulo mantido; seletor travado. |
| Erro de campo (422) | mensagem no campo (mapa §6.3); abre "Mais detalhes" se for data/observação. |
| Erro de rede | banner existente; chave preservada (§5.1). |
| Sucesso | fecha o drawer, toast por serviço, invalidação por serviço. |
### 6.2 Acessibilidade e mobile
`radiogroup` rotulado "Quando?" com setas; `aria-disabled` com `aria-describedby`; linha de efeito `aria-live="polite"` (sem duplicar leitura do botão); cor nunca é o único sinal (ícone + texto, US-085); alvo ≥ 44 px; em 375 px o drawer rola internamente com o botão de salvar sempre visível (rodapé fixo da US-086); sem rolagem horizontal; foco visível nos dois temas.
### 6.3 Mapa `details[].path` → campo
`amountInCents -> tx-amount`; `categoryId`; `accountId|cardId|paymentAccountId -> tx-account`; `occurredOn|dueOn -> tx-date`; `dayOfMonth -> tx-day`; `startMonth -> tx-start`; `end|end.months -> tx-end`; `description`; `responsibleMemberId|payerMemberId -> pagador`. Caminho desconhecido ⇒ banner com a mensagem (padrão atual).

## 7. "Repetir todo mês" (US-091), pontos de detalhe
1. `day` padrão = dia de `date` (se preenchida) ou de hoje; `startMonth` padrão = mês de `date` ou mês corrente; ambos editáveis. Se o dia digitado já passou no mês de início, o comportamento é o da série existente (L-1/L-2, ocorrência do mês pode nascer atrasada); a porta **não** reinterpreta.
2. Mensagens do cliente: "Séries exigem conta de pagamento" (campo "Pagar com"); demais, as do `CreateRecurringExpenseSchema`.
3. Exceções, edição e encerramento continuam em "Previstas" (L-2/L-3); a porta só cria.
4. Em "Já aconteceu" não há "Repetir".
5. Regras de série intactas: mensal, valor igual, 12 meses materializados, conta bancária obrigatória (ADR-025).

## 8. Guia de testes para o Dev & QA
### 8.1 Unidade (`tests/unit/lancamento/door.test.ts`, funções puras, sem DOM)
1. `serviceOf`/`availability`: NOW×{EXPENSE,INCOME}, LATER×EXPENSE→PLANNED/SERIES, LATER×INCOME→`null` com `incomePlanned=false` (e liga com `true`), cartão selecionado→`later.enabled=false` (`CARD_SELECTED`).
2. **Paridade de corpo (golden)**: vetores fixos de `DoorState` produzem exatamente os mesmos objetos que o `TransactionDrawer.buildPayload` e o corpo da prevista/série do `PlannedDrawer` produzem hoje (extrair as duas funções para `door.ts` e provar equivalência antes de remover as cópias).
3. `validateDateForWhen`: futura em NOW → mensagem; futura em LATER → `null`; passada em ambos → `null`; vazia → `null`. Fronteira "hoje".
4. SEC-026 na tradução: `shared=false` ⇒ `payerMemberId`/`responsibleMemberId` = `me`, mesmo que `payerId` tenha outro valor; `splitAvailable=false` ⇒ `isSharedExpense=false`; `shared` "sujo" não é reposto na troca de modo, "limpo" recebe `MODE_DEFAULTS`.
5. SERIES: `day`/`startMonth` derivados da `date`; `end` NONE/COUNT; `note`, tags, parcelas **ausentes** do corpo; `paymentAccountId` ausente ⇒ erro "Séries exigem conta de pagamento".
6. `saveLabel` e `effectLine` (tabela de textos) por `kind × when × repeat`.
7. Componente/hook (`@testing-library`, se existir; senão E2E cobre): `useDoorSubmit` escolhe a mutação e as chaves de invalidação do §5.3; a chave é regerada ao mudar de serviço e preservada após `NetworkError`.
### 8.2 Integração (`tests/integration/us-090-091-porta-unica.int.test.ts`; sem endpoint novo)
1. Para cada vetor do §8.1-2, enviar o corpo de `buildSubmission` à rota certa e comparar com o resultado da chamada "manual": **mesmo status e mesmo DTO** (prova de que a porta não muda efeito).
2. **Prever não muda o livro-caixa:** PLANNED e SERIES não alteram `accountBalances`, `transactions`, acerto nem `ledgerTotals`; aparecem em `/payables` e em `toPay` do Resumo; NOW aparece no Extrato e muda saldo.
3. SEC-025/026/038: "Só meu" de outro como responsável é recusado em PLANNED e SERIES como hoje; NOW idem. **Rodar sem edição**: `sec025-026-so-meu-regras`, `sec038-previstas-captura`, `us-030-so-meu-por-padrao`.
4. Idempotência: mesma chave + mesmo corpo = mesma resposta (NOW, PLANNED, SERIES); mesma chave em **outro caminho** = 409 `IDEMPOTENCY_KEY_REUSED` (documenta o motivo da chave por serviço).
5. Data: PLANNED aceita `dueOn` futura e passada (vira atrasada); NOW recusa futura (`FUTURE_DATE_NOT_ALLOWED`); SERIES com `startMonth` do mês corrente e dia já passado segue a regra L-1.
6. Receita + LATER: não existe rota (a UI não oferece); o teste garante que **nenhum** caminho de servidor aceita `type: "INCOME"` em `planned-expenses` (`.strict()` rejeita `type`).
7. Regressão: `us-018-despesa-prevista`, `us-058-059-recorrencia`, `us-055-a-pagar-fonte-unica`, `us-005`, `us-006`, `us-016a`, `us-040a`, `us-045` verdes sem edição.
### 8.3 E2E / BDD (`tests/e2e/features/US-090-prever-na-mesma-porta.feature` e `US-091-repetir-todo-mes-na-mesma-porta.feature`; 1:1 com os **9 + 4 cenários**, em 375 e 1280 px)
- **US-090**: padrão "Já aconteceu" e botão **"Salvar despesa"** (ajuste do Gherkin, TL-U7-1); caminho rápido (lançar "Mercado" R$ 80,00 e ver saldo/extrato); prever "Condomínio" (A pagar com vencimento 20/10, fora do Extrato, saldo igual); efeito explícito e botão "Salvar previsão"; "Só meu" marcado + "Padrão deste modo: Só meu"; trocar de modo preserva descrição e valor; data futura em "Já aconteceu" → "A data não pode ser futura"; "Vai acontecer" indisponível em Receita e no cartão com a dica.
- **US-091**: criar a série pela porta (aparece em "Previstas" e as próximas em "A pagar"); "Séries exigem conta de pagamento"; "Repetir" não existe em "Já aconteceu"; texto "As próximas 12 aparecem em A pagar".
- Extras: teclado (setas no "Quando?", Enter), leitor (nome acessível "Já aconteceu, selecionado"/"Vai acontecer, indisponível"), foco na dica, dois toques rápidos em "Salvar previsão" (um só registro), erro de rede preserva a chave, tema escuro, sem rolagem horizontal em 375 px.
- **Passos E2E existentes que mudam** (por US-085/090, a registrar nas TASKs do Dev): `US-006-lancar-receita.steps.ts` linhas ~62/100/110 (`getByRole("button", { name: "Nova Receita", exact: true })` → radio "Receita"); `support/lancamento.ts` (`save`) segue valendo pela correspondência sem caixa. **Não podem quebrar**: US-005, 006, 012, 014, 016a, 018, 019, 024, 027, 030, 040a, 045, 058/059, 065.
- Notas de Gherkin: parser (DEV-25), `Dado` em todo cenário, sem frases em várias linhas.

## 9. Estimativa e fatiamento
| Fatia | Conteúdo | Pts |
| :-- | :-- | :-- |
| US-090 núcleo | `door.ts` (puro) + testes de paridade; `useDoorSubmit`; extrair do `TransactionDrawer` | 1,5 |
| US-090 UI | "Quando?", linha de efeito, matriz de campos, disponibilidade/dicas, rótulos, Vencimento promovido, erros por campo | 2 |
| US-090 testes | integração + E2E dos 9 cenários + passos atualizados | 1,5 |
| **US-090** | **Confirma 5 pts** (limite; 3 commits: núcleo, UI, testes) | **5** |
| US-091 UI | Repetir, Dia/Início/Fim, aviso da observação, "Pagar com" obrigatório | 1,5 |
| US-091 testes | integração SERIES + E2E dos 4 cenários | 1,5 |
| **US-091** | **Confirma 3 pts** (a série já existe; custo é a apresentação) | **3** |
**Ordem:** depois da US-085 (`SegmentedChoice`) e da US-086 (rodapé fixo/espaçamento); US-089 e US-090 são independentes; US-091 depois da US-090. **Risco de crescer:** médio na US-090 (arquivo de 700 linhas; manter o `TransactionDrawer` abaixo de ~550 linhas extraindo `door.ts` e subcomponentes `WhenSwitch`/`RepeatFields`). Se a US-085 não estiver pronta, o Dev cria `SegmentedChoice` mínimo e a US-085 o adota (sem retrabalho).

## 10. Divergências com as histórias (para o PO/Gestor ratificar; nenhuma bloqueia)
| ID | Data | História | Lacuna / desvio | Hipótese adotada | Impacto |
| :-- | :-- | :-- | :-- | :-- | :-- |
| TL-U7-1 | 2026-10-26 | US-085 × US-090 | Botão "Salvar lançamento" (US-090) conflita com "Salvar despesa/receita" (US-085) | "Salvar despesa/receita" em NOW; "Salvar previsão" em LATER; PO ajusta o Gherkin | Evita reescrever ≥ 20 passos E2E |
| TL-U7-2 | 2026-10-26 | US-090 | "Previsão nasce Só meu; lançamento real segue o padrão atual" | No código os dois nascem "Só meu"; aviso mantido como informação | Nenhum |
| TL-U7-3 | 2026-10-26 | US-090 | Mensagem "A data não pode ser futura" vs. "A data da compra/receita…" do servidor | Mensagem do cliente só na troca de modo; servidor intacto | PO alinha o texto do BDD |
| TL-U7-4 | 2026-10-26 | US-090 | "Pagar com" opcional vs. UI da prevista que exige | Opcional na porta (API já aceita); sem conta ⇒ "Sem conta definida" (US-060) | Coerente com SDD-029 |
| TL-U7-5 | 2026-10-26 | US-090 | Tela "Previstas" e cadastro próprio | Mantidos; convergência futura (dívida) | Nenhum |
| TL-U7-6 | 2026-10-26 | US-091 | Série não tem observação | Campo oculto com aviso; texto preservado no estado | Nenhum |
| TL-U7-7 | 2026-10-26 | US-090 | Tags e parcelas em previsão | Não existem na prevista; ocultas em LATER | Nenhum |
| TL-U7-8 | 2026-10-26 | US-090 | Vencimento ficaria em "Mais detalhes" | Em LATER vai para fora de "Mais detalhes" (dado central) | PO valida na homologação visual |

## 11. Riscos
| ID | Risco | Tratamento |
| :-- | :-- | :-- |
| R-1 | Regressão silenciosa no lançamento rápido (meta < 10 s). | NOW inalterado em campos/ids; teste de paridade; E2E de caminho rápido (§8.3). |
| R-2 | Divergência de corpo entre porta e `PlannedDrawer` (duas cópias). | `door.ts` único; paridade em teste; dívida de convergência registrada (TL-U7-5). |
| R-3 | Chave de idempotência reutilizada em outra rota. | Regra do §5.1; teste §8.2-4. |
| R-4 | A11y do botão `aria-disabled` com dica. | Roteiro de leitor de tela e foco na dica (§6.1); teste E2E de teclado. |
| R-5 | `TransactionDrawer` cresce demais. | Extração obrigatória (§9). |

## 12. Rastreabilidade
NEED-031 (RN-031.1..6, Q-U21) ⇒ FLUXO-019 ⇒ US-090/US-091 (D-PO-102) ⇒ **SDD-031** (TL-U7) ⇒ TASKs a abrir pelo Gestor. Prepara US-051 (flag `incomePlanned`), US-096 (`SUBSCRIPTION`) e US-100 (`TRANSFER`). Estado vigente: [previstas-series.md](../../estado/previstas-series.md) e [lancamentos-contas-extrato.md](../../estado/lancamentos-contas-extrato.md).
