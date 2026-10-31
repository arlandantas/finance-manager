# SDD-029: Resumo por conta no "A pagar" (`byAccount`) e saldo previsto (US-060)

- **História**: [US-060](../../product-owner/backlog/stories/US-060-resumo-por-conta-no-a-pagar.md) · **Necessidade**: [NEED-033](../../stakeholder/needs/NEED-033-visao-sintetica-por-conta-em-contas-a-pagar.md) (Q-U24) · **Fluxo**: [FLUXO-018](../../product-owner/flows/FLUXO-018-visao-por-conta-em-a-pagar.md) · **Pedido**: TL-U4 ([`pedidos-ao-tech-lead-uso-real.md`](../../product-owner/backlog/pedidos-ao-tech-lead-uso-real.md))
- **Substitui**: SDD-019 §7 (resumo de 1 linha, desatualizado: dizia "faturas não entram" e "3 pts"). **Base**: SDD-018 §2 (`collectOpenPayables`, `slicePeriod`), SDD-009 §4.6, SDD-010 §4.2, D-PO-42.
- **Status**: **Implementado** (TASK-054; aceito pelo Gestor, D-GES-65) · **Autor**: Agente Tech Lead · **Data**: 2026-10-26
- **Estimativa (TL)**: **5 pts** (confirma o PO; §9). **Executor**: Dev & QA, modelo **Sonnet**. Sem migração, sem índice novo, sem rota nova.
- **Restrição**: nada grava. Saldo, extrato, totais, acerto e Resumo não mudam (regressão S1..S16 intacta). `GET /api/v1/payables` só **ganha campos** (aditivo).

## 1. Verificação no código (o código vence a doc)
| Achado | Consequência |
| :-- | :-- |
| `collectOpenPayables` (`previstas/payables.ts`) **não filtra "Só meu"**: `repo.listOpen()` traz toda prevista PREVISTO da família, de qualquer membro. `/payables` e o Resumo já mostram o título e o valor para todos. | Q-U24 já é o comportamento do coletor. Incluir "Só meu" alheio no `byAccount` **não abre nenhum dado novo**; basta **não filtrar**. Há teste de regressão (§8.2). |
| `PayableItemDTO` tem `paymentAccountName`, mas **não o id** da conta. | Acrescentar `paymentAccountId` (id de conta que o próprio `/accounts` já expõe a todos). |
| Fatura (`invoiceItem`) sempre vem com `paymentAccountName: null`; `CreditCard` **não tem** `paymentAccountId` (US-089 não implementada). | Hoje **toda fatura cai em "Sem conta definida"**. O gancho para a US-089 fica pronto (§3.2); nenhuma mudança no `byAccount` quando ela chegar. |
| `getMonthSummary` já calcula `projectedBalanceInCents = totalBalanceInCents (ativas e fora das reservas) − toPay.totalInCents`. | Mantido **sem alteração**. O `byAccount` é outra visão; só a soma da coluna "A pagar" é identidade (§4.3). |
| `listAccounts` roda 3 consultas extras (uso 90 dias, nunca usada) que o bloco não precisa. | Helper enxuto `listAccountBalances` (§3.3). |
| `useInvalidatePlanned`, `transacoes/hooks` e `cartoes/hooks` já invalidam `["payables"]`; **`contas/hooks` não**. | Saldo por conta ficaria velho depois de transferência, nova conta, renomear, arquivar ou marcar reserva (§6.3). |
| `/payables` roda em `ReadCommitted` por padrão; `home` usa `RepeatableRead`. | Itens e saldos precisam do **mesmo instantâneo** (§3.4). |

## 2. Decisões
| ID | Decisão |
| :-- | :-- |
| D-TL-U4-1 | `byAccount` é **derivado em memória dos `items` já recortados** por `slicePeriod`. Nenhuma consulta nova de previstas/faturas, nenhuma segunda definição de "a pagar". Cada item entra em **exatamente uma** linha, então a soma bate por construção (reconciliação, §4.3). |
| D-TL-U4-2 | Função **pura** `buildByAccount(items, accounts, extras?)` em `src/modules/previstas/by-account.ts` (sem Prisma, sem relógio). O serviço só lê as contas e os saldos e a chama. |
| D-TL-U4-3 | **Mês futuro (D-PO-42)** e passado usam a **mesma fórmula**: `saldo atual` é sempre o de hoje; só o recorte de "a pagar" muda (`slicePeriod`). Sem projeção acumulada (fora de escopo, AP1). |
| D-TL-U4-4 | `GET /payables` ganha `byAccount` sempre (cálculo O(itens + contas), 1 consulta de saldos). `previstas_do_mes` (MCP) **não** o expõe: `listPayables(..., { byAccount: false })` e o `Output` strict do MCP fica **igual** (sem campo novo). |
| D-TL-U4-5 | Colunas "A receber" (US-051) e "Transferências previstas" (US-100): o **contrato já as carrega** (campos `toReceiveInCents`, `plannedTransfersInCents` e flags `columns`), sempre `0`/`false` hoje. As US-051/US-100 só preenchem `extras`. Nenhum campo novo depois. |
| D-TL-U4-6 | O filtro por conta da lista (FLUXO-018 §4) é **no cliente**, por `item.paymentAccountId` (`null` = chave `"none"`). Sem parâmetro de rota. |

