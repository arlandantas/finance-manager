# SDD-013: Pagamentos — conta de origem padrão, descrição visível e polimento (US-023, US-024, US-039)

- **Histórias**: [US-023](../../product-owner/backlog/stories/US-023-conta-de-origem-padrao-inteligente.md) · [US-024](../../product-owner/backlog/stories/US-024-descricao-visivel-e-opcional.md) · [US-039](../../product-owner/backlog/stories/US-039-polimento-da-homologacao.md)
- **Fluxos**: [FLUXO-008](../../product-owner/flows/FLUXO-008-lancar-despesa-r21-r3.md), [FLUXO-012](../../product-owner/flows/FLUXO-012-conta-de-origem-padrao.md), [FLUXO-013](../../product-owner/flows/FLUXO-013-preferencias-navegacao-e-detalhe.md) (seção "Polimento")
- **Rastreabilidade**: NEED-003/004 (conta de origem), NEED-022, NEED-001/012/006 · Q-F13 (descrição), Q-05 · DEV-10 · D-PO-19, D-PO-20, D-PO-24 · [ADR-012](../adrs/ADR-012-convites-e-email.md) (token só em *hash*)
- **Depende de**: [SDD-000](SDD-000-convencoes-transversais.md), [SDD-001](SDD-001-transacoes.md), [SDD-005](SDD-005-extrato-e-home.md) (filtros), [SDD-008](SDD-008-cartoes-fatura.md) / [SDD-009](SDD-009-despesas-previstas.md) (drawers de pagamento), [SDD-010](SDD-010-resumo-do-mes-ocultar-valores-e-preferencias.md) (`Money`), [SDD-012](SDD-012-manutencao-de-cadastros.md) (`archivedAt`, `usageCountByMe`) · Modelo: [`modelo-de-dados.md`](../architecture/modelo-de-dados.md) §8
- **Status**: Aprovado para Desenvolvimento · **Autor**: Agente Tech Lead · **Executor**: Agente Desenvolvedor & QA

---

## 1. Gaps técnicos e decisões

| Gap / Pergunta do PO | Resolução |
| :-- | :-- |
| US-023: sugestão no servidor ou no cliente? | **Função pura compartilhada** `suggestSourceAccount` (`src/modules/contas/suggest-source.ts`, 100% de ramos), executada **no cliente** (o valor muda ao vivo na baixa e a lista de contas/saldos já está em `["accounts"]`) e **coberta por teste de unidade e de integração contra os mesmos dados do servidor**. Nenhum endpoint novo. |
| "Mais usada por quem paga" sem nova tabela | `AccountDTO.usageCountByMe`: contagem, **nos últimos 90 dias**, de lançamentos ativos do **membro logado** (`authorMemberId`) por conta, tipos `EXPENSE`, `INVOICE_PAYMENT`, `TRANSFER_OUT`. Uma consulta agrupada em `listAccounts` (índice por família e data; volume pequeno). Sem tabela nova, sem *cache*. |
| Quem é "o titular/responsável" | Fatura ⇒ `card.owner`; previsão ⇒ `responsible`. "Quem está pagando" ⇒ o membro logado (para `usageCountByMe`). |
| Contas arquivadas | Nunca sugeridas nem listadas (SDD-012). O cenário "Conta arquivada nunca é sugerida" é coberto **em unidade na US-023** e **habilitado em E2E na US-032**. |
| US-024: causa e onde aplicar o padrão "descrição vazia = categoria" | **O servidor já aplica** (Q-05: `descriptionSchema` opcional + `description ?? category.name`). A US-024 é **só de interface** (campo visível) **mais a busca** (abaixo). Nenhum contrato muda, exceto a **mensagem** de validação. |
| Mensagem de descrição | O BDD pede **uma** mensagem: **"A descrição precisa ter entre 2 e 100 caracteres"** (curta e longa). Muda **apenas** `descriptionSchema` de `transacoes` (despesa/receita/cartão); o schema de `previstas` mantém as mensagens atuais (BDD da US-018 as cita). Atualizar `tests/unit/transacoes/schemas.test.ts:73,77`. |
| **Busca por descrição** (cenário "Busca por descrição encontra o lançamento") | **Não existia** no SDD-005. Novo parâmetro `q` em `GET /transactions`: `ILIKE` em `description` (sem acento-insensibilidade; extensão `unaccent` não instalada — limitação documentada), 2..50 caracteres, `%`, `_` e `\` escapados. Entra em `buildLedgerWhere`, portanto vale para **lista e totais**. +1 ponto na US-024 (TL = 3). |
| US-039 — **Copiar link do convite** | O convite guarda só o **hash** do token (ADR-012 §1): **o link original não pode ser reconstruído**. **Decisão**: "Copiar link" e "Reenviar e-mail" **rotacionam o token** (novo `tokenHash`, mesma `expiresAt`, validade de 7 dias **não** estendida); o link/e-mail **anterior deixa de valer**. A UI avisa. Alternativa descartada: guardar o token cifrado (aumenta a superfície sensível). Registrado em TL-05. |
| US-039 — limite de reenvios | Hipótese do PO adotada: **3 reenvios de e-mail por convite** (`Invitation.resendCount`); "Copiar link" **não** conta (não envia e-mail) mas rotaciona. `422 RESEND_LIMIT_REACHED` "Limite de reenvios atingido. Cancele e crie um novo convite." |
| US-039 — validação reativa e layout estável | Padrão único de formulário (React Hook Form `mode: "onChange"`, `reValidateMode: "onChange"`) e componente `FieldError` com **altura reservada** (`min-h-5`); sem endpoint. |
| US-039 — achado 8/12/13 | Categorias em "Configurações" (menu); "Limpar filtros" visível **só com filtro ativo** e `aria-label` nos selects ("Membro: todos"); FAB oculto em telas de formulário de página inteira (`HIDE_FAB_ROUTES`, SDD-010 §6.4). |

---

## 2. Contratos de dados (TypeScript / Zod 4)

```typescript
// src/modules/contas/suggest-source.ts  (puro, sem Prisma/relógio)
export type SourceCandidate = { id: string; ownerMemberId: string; balanceInCents: number; archived: boolean; usageCountByMe: number };
export type SourceSuggestion = {
  accountId: string | null;
  reason: "OWNER_ENOUGH" | "OTHER_ENOUGH" | "HIGHEST_BALANCE" | "NONE";
  sufficient: boolean;                 // saldo >= valor
};
export function suggestSourceAccount(i: { amountInCents: number; ownerMemberId: string; accounts: SourceCandidate[] }): SourceSuggestion;
export const insufficient = (a: SourceCandidate, amountInCents: number) => a.balanceInCents < amountInCents;   // marca "saldo insuficiente"

// src/modules/transacoes/schemas.ts  (acréscimos)
//   ListTransactionsQuerySchema.q: z.string().trim().min(2, "Digite ao menos 2 letras").max(50).optional()
//   LedgerFilters.q?: string
// descriptionSchema (transacoes): .min(2/.max(100) com a MESMA mensagem "A descrição precisa ter entre 2 e 100 caracteres"

// src/modules/familia/invitations/schemas.ts
export const ResendInvitationSchema = z.object({}).strict();       // POST /invitations/:id/resend
export type RotatedInvitationResponse = { invitation: InvitationDTO; inviteUrl: string; emailStatus?: "SENT" | "FAILED" };   // emailStatus só no resend
// InvitationDTO ganha: resendCount: number; canResend: boolean (resendCount < 3 e PENDING e não vencido)
```

---

## 3. Contratos de API

| Rota | Papel | Corpo | Sucesso | Erros |
| :-- | :-- | :-- | :-- | :-- |
| `GET /api/v1/transactions?q=` | todos | `q` 2..50 | `200` (lista e totais filtrados) | 400 "Digite ao menos 2 letras" |
| `GET /api/v1/accounts` | todos | — | `AccountDTO.usageCountByMe` | — |
| `POST /api/v1/invitations/:id/resend` | **ADMIN** | `{}` | `200 RotatedInvitationResponse` (rotaciona o token, reenvia o e-mail após o *commit*, `resendCount+1`, `FamilyEvent INVITATION_RESENT`) | 403 · 404 · 409 `INVITATION_NOT_PENDING` · 422 `INVITATION_EXPIRED` "Convite expirado. Cancele e crie um novo convite." · 422 `RESEND_LIMIT_REACHED` |
| `POST /api/v1/invitations/:id/link` | **ADMIN** | `{}` | `200 RotatedInvitationResponse` (rotaciona o token; **não** envia e-mail; não incrementa `resendCount`) | 403 · 404 · 409 `INVITATION_NOT_PENDING` · 422 `INVITATION_EXPIRED` |
Mutações idempotentes (`Idempotency-Key`). Concorrência: `SELECT … FOR UPDATE` do convite; dois Administradores rotacionando ao mesmo tempo ⇒ **a última rotação vale** (a anterior é invalidada) — comportamento documentado, sem erro. **O token nunca é registrado em log** (já é regra do SDD-003 §6); o `inviteUrl` só aparece na resposta (como na criação). Nenhuma outra rota muda de contrato.

---

## 4. Regras e algoritmos

### 4.1 `suggestSourceAccount` (D-PO-19; vetores obrigatórios)
Entrada: contas **não arquivadas**. Ordem de decisão:
1. **Titulares com saldo suficiente**: contas com `ownerMemberId = owner` e `balance ≥ amount`; escolher a de **maior `usageCountByMe`**; empate ⇒ **maior saldo**; empate ⇒ **menor `id`** (determinístico). `reason = OWNER_ENOUGH`.
2. Senão, **qualquer outra** com `balance ≥ amount`, mesmo critério. `OTHER_ENOUGH`.
3. Senão, a de **maior saldo** (empate: maior `usageCountByMe`, depois menor `id`); `sufficient = false`; `HIGHEST_BALANCE`.
4. Sem contas ⇒ `{ accountId: null, reason: "NONE", sufficient: false }`.
**Nunca** usa "a última conta usada". O **lançamento de despesa** (US-005) continua com a regra do SDD-001 (`defaults`: última conta usada). A sugestão **recalcula** ao mudar o valor **enquanto o usuário não escolheu manualmente**; depois da escolha manual a sugestão **não** volta sozinha (estado `userPicked` no formulário).
| # | Cenário (titular = Lucas) | Esperado |
| :-- | :-- | :-- |
| A1 | Dinheiro(L) 9000 · Itaú Lucas(L) 300000 · Itaú Mariana(M) 650000; valor 47900 | **Itaú Lucas**, `OWNER_ENOUGH` (Dinheiro não cobre) |
| A2 | valor 400000 | **Itaú Mariana**, `OTHER_ENOUGH` |
| A3 | valor 900000 | **Itaú Mariana** (maior saldo), `HIGHEST_BALANCE`, `sufficient=false` |
| A4 | Itaú Lucas(uso 5, 300000), Bradesco Lucas(uso 1, 350000); valor 47900 | **Itaú Lucas** (mais usada vence maior saldo) |
| A5 | mesmo uso, saldos 300000 e 350000 | **Bradesco Lucas** (maior saldo) |
| A6 | mesmo uso e saldo | menor `id` |
| A7 | Itaú Lucas arquivada | **Itaú Mariana** |
| A8 | só `Dinheiro` 9000; valor 47900 | **Dinheiro**, `sufficient=false` (aviso "ficará negativa") |
| A9 | `insufficient(Dinheiro, 47900)` | `true` (marca "saldo insuficiente" no seletor; texto permanece com valores ocultos) |
| A10 | lista vazia | `NONE` |
**Dados do servidor**: `usageCountByMe` de `listAccounts`: `SELECT "accountId", count(*) FROM transactions WHERE "familyId"=$1 AND "authorMemberId"=$me AND "deletedAt" IS NULL AND "kind" IN ('EXPENSE','INVOICE_PAYMENT','TRANSFER_OUT') AND "accountId" IS NOT NULL AND "occurredOn" >= $hoje-90 GROUP BY "accountId"`.

### 4.2 Descrição visível (US-024)
- Campo "Descrição (opcional)" **abaixo da categoria**, 1 linha (≥ 44 px), **sem foco automático** (foco continua no valor), `trim` no envio; só espaços ⇒ omitido ⇒ servidor usa o nome da categoria (comportamento atual).
- Em despesa, receita e compra no cartão (mesmo componente `TransactionDrawer`); a **baixa** de previsão já tem descrição (herdada); a **edição** (US-013a) mostra e permite alterar.
- Validação no cliente com o **mesmo** `descriptionSchema` do servidor (`mode: "onChange"`; mensagem some ao ficar válido). Os **quatro toques** do lançamento rápido não mudam.
- **Busca**: campo "Buscar" no painel de filtros do Extrato; `q` na URL (`router.replace`); `buildLedgerWhere` adiciona `AND t."description" ILIKE '%' || $q || '%' ESCAPE '\'`; totais e lista coerentes (propriedade do SDD-005 §6). Chave de cache inclui `q`.