## 3. Contrato

### 3.1 Zod / TypeScript (`src/modules/previstas/schemas.ts`, acréscimo aditivo)
```ts
const cents = z.number().int();

export const ByAccountRowSchema = z.object({
  /** null = linha "Sem conta definida" (previstas e faturas sem conta). */
  account: z.object({
    id: z.uuid(),
    name: z.string(),
    archived: z.boolean(),
    excludeFromAvailable: z.boolean(),   // reserva (US-057)
  }).nullable(),
  balanceInCents: cents.nullable(),      // saldo de hoje; null só em "Sem conta definida"
  dueInCents: cents.nonnegative(),       // Σ amountInCents dos itens do recorte nesta conta (atrasados inclusos)
  itemCount: z.number().int().nonnegative(),
  toReceiveInCents: cents.nonnegative(),         // US-051; 0 até existir
  plannedTransfersInCents: cents,                // US-100; líquido (entra − sai); 0 até existir
  projectedInCents: cents.nullable(),    // balance − due + toReceive + plannedTransfers; null sem conta
  shortfallInCents: cents.nonnegative(), // max(0, −projected); 0 se projected null
}).strict();

export const ByAccountSchema = z.object({
  rows: z.array(ByAccountRowSchema),
  columns: z.object({ toReceive: z.boolean(), plannedTransfers: z.boolean() }).strict(), // true só se alguma linha ≠ 0
}).strict();

// PayableItemDTO += paymentAccountId: string | null   // PLANNED: FK; INVOICE: conta pagadora do cartão (US-089) ou null
// PayablesResponse += byAccount: ByAccount            // items, groups, period, totals ficam IGUAIS
export type ByAccountRow = z.infer<typeof ByAccountRowSchema>;
```
`totals.dueInCents` (existente) é o **rodapé "Total"** da tabela; não se duplica em `byAccount`. Dinheiro sempre em centavos inteiros (SDD-000); nenhuma conversão em float.

### 3.2 Origem do `paymentAccountId` do item
- `plannedItem`: `r.paymentAccountId` (coluna existente; `include` já traz `paymentAccount`).
- `invoiceItem`: `i.paymentAccountId`, com `PayableInvoice` ganhando `paymentAccountId: string | null` lido de `card.paymentAccountId`. **Até a US-089 o campo não existe no `CreditCard`**: o Dev fixa `null` com comentário `// US-089` (um único ponto de troca). A US-089 (TL-U8) liga a coluna; nada mais muda aqui.
- Conta arquivada/excluída que sobrou no item: tratada em §4.1 (R5), sem erro.

### 3.3 Serviço (`previstas/payables.ts`)
```ts
export async function listPayables(tx, ctx, q, opts: { byAccount?: boolean } = {}): Promise<PayablesResponse>;
// byAccount (default true): due = listDueItems(...); accounts = await listAccountBalances(tx, ctx);
//   byAccount = buildByAccount(due.items, accounts)   // MESMOS due.items de items/groups/totals
```
`listAccountBalances(tx, ctx): Promise<Array<{ id, name, archived, excludeFromAvailable, balanceInCents }>>` em `contas/service.ts`: `contasRepo.list("all")` + `accountBalances(tx, familyId)` (uma consulta agregada), sem as consultas de uso. Respeita `check:imports` (previstas já depende de contas pela baixa; o Dev ajusta a exceção se a regra reclamar e registra).

### 3.4 Rota
`GET /api/v1/payables` passa a `withApi({ query, prepare, isolationLevel: "RepeatableRead" })`: itens e saldos do **mesmo instantâneo** (a identidade "soma = total" não depende de relógio, mas o saldo exibido não pode misturar duas leituras). Códigos: 200 (sem mudança), 400 `period` inválido (existente), 401/403 de sempre. `Cache-Control` e `force-dynamic` mantidos.