### 4.3 Convite: rotação de token (US-039)
`rotateInvitation(tx, ctx, id, { sendEmail })`: `FOR UPDATE` do convite da família (`404` se outra família); `status = PENDING` (senão `INVITATION_NOT_PENDING`); `expiresAt > agora` (senão `INVITATION_EXPIRED`); se `sendEmail` e `resendCount >= 3` ⇒ `RESEND_LIMIT_REACHED`; gera `token = randomBytes(32).toString("base64url")`, `tokenHash = sha256hex(token)`; `UPDATE invitations SET tokenHash, resendCount = resendCount + :s, lastSentAt = :now WHERE id` (**`expiresAt` intacta**); `inviteUrl = ${origem permitida | APP_URL}/convite/${token}` (mesma regra de origem do DEV-29); após o *commit*, se `sendEmail`, `MailPort.send` com timeout de 5 s (falha ⇒ `emailStatus FAILED`, convite permanece). Idempotência: a resposta (com o `inviteUrl`) fica no registro de idempotência por 24 h (como a criação) ⇒ duplo clique devolve o **mesmo** link, sem rotacionar duas vezes.
**Membro** (`MEMBER`) não vê "Copiar link"/"Reenviar e-mail" e a rota devolve `403`.
**Aviso na tela de convite** (texto fixo): "A pessoa precisa entrar com a conta Google do mesmo e-mail". **Aviso ao copiar/reenviar**: "O link anterior deixa de valer."