## 4. Regra de cálculo (`buildByAccount`)
**Entrada**: `items: PayableItemDTO[]` (já `slicePeriod`, qualquer membro, "Só meu" inclusive); `accounts` (todas as contas da família com `archived`, `excludeFromAvailable` e `balanceInCents` = saldo de hoje do livro-caixa, igual ao "Saldo atual" do Resumo); `extras?: Map<accountId, { toReceive, plannedTransfers }>` (vazio hoje).

### 4.1 Regras
| # | Regra |
| :-- | :-- |
| R1 | **Chave** do item = `paymentAccountId`. Id ausente em `accounts` (defesa: conta de outra família é impossível pela FK composta) cai em `null`. Cada item soma em **uma** linha. |
| R2 | `dueInCents` = Σ `amountInCents` dos itens da linha: previstas e faturas, atrasadas incluídas (no mês corrente), **qualquer responsável, qualquer `isSharedExpense`, "Só meu" de outro membro incluso (Q-U24)**. Nenhum filtro por ator. |
| R3 | `balanceInCents` = saldo de hoje da conta (todas as datas já lançadas). **Nunca** é ajustado pelo período: mês futuro/passado mostram o mesmo saldo atual (D-PO-42). |
| R4 | `projectedInCents = balance − due + toReceive + plannedTransfers`; `shortfallInCents = max(0, −projected)`. Sem arredondamento (inteiros). "Falta" só quando `projected < 0` (zero não é falta). |
| R5 | **Quais contas viram linha**: conta ativa e fora de reserva ⇒ linha se `balance ≠ 0` **ou** `due > 0`; reserva (`excludeFromAvailable`) ou arquivada ⇒ linha **só se** `due > 0` (ou extras ≠ 0). Isso cobre "reserva só com a pagar" e "arquivada só se ainda tiver a pagar". |
| R6 | **"Sem conta definida"** (`account: null`): existe **só se** `due > 0`; `balance`, `projected` = `null`, `shortfall` = 0. Recebe previstas sem conta, itens com conta desconhecida (R1) e, hoje, **todas as faturas**. |
| R7 | **Ordem** (servidor): linhas com conta por `projectedInCents` crescente (as que faltam primeiro), empate por `name` (`localeCompare("pt-BR")`) e depois `id`; "Sem conta definida" **sempre por último**. |
| R8 | `columns.toReceive` = alguma linha com `toReceiveInCents ≠ 0`; `columns.plannedTransfers` idem com `≠ 0`. |
| R9 | Conta **arquivada com saldo e sem a pagar** não aparece (R5). Se tiver a pagar, aparece com `archived: true` e a UI mostra o selo "Arquivada" ao lado do nome. |

### 4.2 Cartões
Fatura em aberto (aberta ou fechada, total > 0, não paga) é item `INVOICE` do coletor e segue R1: com `paymentAccountId` (US-089) soma na conta pagadora; sem ele (hoje, ou cartão sem conta, ou conta arquivada limpa) vai a "Sem conta definida". Fatura **paga** ou de total 0 nunca entra (já filtrado no coletor). Pagar a fatura cria o lançamento na conta escolhida no ato e a retira do coletor: o saldo cai e o "a pagar" cai pelo mesmo valor (previsto não muda; cenário análogo ao da baixa).

### 4.3 Propriedade de reconciliação (invariante testada)
Para **qualquer** período e estado do banco:
1. `Σ byAccount.rows[].dueInCents === totals.dueInCents` (inclui a linha `null`);
2. `Σ rows[].itemCount === items.length`;
3. `totals.dueInCents === getMonthSummary(period).toPay.totalInCents` (SDD-018 já exige; reafirmada);
4. cada `item.id` pertence a uma única linha (por `paymentAccountId`/`null`).
`buildByAccount` recebe os `due.items` que também alimentam `items`/`totals`; não existe segundo caminho de cálculo que possa divergir.