### 4.4 Validação reativa e componentes (US-039)
- `FieldError({ message })` reserva `min-h-5` mesmo vazio (sem salto de layout); o botão "Salvar" não muda de posição.
- Aplicar o padrão aos formulários **Transferir**, **Nova/Editar despesa prevista**, **Lançamento**, **Convite**, **Regra de divisão** (todos usam RHF + Zod).
- "Limpar filtros": visível quando `filtros ≠ padrão` (período corrente, sem demais filtros); restaura **o padrão do SDD-005 §4.1**.

---

## 5. Dados e migração
**`r21_convites_reenvio`** (US-039, SQL):
```sql
ALTER TABLE "invitations" ADD COLUMN "resendCount" INTEGER NOT NULL DEFAULT 0, ADD COLUMN "lastSentAt" TIMESTAMPTZ(3);
ALTER TABLE "invitations" ADD CONSTRAINT invitations_resend_chk CHECK ("resendCount" BETWEEN 0 AND 3);
```
Sem migração para US-023 e US-024. `AccountDTO.usageCountByMe` é derivado.

---

## 6. Interface
- **Pagar fatura / Dar baixa**: campo "Pagar com" mostra a conta sugerida com o **motivo** em texto secundário ("Conta do titular com saldo suficiente", "Outra conta com saldo suficiente", "Nenhuma conta cobre o valor"); o seletor lista **saldo** (via `Money`) e o selo "saldo insuficiente"; aviso "A conta de origem ficará negativa" + "Confirmar mesmo assim" como hoje. Estado `userPicked` mantém a escolha manual.
- **Lançamento**: campo de descrição (§4.2). **Extrato**: busca, "Limpar filtros", rótulos acessíveis.
- **Família**: convites pendentes com "Copiar link" e "Reenviar e-mail" (só ADMIN), contador "reenvios restantes", toasts "Link copiado" / "E-mail reenviado".
- **Chaves de cache**: `["accounts"]` (sugestão), `["transactions", filtros incl. q]`, `["family"]` (convites). Reenvio/cópia invalidam `["family"]`.

---

## 7. Segurança e isolamento
`suggestSourceAccount` só vê contas da família (lista do servidor). `q` é parametrizado e escapado (sem concatenação de SQL). Token de convite: nunca em log, nunca em `GET`; só na resposta da rotação/criação. Convite de outra família ⇒ `404`. `.strict()` nos corpos.

---

## 8. Testes obrigatórios (BDD → teste) — U/C/I/E como no SDD-010

### US-023 (ordem 3)
| Cenário BDD | Testes |
| :-- | :-- |
| Sugestão não usa a última conta / Prefere a do titular / Baixa usa a do responsável | **U**: A1. **I**: `GET /accounts` devolve `usageCountByMe` e saldos; função aplicada aos dados reais do servidor devolve Itaú Lucas. **E**: "Pagar com" pré-selecionado e sem aviso de negativo. |
| Titular sem saldo cai para outra conta / Nenhuma cobre | **U**: A2, A3. **E**: aviso e "Confirmar mesmo assim" no cenário "Viagem". |
| Desempate pela mais usada | **U**: A4..A6. **I**: contagem dos últimos 90 dias (5 × 1; lançamento de 91 dias **não** conta; lançamento de outro membro não conta). |
| Seletor marca contas sem saldo | **U**: A9. **E**: "Dinheiro — saldo insuficiente" e "Itaú Lucas" sem marcação. |
| Escolha manual respeitada / Mudar o valor antes de escolher recalcula | **C**: estado `userPicked`; alterar valor de 200000 para 400000 antes da escolha ⇒ sugestão passa a Itaú Mariana; depois de escolher manualmente não troca. |
| Conta arquivada nunca é sugerida / Uma única conta | **U**: A7, A8. **E** (habilitado com a US-032): arquivada fora da lista. |
| (infra) Lançamento de despesa mantém "última conta usada" | **I (regressão)**: `GET /transactions/defaults` inalterado. |