### 4.4 Privacidade (Q-U24, "sem vazar nada além do que o payables já mostra")
- A linha expõe **apenas agregados** (soma e contagem) e `account.{id,name,archived,excludeFromAvailable}`, dados que `GET /api/v1/accounts` já entrega a todo membro (inclusive o saldo). Nenhum título, responsável, observação ou `authorId` entra em `byAccount`.
- `paymentAccountId` no item acompanha campos que o item já tinha (`paymentAccountName`, `paymentAccountOwnerId`).
- A informação nova é só "quanto da conta X vai para contas de outro membro": já derivável hoje pela soma dos itens visíveis. A matriz de controle de [so-meu.md](../../estado/so-meu.md) **não muda** (ver quem pode baixar/editar continua nas rotas de escrita).
- **MCP não muda** (`previstas_do_mes` sem `byAccount`); teste garante o `Output` idêntico.

## 5. Escrita e consistência
Somente leitura: nenhuma transação de escrita, nenhuma `FamilyEvent`, nenhum `lock`. Instantâneo único (§3.4). `ensureRecurrenceHorizonStandalone` continua no `prepare` (as séries geradas entram no recorte antes da leitura).

## 6. Estados técnicos de UI (`/previstas`, bloco no topo; arquivo novo `by-account-block.tsx`)
### 6.1 Estados
| Estado | Comportamento |
| :-- | :-- |
| **Loading** | Mesma query `usePayables(period)`; `Skeleton` de 3 linhas (tabela em ≥ 1024 px, 3 cartões em 375 px) acima do skeleton da lista. Sem salto de layout ao carregar. |
| **Sucesso com linhas** | Tabela (desktop) / cartões (mobile): **Conta · Saldo atual · A pagar · Saldo previsto**; colunas "A receber"/"Transferências previstas" só se `columns.*`; rodapé "Total" = `totals.dueInCents`. Marcação **única** responsiva por CSS grid (sem duplicar o DOM); `<table>` com `<caption>` no desktop e `role="list"` nos cartões. |
| **Falta** | `shortfallInCents > 0` ⇒ ícone + texto "Falta R$ X" + cor de alerta no "Saldo previsto" (nunca só cor, NEED-017); sem bloqueio. |
| **Sem conta definida** | Mostra só "A pagar"; "Saldo atual"/"Saldo previsto" como "—". Sempre a última linha. |
| **Vazio** | `rows` vazio: mensagem "Nenhuma conta com saldo ou a pagar neste mês". `rows` presente e lista vazia: o bloco continua e a lista mostra "Nada a pagar neste mês". |
| **Erro** | A falha da query única derruba bloco e lista juntos: um só estado de erro com "Tentar de novo" (`refetch`). Não há erro parcial (mesma resposta). |
| **Ocultar valores (US-027)** | Todo número passa por `<Money>`; mascarado, o "Falta" aparece como "Falta R$ •••••" e o `aria-label`/`title` **não** contêm o número. |
| **Selo** | Conta arquivada: selo "Arquivada"; reserva: selo "Reserva" (R5 só as lista se tiverem a pagar). |

### 6.2 Interação
Tocar numa linha ativa o filtro da lista (chip "Conta: {nome} ✕", `aria-pressed` na linha); tocar de novo ou no ✕ limpa; trocar de mês limpa o filtro. "Sem conta definida" filtra os itens com `paymentAccountId === null`. A linha é um `button` (teclado: Enter/Espaço).

### 6.3 Cache (TanStack Query)
Chave existente `["payables", period]`. **Acrescentar `["payables"]` à invalidação** das mutações de `contas/hooks.ts` (criar conta, transferir, renomear, arquivar/restaurar, marcar reserva): o saldo e o nome da linha dependem delas. Baixa, estorno, lançamento, edição de prevista/série e pagamento de fatura já invalidam.

## 7. Estimativa e fatiamento
| Fatia | Conteúdo | Pts |
| :-- | :-- | :-- |
| API | `paymentAccountId` no item, `buildByAccount` (puro), `listAccountBalances`, `RepeatableRead`, `byAccount` na resposta, `byAccount:false` no MCP | 2 |
| UI | `by-account-block.tsx` (tabela/cartões, Falta, filtro por conta, rodapé, selos), estados, invalidação em `contas/hooks.ts` | 2 |
| Testes | Unidade, propriedade, integração, E2E/BDD 1:1 (§8) | 1 |
| **Total** | **Confirma 5 pts** (o PO estimou 5; o SDD-019 §7 dizia 3 sem fatura, "Só meu" nem saldo previsto) | **5** |
Risco de crescer: baixo. Se a US-089 entrar antes, **+0 aqui** (o gancho já existe).

## 8. Guia de testes para o Dev & QA
### 8.1 Unidade (`tests/unit/previstas/by-account.test.ts`, funções puras, sem banco)
1. Cenários do Gherkin como vetores: saldo 1.000 + a pagar 650 + 120 ⇒ due 77.000, projected 23.000; saldo 500 e due 770 ⇒ shortfall 27.000.
2. Linha `null`: só com `due > 0`; `balance`/`projected` nulos; sempre por último mesmo com "faltando".
3. R5: ativa com saldo 0 e sem a pagar ⇒ sem linha; ativa com saldo ≠ 0 e sem a pagar ⇒ linha; reserva sem a pagar ⇒ sem linha; reserva e arquivada **com** a pagar ⇒ linha com selos.
4. R7: ordem por previsto crescente, empate por nome pt-BR (acento), depois `id`; negativos antes de positivos.
5. R4: projeção `0` não é falta; centavos grandes (`> 2^31`) sem perda; `extras` somam (a receber +, transferência líquida ±) e ligam `columns`.
6. R1 defesa: `paymentAccountId` desconhecido ⇒ linha `null`.
7. **Propriedade** (PRNG semeado `mulberry32`, ≥ 200 casos): itens e contas aleatórios ⇒ `Σ due === Σ items.amount`, `Σ itemCount === items.length`, nenhum item duplicado, `shortfall === max(0,−projected)`.

### 8.2 Integração (`tests/integration/us-060-resumo-por-conta.int.test.ts`, mesmo molde do `us-055`)
1. **Reconciliação (obrigatória)**: fixtures aleatórias semeadas (previstas PREVISTO/PAGO/excluídas, com e sem conta, contas ativas/arquivadas/reserva, faturas abertas/fechadas/pagas/zeradas) em **3 períodos** (anterior, corrente com atrasados, futuro): `Σ byAccount.rows[].dueInCents === totals.dueInCents === month-summary.toPay.totalInCents` e `Σ itemCount === items.length`.
2. **"Só meu" de outro membro (Q-U24)**: Lucas cria prevista "Só meu" 300 na Corrente; **Mariana** vê `Corrente.due` com os 300 e `projected` 700 (saldo 1.000). Os mesmos 300 aparecem nos `items` (regressão: nada filtrado). Nenhum campo de `byAccount` contém título/descrição/observação (varrer o JSON da linha).
3. **Fatura sem conta pagadora**: cartão com fatura fechada 1.500 vencendo no mês ⇒ linha `null` com 1.500; soma bate. (Cenário "conta pagadora" fica **pendente de US-089**: escrever o teste já marcado `it.todo` com o gancho `invoiceItem.paymentAccountId`.)
4. **Baixa**: baixar prevista de 650 pela Corrente ⇒ `balance` −650, `due` −650, `projected` **inalterado** (Gherkin "Prevista paga sai do cálculo"). Estorno desfaz. Pagar fatura: mesma igualdade.
5. **Mês futuro (D-PO-42)**: `?period=` do mês seguinte mostra o **mesmo `balanceInCents`** do corrente e `due` só daquele vencimento (sem atrasados anteriores); mês passado só traz o que ainda está aberto naquele período.
6. **Contas**: arquivada sem a pagar some; arquivada com a pagar aparece `archived: true`; reserva com a pagar aparece com `excludeFromAvailable: true`; conta ativa com saldo 0 e nada a pagar não aparece.
7. **Isolamento**: outra família com contas e previstas nunca aparece; `paymentAccountId` de outra família é recusado na escrita (regressão existente) e, se injetado no teste, cai em `null`.
8. **Instantâneo**: `byAccount` e `items` coerentes quando um lançamento é gravado em paralelo (rodada com `RepeatableRead`: a soma continua igual ao total).
9. **MCP inalterado**: `previstas_do_mes` retorna o mesmo `Output` (sem `byAccount`); snapshot do schema strict continua verde.
10. **Regressão**: `us-055`, `us-057`, `us-058-059`, `us-061-063` e `sec038` verdes sem edição.