### US-024 (ordem 4)
| Cenário BDD | Testes |
| :-- | :-- |
| Campo visível sem "Mais detalhes" / Foco no valor / Receita e compra no cartão também | **C/E**: `getByLabelText("Descrição (opcional)")` presente nos três modos; `document.activeElement` é o valor. |
| Salvar com descrição / vazia assume a categoria / só espaços | **I**: `POST` sem `description` ⇒ `description = "Supermercado"`; `"   "` ⇒ nome da categoria; **E**: Extrato. |
| Curta / longa demais | **U**: `"a"` e 101 caracteres ⇒ **"A descrição precisa ter entre 2 e 100 caracteres"**; **E**: botão desabilitado. |
| Quatro toques | **E**: valor ⇒ categoria ⇒ salvar com descrição "Saúde" gravada. |
| Editar a descrição | **I**: `PATCH description` ⇒ 200 e revisão. |
| **Busca por descrição** | **I**: `GET /transactions?q=bairro` ⇒ só "Mercado do bairro"; `q=%` (literal escapado) não casa tudo; `q=a` ⇒ 400; totais coerentes com a lista (propriedade). **E**: campo "Buscar" e `q` na URL. |

### US-039 (ordem 18)
| Cenário BDD | Testes |
| :-- | :-- |
| Erro de valor some ao corrigir / Layout não salta | **C**: RHF `onChange` limpa a mensagem; `getBoundingClientRect` do botão igual antes/depois (altura reservada). |
| Categorias no menu de configurações | **E**: menu do avatar ⇒ "Configurações" ⇒ "Categorias". |
| Copiar link / Reenviar e-mail / Aviso da conta Google / Membro não reenvia | **I**: `POST /invitations/:id/link` ⇒ 200, `tokenHash` mudou, **link antigo inválido** (`previewInvitation` do token velho ⇒ `INVALID`), `expiresAt` **igual**; `resend` ⇒ e-mail no `InMemoryMailer`, `resendCount 1`; 4º `resend` ⇒ 422 `RESEND_LIMIT_REACHED`; vencido ⇒ 422; MEMBER ⇒ 403; outra família ⇒ 404; duplo clique mesma chave ⇒ 1 rotação. **E**: Mailpit recebe o e-mail; "Link copiado" / "E-mail reenviado"; texto "A pessoa precisa entrar com a conta Google do mesmo e-mail". |
| Limpar filtros / só com filtro ativo / rótulo acessível | **E/C**: botão aparece com filtro, some sem; `getByRole("combobox", { name: "Membro: todos" })`. |
| FAB não cobre formulários de página inteira | **E**: 375 px na tela "Regra de divisão" sem "+"; "Salvar regra" visível. |

---

## 9. Estimativa e dependências

| História | PO | **TL** | Observação |
| :-- | :-: | :-: | :-- |
| US-023 | 3 | **3** | Função pura + `usageCountByMe` + UI do seletor |
| US-024 | 2 | **3** | Interface (1) + **busca `q`** (não prevista) (+1) + mensagem única |
| US-039 | 5 | **5** | Rotação de token + 3 formulários reativos + menu + filtros; fatiável por achado (cada cenário é independente) |
Dependências: US-023 depende dos drawers de US-017b/019; US-024 de US-005/006/016a; US-039 de US-003/007/014 e do `FamilyEvent` (SDD-011).

**Impacto em R1/R2:** `tests/unit/transacoes/schemas.test.ts:73,77` (mensagem de descrição); `transaction-drawer.tsx` (campo fora de "Mais detalhes", DEV-10); `extrato` (filtro `q`, "Limpar filtros", rótulos); `contas/service.ts` (`listAccounts` com `usageCountByMe`); `pay-invoice-drawer.tsx`, `pay-drawer.tsx` (sugestão); `familia/invitations/*` (rotação) e `tests/integration/us-003-convites.int.test.ts` (token antigo inválido após rotação).