### 8.3 E2E / BDD (`tests/e2e/features/US-060-resumo-por-conta-no-a-pagar.feature` + steps; 1:1 com os **9 cenários** da US, em 375 e 1280 px)
- "Saldo previsto por conta", "Conta que vai faltar" (texto "Falta R$ 270,00" + ícone, não só cor), "Prevista sem conta", "Prevista Só meu de outro membro", "A soma das contas bate com o total" (R$ 950,00 nos dois lugares, **lendo os números da tela**), "Fatura entra na conta pagadora" (**`@pendente-us-089`**, fora do verde até a US-089), "Fatura sem conta pagadora", "Prevista paga sai do cálculo", "Valores ocultos" (valores mascarados, "Falta" visível sem número, `aria-label` sem número).
- Extras: estados skeleton (resposta atrasada), vazio ("Nada a pagar neste mês" com as contas listadas), erro com "Tentar de novo", filtro por conta (chip, limpar, trocar mês limpa), teclado (Tab/Enter), mobile 375 px **sem rolagem horizontal** (`scrollWidth ≤ innerWidth`), axe nos dois temas.
- Notas de Gherkin (pedido §3.3): sem `E, após…`, sem frases em várias linhas, todo cenário com `Dado`; onde o parser colidir passos (DEV-25), o Dev ajusta e registra.

## 9. Riscos e pendências
| ID | Risco / pendência | Tratamento |
| :-- | :-- | :-- |
| R-1 | **Até a US-089, toda fatura cai em "Sem conta definida"**, o que deixa o saldo previsto por conta otimista para quem tem cartão (a fatura é, em geral, a maior saída). | Aceito pelo PO ("sem ela as linhas ficam como acima"). Comunicar na homologação; **US-089 deve vir logo depois** (já é a 3ª da fila). Sem retrabalho. |
| R-2 | "Saldo atual" em mês futuro/passado é o de **hoje** (D-PO-42): pode parecer "projeção" e não é. | Rótulo na UI: "Saldo atual (hoje)"; sem acumular meses (AP1). |
| R-3 | `listAccountBalances` varre o livro-caixa da família (uma agregação, como o Resumo e o Início). | Aceito (mesma ordem de custo já paga no Resumo); sem índice novo. Reavaliar se a Home passar de ~50 mil lançamentos. |
| R-4 | Divergência intencional com o Resumo: `projectedBalanceInCents` (total sem reservas − todo o "a pagar") **≠** Σ dos `projectedInCents` (reservas e "Sem conta" fora). | Só `dueInCents` é identidade (§4.3). Não alterar o Resumo; o Dev **não** deve "corrigir" um lado. |
| R-5 | `contas/hooks.ts` sem invalidação de `["payables"]` mostraria saldo velho. | §6.3, coberto por E2E (transferir e voltar ao A pagar). |
| R-6 | `RepeatableRead` em `/payables` pode gerar falha de serialização sob escrita concorrente (leitura apenas, não deve). | `withApi` já trata; teste §8.2-8. |

### Hipóteses/decisões no formato dos pedidos ao Gestor (nenhuma bloqueia; Gestor ratifica)
| ID | Data | História | Lacuna / desvio | Hipótese adotada | Impacto |
| :-- | :-- | :-- | :-- | :-- | :-- |
| TL-U4-1 | 2026-10-26 | US-060 | A US não diz se conta **ativa com saldo 0 e nada a pagar** vira linha | Não vira (R5); com saldo ≠ 0 ou a pagar > 0, sim | Nenhum na soma; evita ruído de contas vazias |
| TL-U4-2 | 2026-10-26 | US-060 | Reserva/arquivada só com a pagar (US): "a pagar" e também extras ≠ 0 | Extras ≠ 0 também listam a conta (US-051/100) | Nenhum hoje |
| TL-U4-3 | 2026-10-26 | US-060 | PO pediu `byAccount` no `/payables`; MCP usa o mesmo serviço | MCP **não** ganha `byAccount` (D-TL-U4-4); expor ao assistente é decisão futura do PO | Nenhum |
| TL-U4-4 | 2026-10-26 | US-060 | "Saldo previsto" do Resumo (total) e Σ das linhas diferem por desenho | Documentado como R-4; só o "A pagar" reconcilia | Nenhum |
| TL-U4-5 | 2026-10-26 | US-060 / US-089 | Cenário "Fatura entra na conta pagadora" depende de coluna que não existe | Teste `it.todo` + feature `@pendente-us-089`; ativa na US-089 | O verde da US-060 cobre 8 dos 9 cenários |

## 10. Rastreabilidade
NEED-033 (RN-033.1..7) ⇒ FLUXO-018 ⇒ US-060 (Q-U24, D-PO-99) ⇒ **SDD-029** (TL-U4) ⇒ TASK-054. Completa-se com NEED-032/US-089 (conta pagadora, TL-U8), US-051/SDD-017 (a receber) e US-100 (transferência prevista, TL-U6). Estado vigente: [previstas-series.md](../../estado/previstas-series.md) e [lancamentos-contas-extrato.md](../../estado/lancamentos-contas-extrato.md).
