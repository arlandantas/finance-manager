# SDD-034: Membro sem conta: seletores e titular (US-093a); pagador, responsável, "Só meu" e acerto (US-093b)

- **História**: [US-093](../../product-owner/backlog/stories/US-093-atribuir-contas-e-lancamentos-ao-membro-sem-conta.md) · **Necessidade**: [NEED-028](../../stakeholder/needs/NEED-028-membro-sem-conta-ativa-e-convite-posterior.md) (RN-028.1, 028.4, 028.5; Q-U16) · **Fluxo**: FLUXO-020 · **ADR**: [ADR-033](../adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md) §3, §5, §6 · **SDD anterior**: [SDD-033](SDD-033-membro-sem-conta-modelo-e-cadastro-us-092.md) (092a/092b implementadas) · **Segurança**: revisão de 2026-10-30, **SEC-059 (a, b)**, **SEC-066b**, **SEC-067** (relatório `agents/security/relatorios/revisao-adr033-2026-10-30.md`); SEC-059c fica na 094b · **Decisões**: Q-TL-U1/U2/U3 (D-GES-63), D-GES-47/50/52/55/59, D-033-4
- **Status**: **Aprovado para Dev (ratificado D-GES-66)** · **Autor**: Agente Tech Lead · **Data**: 2026-10-31
- **Estimativa (TL)**: **7,5 pts** = 093a **3** + 093b **4,5** (ADR-033 §6 dizia 8; −0,5 pela decisão do usuário sobre SEC-059b, D-GES-66). **Executor**: Dev & QA, **Sonnet**; 093b toca o "Só meu" e o acerto: revisão final do TL (Opus) no diff de `ownership.ts`/`split/service.ts` e **reteste da Segurança** antes de fechar.
- **Restrição**: **nenhuma migração de schema**; nenhum motor de acerto (`split/settlement*.ts`, `split-amount.ts`, `rules.ts`) muda; nenhuma linha de ledger é reescrita. S1..S16, V1..V10 e o harness de 240 famílias intactos.

## 1. Verificação no código (o código vence a doc)
| Achado | Consequência |
| :-- | :-- |
| Os seletores leem `GET /family` (`family.data.members`), que já traz o sem conta com `unlinked: true` (092a/092b): `new-account-drawer.tsx:182`, `card-drawer.tsx`, `transaction-drawer.tsx` (radiogroup "Quem pagou?"), `edit-transaction-form.tsx`, `planned-drawer.tsx`, `pay-drawer.tsx`, `extrato/filters-panel.tsx:110`, `acerto-screen.tsx`, `regra-screen.tsx`. | 093a só acrescenta o **selo** e as travas de titular; nenhum endpoint novo de leitura. |
| `contas/service.ts:141` e `cartoes/service.ts:120` aceitam qualquer `ownerMemberId` ativo da família (`repo.memberExists`). `UpdateAccountSchema = RenameAccountSchema`: conta **não troca de titular** fora da remoção. | Titular sem conta: trava "só ADMIN" na criação de conta e de cartão e na troca de titular do cartão (§3.2). |
| `cartoes/service.ts:178-184`: só o titular ATUAL troca o titular (`CARD_OWNER_ONLY`, SEC-042/047). Com titular sem conta ninguém o troca (não há sessão). | Exceção do Admin quando o titular atual é sem conta ativo (ADR-033 §5), com `CARD_OWNER_CHANGED` (já existe). |
| `ownerStanding` (`transacoes/ownership.ts:107`) devolve só `{ ownerIsActor, ownerRemoved }` e lê com `findFirst` (sem trava). Dono sem conta ativo cai em "outro membro ativo" (D-033-4). | 093b: terceiro estado `ownerUnlinked`, lido com `FOR SHARE` (SEC-066b) (§4.1). |
| `assertCanMakePersonal` (`ownership.ts:259`): com `fullPower` o bloco de estrutura é pulado; se o Admin troca o pagador **para si**, `nextPayer === ctx.memberId` passa na trava SEC-026c e a trava D-GES-47 (`:304`) só vale para dividida. Com dono removido o `payerGone` segura; com dono sem conta **nada seguraria**. | Trava nova `UNLINKED_PAYER_FORBIDDEN` antes do `fullPower` (§4.3, SEC-059a). |
| D-GES-47 (`ownership.ts:304-311`): em dividida, quem não é dono nem autor não se põe como pagador; **trocar para um terceiro** é livre para qualquer membro. | A US-093 restringe "para ou de sem conta" a Lanç/Admin (§4.3). |
| `assertPersonalForSelf` é **síncrona** e chamada em `transacoes/service.ts:231` (`createExpenseCore`), `installment-create.ts:55` e `previstas/service.ts:417` (baixa); previstas/séries usam `assertPlannedResultAllowed` (`previstas/service.ts:145`, `recurring-service.ts:200`). | Exceção SEC-026c (Q-TL-U3) só nesses pontos de **criação** (§4.2), virando assíncrona (precisa ler o dono na transação). |
| O MCP (`mcp/assistant-write.ts:185-200`) chama `createExpenseCore` com `isSharedExpense: false` e **sem** `payerMemberId` (pagador = ator) e com `opts.assistant`. | A exceção recusa quando `opts.assistant` existe (SEC-067(4)); hoje já é impossível pelo corpo, a trava é defesa em profundidade. |
| `deny()` (`ownership.ts:214`) lista os nomes dos controladores ativos: um dono/titular sem conta apareceria em "Só Ana pode alterar", mas Ana não tem acesso. | Nomes de sem conta saem da lista; com `ownerUnlinked` entra "um Administrador" (§4.4). |
| `registerSettlement` (`split/service.ts:425`) valida membros, contas da família, A2 e A3; `repo.findAccount` seleciona só `{ id, name }`. Nenhuma regra sobre o titular da conta de destino. | **Sem mudança** (Q-TL-93-1 = (c), decisão do usuário 2026-10-31: qualquer conta da família, como hoje; SEC-059b risco aceito, D-GES-66). |
| Motores (`split/inputs.ts` `memberInputsOf`) usam só `id/joinedAt/removedAt`; `userId` não entra. Harness `buildUniverse(seed, { unlinked: k })` (`tests/support/split-universe.ts:32`) e `makeUnlinkedMember` (`tests/support/factories.ts:188`) existem. | Acerto e centavos: **nenhuma mudança**; só testes novos (§5). |

## 2. Decisões
| ID | Decisão |
| :-- | :-- |
| D-034-1 | **Fatiamento** (brief do Gestor, ajusta o ADR-033 §6): **093a** = selo nos seletores/filtros/telas, titular de conta/cartão só ADMIN, acerto **sem mudar motor** (só prova por testes e exibição). **093b** = matriz §5 (`ownerUnlinked`, poderes do tutor), exceção SEC-026c com os limites SEC-066b/067 e pagador/responsável `UNLINKED_PAYER_FORBIDDEN` (SEC-059a). O destino do acerto **não muda** (D-034-7). Ver TL-093-1. |
| D-034-2 | **O Administrador nunca vira pagador/responsável no lugar do sem conta** (SEC-059a; D-GES-47 vale para ele). O Admin pode passar o item do sem conta a um **terceiro** (dividida); em "Só meu" nem isso (seria "entregar", SEC-026c/SEC-067(1)). Só o **Lanç** (autor) troca livremente, como correção do que lançou. |
| D-034-3 | `ownerUnlinked` = dono **ativo** (`removedAt IS NULL`) **e** `userId IS NULL`, lido na transação com `SELECT ... FOR SHARE` (SEC-066b). Removido sem conta continua `ownerRemoved` (regras de ex-membro, D-GES-52/55/59 intactas). |
| D-034-4 | Poder do tutor (Admin sobre dono `ownerUnlinked`) = o mesmo `fullPower` do Admin-ex (D-GES-55): editar, excluir, restaurar, estornar, mudar divisão/conta/"Pagar com" do "Só meu", **sem** assumir o pagador (D-034-2). |
| D-034-5 | Exceção SEC-026c (Q-TL-U3): **só criação**, só `ctx.role === "ADMIN"`, só para dono `ownerUnlinked` lido com `FOR SHARE`, nunca com `opts.assistant` (MCP), nunca no ramo `payerChanges` de `assertCanMakePersonal` nem em `assertPlannedResultAllowed` com `current` (edição). |
| D-034-6 | Titular sem conta (conta ou cartão) só por ADMIN: 422 `UNLINKED_OWNER_ADMIN_ONLY`. Troca de titular de cartão cujo titular é sem conta ativo: só ADMIN (exceção ao `CARD_OWNER_ONLY`). |
| D-034-7 | Acerto com **credor** sem conta: **sem validação nova do destino** (Q-TL-93-1 = (c), decisão do usuário 2026-10-31, D-GES-66): vale qualquer conta da família, como hoje. A SEC-059b fica como **risco aceito pelo usuário**. Nenhum erro novo, `findAccount` e `settle-drawer` inalterados. |
| D-034-8 | Sem schema novo e sem campo novo em DTO: a UI deriva "dono sem conta" de `MemberRef.unlinked === true && !removed` (já entregue na 092a). |

## 3. Fatia 093a: seletores, selo, titular e acerto visível (3 pts)

### 3.1 Selo e rótulo (UI, puro)
```ts
// src/modules/familia/display-name.ts (aditivo; puro, já importável pela UI)
export const UNLINKED_BADGE = "Sem acesso ao app";
/** Texto de <option>/<radio> (não cabe selo dentro de <option>): "Ana · sem acesso ao app". */
export function memberOptionLabel(m: { name: string; unlinked?: true | undefined }): string {
  return m.unlinked ? `${m.name} · sem acesso ao app` : m.name;
}
```
- Componente `src/components/ui/unlinked-badge.tsx` (extraído do selo da tela Família da 092b, mesmo estilo): `<UnlinkedBadge />` com `aria-label="Sem acesso ao app"`.
- **Onde** (lista fechada; o Dev confere com `grep -rn "members ?? \[\]).map\|members.map" src/app`):

| Tela | Elemento | Mudança |
| :-- | :-- | :-- |
| Nova despesa/receita (`transaction-drawer.tsx`) | radiogroup "Quem pagou?/Quem recebeu?"/"Responsável" | chip `UnlinkedBadge` ao lado do nome |
| Editar lançamento (`edit-transaction-form.tsx`), Prevista (`planned-drawer.tsx`), Baixa (`pay-drawer.tsx`) | seletor de pagador/responsável | `memberOptionLabel` |
| Nova conta (`new-account-drawer.tsx`), Cartão (`card-drawer.tsx`) | "Titular" | `memberOptionLabel`; para não-ADMIN a opção sem conta vem `disabled` com sufixo " (só Administrador)" |
| Extrato (`filters-panel.tsx`) | filtros "Membro" e "Quem pagou" | `memberOptionLabel` |
| Acerto (`acerto-screen.tsx`), Regra (`regra-screen.tsx`) | linhas por membro, percentuais | chip ao lado do nome |
| Detalhe do lançamento (`transaction-detail-drawer.tsx`), Contas/Cartões (titular), Previstas (responsável) | nome exibido | chip ao lado do nome |
| Análise/relatórios | "Quem pagou" e filtros | `memberOptionLabel` nos filtros; linhas só com o nome (TL-093-8) |

- Ex-membro sem conta (`removed` + `unlinked`): mostra só "(ex-membro)" como hoje; o selo "sem acesso" não se soma (evita ruído).

### 3.2 Titular sem conta só ADMIN (API)
```ts
// src/modules/familia/display-name.ts ou contas/cartoes (código compartilhado)
export const UNLINKED_OWNER_ADMIN_ONLY = "UNLINKED_OWNER_ADMIN_ONLY";
export const UNLINKED_OWNER_ADMIN_ONLY_MESSAGE =
  "Só um Administrador pode pôr como titular quem não tem acesso ao app.";

// repo de contas e de cartões: substitui o uso booleano de memberExists onde há titular
ownerCandidate: (memberId: string) =>
  tx.member.findFirst({ where: { id: memberId, familyId, removedAt: null }, select: { id: true, userId: true } }),
```
| Ponto | Regra |
| :-- | :-- |
| `createAccount` (`contas/service.ts:141`) | titular inexistente ⇒ 422 `INVALID_REFERENCE` (como hoje); titular com `userId == null` e `ctx.role !== "ADMIN"` ⇒ **422 `UNLINKED_OWNER_ADMIN_ONLY`** (`path: "ownerMemberId"`) |
| `createCard` (`cartoes/service.ts:120`) | idem |
| `updateCard` troca de titular (`cartoes/service.ts:178`) | (1) titular **atual** sem conta ativo ⇒ só ADMIN troca (exceção ao `CARD_OWNER_ONLY`); não-ADMIN ⇒ 403 `CARD_OWNER_ONLY` com a mensagem "Só um Administrador pode trocar o titular deste cartão."; (2) **novo** titular sem conta ⇒ exige ADMIN (422 `UNLINKED_OWNER_ADMIN_ONLY`) **e** a regra (1)/`CARD_OWNER_ONLY` atual (só o titular atual, ou ADMIN quando o atual é sem conta). Grava `CARD_OWNER_CHANGED` como hoje |
| Conta: troca de titular | Inexistente fora da remoção (`removal.ts` reatribui a ativo; reatribuir a um sem conta continua permitido ao Admin que remove: já é ADMIN) |
| Pagamento de fatura / "Pagar com" (SDD-030) | Sem mudança: a conta do sem conta é conta da família |

Ordem de checagem no cartão: `CARD_OWNER_ONLY` (403) antes de `UNLINKED_OWNER_ADMIN_ONLY` (422), para não revelar o tipo do alvo a quem nem pode trocar.

### 3.3 Acerto (sem mudança de motor)
- `computeSettlement` (STORED e LEGACY), `splitAmount`, `explainByRules`, `suggestSettlements`, `pendingSettlementMonths` e o indicador da Home tratam o sem conta como `MemberInput` comum (`id`, `ordinal` por `joinedAt,id`, `joinedOn`, `removedOn`). Nenhuma linha de `split/**` muda nesta fatia.
- **Centavos** (regras R1/R2 vigentes, só confirmadas por teste): a sobra vai ao pagador se ele participa com `bps > 0`, **também quando o pagador é sem conta**; com o sem conta a 0% (PROPORTIONAL) a sobra segue o maior resto entre os demais. Q-TL-U1: EQUAL inclui o cadastrado a partir de `joinedOn`; PROPORTIONAL fica `stale` até o Admin redefinir.
- Acerto desligado (`settlementEnabled=false`): Home sem linha/indicador, `/settlements` 409 `SETTLEMENT_DISABLED`, como hoje.
- `SettlementDTO.members[].member` já é `MemberRef` (com `unlinked`): a tela mostra o chip (§3.1). Texto neutro do SDD-011 (sem "deve").

### 3.4 Erros da 093a
| HTTP | Código | Quando | Mensagem |
| :-: | :-- | :-- | :-- |
| 422 | `UNLINKED_OWNER_ADMIN_ONLY` | não-ADMIN cria conta/cartão ou troca titular de cartão para sem conta | "Só um Administrador pode pôr como titular quem não tem acesso ao app." |
| 403 | `CARD_OWNER_ONLY` | não-ADMIN troca titular de cartão cujo titular é sem conta | "Só um Administrador pode trocar o titular deste cartão." |

### 3.5 Estados de UI da 093a
| Estado | Comportamento |
| :-- | :-- |
| Titular (ADMIN) | Opções sem conta normais, com o sufixo do selo |
| Titular (MEMBER) | Opções sem conta `disabled` + sufixo " (só Administrador)"; se o servidor ainda assim devolver 422, a mensagem aparece no campo |
| Cartão com titular sem conta, visto por MEMBER | Campo "Titular" somente leitura com dica "Só um Administrador pode trocar o titular." |
| Seletores vazios de sem conta | Nada muda (o sufixo só aparece quando há) |
| Cache | Sem chave nova; `familyKey` já invalida ao cadastrar (092b) |
| Acessibilidade | `UnlinkedBadge` com texto visível (não só cor); `<option>` com o texto no rótulo |

## 4. Fatia 093b: pagador, responsável, "Só meu" (4,5 pts)

### 4.1 `ownerStanding` com três estados (SEC-066b)
```ts
// src/modules/transacoes/ownership.ts
export type OwnerStanding = { ownerIsActor: boolean; ownerRemoved: boolean; ownerUnlinked: boolean };

export async function ownerStanding(tx: Tx, ctx: RequestContext, ownerId: string): Promise<OwnerStanding> {
  if (ownerId === ctx.memberId) return { ownerIsActor: true, ownerRemoved: false, ownerUnlinked: false };
  // SEC-066b: FOR SHARE conflita com o UPDATE do vínculo (aceite, 094b). Se o aceite já gravou e ainda não
  // confirmou, esta leitura espera e, em READ COMMITTED, relê a versão confirmada (userId preenchido).
  // A trava fica até o commit: o aceite não confirma no meio desta escrita.
  const [owner] = await tx.$queryRaw<Array<{ removedAt: Date | null; userId: string | null }>>`
    SELECT "removedAt", "userId" FROM members
    WHERE id = ${ownerId}::uuid AND "familyId" = ${ctx.familyId}::uuid
    FOR SHARE`;
  if (!owner) return { ownerIsActor: false, ownerRemoved: false, ownerUnlinked: false };
  if (owner.removedAt == null) {
    return { ownerIsActor: false, ownerRemoved: false, ownerUnlinked: owner.userId == null };
  }
  if (owner.userId == null) return { ownerIsActor: false, ownerRemoved: true, ownerUnlinked: false }; // SEC-058
  if (samePerson(owner.userId, ctx.userId)) return { ownerIsActor: true, ownerRemoved: false, ownerUnlinked: false };
  const returned = await tx.member.findFirst({
    where: { familyId: ctx.familyId, userId: owner.userId, removedAt: null }, // owner.userId != null garantido acima
    select: { id: true },
  });
  return { ownerIsActor: false, ownerRemoved: returned == null, ownerUnlinked: false };
}

/** Admin sobre dono ex-membro (D-GES-52/55) OU sobre dono sem conta ativo (ADR-033 §5, tutor). */
export const adminFullPower = (ctx: Pick<RequestContext, "role">, s: OwnerStanding): boolean =>
  ctx.role === "ADMIN" && (s.ownerRemoved || s.ownerUnlinked);
```
- `isAdminOverRemovedOwner` mantém o nome e o significado (só ex-membro); os pontos que hoje decidem `fullPower` passam a usar `adminFullPower` (lista na §4.6).
- **Ordem de travas**: `lockFamilySplit` (primeira, ADR-021) ➔ trava de conta/cartão (quando houver) ➔ `FOR SHARE` do dono. O aceite (094b) toma advisory lock da família e só faz `UPDATE members`; não toca `families` nem contas ⇒ sem ciclo (R2).

### 4.2 Exceção SEC-026c: Admin cria "Só meu" em nome do sem conta (Q-TL-U3, SEC-067)
```ts
// src/modules/transacoes/ownership.ts (substitui a versão síncrona)
export async function assertPersonalForSelf(
  tx: Tx,
  ctx: RequestContext,
  input: { isSharedExpense: boolean; payerMemberId: string },
  opts: { assistant?: unknown } = {},
): Promise<void> {
  if (input.isSharedExpense || input.payerMemberId === ctx.memberId) return;
  if (ctx.role === "ADMIN" && !opts.assistant) {
    const s = await ownerStanding(tx, ctx, input.payerMemberId); // FOR SHARE (SEC-066b)
    if (s.ownerUnlinked) return; // ADR-033 §5: só criação, só ADMIN, só dono ativo sem conta
  }
  throw forbidden(PERSONAL_ON_BEHALF_MESSAGE, PERSONAL_ON_BEHALF_CODE);
}

/** Previstas/séries: mesma exceção, só na criação (`current` ausente). */
export async function assertPlannedResultAllowed(
  tx: Tx, ctx: RequestContext, result: PlannedOwnershipRow, current?: PlannedOwnershipRow,
): Promise<void>; // corpo atual + o mesmo ramo da exceção SOMENTE quando `current === undefined`
```
| Ponto de criação | Chamada |
| :-- | :-- |
| `createExpenseCore` (`transacoes/service.ts:231`, à vista e cartão) | `await assertPersonalForSelf(tx, ctx, {...}, { assistant: opts.assistant })` |
| `installment-create.ts:55` (parcelado) | `await assertPersonalForSelf(tx, ctx, {...})` |
| `previstas/service.ts:145` (criar prevista) | `await assertPlannedResultAllowed(tx, ctx, result)` |
| `recurring-service.ts:200` (criar série) | idem |
| `previstas/service.ts:417` (baixa que **muda** o pagador do "Só meu") | `await assertPersonalForSelf(...)`: só alcança a exceção se o Admin baixar o "Só meu" de **outro dono** em nome do sem conta, o que já é barrado antes pelo `PERSONAL_STRUCTURE` (pagador da baixa ≠ dono e ator não é dono); a baixa normal mantém o pagador original (D-GES-50) e não passa por aqui |

**Fora da exceção (403 `PERSONAL_ON_BEHALF_FORBIDDEN`, como hoje):** MEMBER cria "Só meu" para o sem conta; ADMIN cria para membro **com** conta; ADMIN cria para **ex-membro** sem conta; MCP (`opts.assistant`); qualquer **edição** que mude o pagador/responsável de um "Só meu" (ramo `payerChanges` de `assertCanMakePersonal`; `assertPlannedResultAllowed` com `current`).

### 4.3 Pagador e responsável para ou de sem conta (SEC-059a, US-093 "só o lançador ou o Administrador")
```ts
// src/modules/transacoes/ownership.ts (regra pura, usada também pela UI)
export const UNLINKED_PAYER_CODE = "UNLINKED_PAYER_FORBIDDEN";
export const UNLINKED_PAYER_MESSAGE = "Apenas quem lançou ou o Administrador pode definir este pagador.";
export const UNLINKED_PAYER_SELF_MESSAGE =
  "Você não pode se colocar como pagador no lugar de quem não tem acesso ao app. Escolha outro membro.";

export function violatesUnlinkedPayerChange(
  viewer: { memberId: string; role?: "ADMIN" | "MEMBER" },
  current: { payerId: string; authorMemberId?: string | undefined },
  nextPayerId: string | undefined,
  flags: { currentUnlinked: boolean; nextUnlinked: boolean },
): false | "NOT_AUTHOR" | "ADMIN_SELF" {
  if (nextPayerId === undefined || nextPayerId === current.payerId) return false;
  if (!flags.currentUnlinked && !flags.nextUnlinked) return false;  // regras atuais (D-GES-47, SEC-025/026)
  if (current.authorMemberId === viewer.memberId) return false;     // Lanç: correção do que lançou
  if (viewer.role === "ADMIN") return nextPayerId === viewer.memberId ? "ADMIN_SELF" : false;
  return "NOT_AUTHOR";
}
```
- **Aplica-se a**: `updateTransaction` (`mutations.ts:256`, `kind === "EXPENSE"`, à vista e cartão, inclusive o pagador do plano parcelado se a edição o alterar), `updatePlanned` (`previstas/service.ts:245`, `responsibleMemberId`, `authorMemberId` da prevista), `updateSeries` (`recurring-service.ts:258`). Receita (`INCOME`) fica fora (não entra no acerto, TL-093-6).
- `currentUnlinked` = `standing.ownerUnlinked` do dono atual (§4.1, já lido para o `fullPower`); `nextUnlinked` = linha do novo pagador lida na transação (`select: { userId: true, removedAt: true }`, filtrada por `familyId`; o novo pagador já é validado como ativo hoje). Não precisa de `FOR SHARE`: sem conta ➔ com conta só torna a regra **menos** restritiva, e o caminho inverso é proibido pelo gatilho.
- **Posição**: logo depois de `violatesGonePayerLock` e **antes** do bloco de estrutura/`fullPower` em `assertCanMakePersonal` e `assertPlannedControllerLimits` (novo parâmetro `opts.unlinked: { currentUnlinked; nextUnlinked }`). `"NOT_AUTHOR"` ⇒ 403 `UNLINKED_PAYER_FORBIDDEN` + `UNLINKED_PAYER_MESSAGE`; `"ADMIN_SELF"` ⇒ 403 `UNLINKED_PAYER_FORBIDDEN` + `UNLINKED_PAYER_SELF_MESSAGE`.
- **Interação com as regras existentes** (nenhuma afrouxa):
  - Tornar "Só meu" a dividida paga pelo sem conta: `PERSONAL_CAPTURE` para todos que não são o dono (Admin incluso) ⇒ Q-TL-U2 garantida (o sem conta nunca é o ator).
  - Caminho em dois passos (pagador para si ➔ "Só meu"): o 1º passo é barrado para o Admin (`ADMIN_SELF`) e para qualquer não-autor (`NOT_AUTHOR`). Só o Lanç pode (correção do que lançou; ADR-033 §5, SEC-059a "exceto o próprio Lanç"): risco aceito pelo histórico (R5).
  - "Só meu" do sem conta: o Admin (tutor, `fullPower`) muda divisão/conta/"Pagar com", mas trocar o pagador para si dá `ADMIN_SELF` e para um terceiro dá `PERSONAL_ON_BEHALF_FORBIDDEN` (entregar). O pagador do "Só meu" do sem conta é, na prática, imutável para todos até ele assumir.
  - Ex-membro sem conta: `ownerRemoved` ⇒ `violatesGonePayerLock` (D-GES-59) vem antes e é mais restritivo.

### 4.4 Controle do "Só meu" com dono sem conta (matriz ADR-033 §5)
| Função | Mudança |
| :-- | :-- |
| `canWriteTransaction(row, viewer, ownerRemoved, ownerUnlinked = false)` | `if (ownerUnlinked && viewer.role === "ADMIN") return true;` antes da lista de controladores |
| `canWritePlanned(row, viewer, ownerRemoved, ownerUnlinked = false)` | idem |
| `canChangeStructure(ownerId, viewer, ownerRemoved, ownerUnlinked = false)` | `... \|\| ((ownerRemoved \|\| ownerUnlinked) && viewer.role === "ADMIN")` |
| `assertCanWriteTransaction` | depois do `ownerStanding`: `if (s.ownerUnlinked && ctx.role === "ADMIN") return;` (Lanç e DC seguem pelos ramos atuais) |
| `plannedWriteDecision` | idem |
| `deny(tx, ctx, controllers, { adminCan })` | o `select` traz `userId`; **remove da lista os controladores sem conta**; com `adminCan` (dono `ownerUnlinked`) acrescenta "um Administrador" ao fim: "Só Mariana e um Administrador podem alterar este lançamento." Lista vazia + `adminCan` ⇒ "Só um Administrador pode alterar este lançamento." |
| `mutations.ts:270-279`, `previstas/service.ts:247-255`, `:376`, `recurring-service.ts:259-266` | `fullPower = adminFullPower(ctx, standing) && isPersonal(row)`; passam `opts.unlinked` (§4.3) |

Depois do aceite (094b) o `ownerStanding` devolve `ownerUnlinked: false` e o tutor perde os poderes (regras normais; o próprio membro é o dono). Após a remoção do sem conta valem as de ex-membro.

### 4.5 Destino do acerto com credor sem conta (sem mudança)
Q-TL-93-1 = (c), decisão do usuário em 2026-10-31 (D-GES-66): o destino do acerto continua sendo qualquer conta da família, inclusive a de quem paga. **Não há** `SETTLEMENT_DESTINATION_IS_DEBTOR`, nem `findAccount` com `ownerMemberId`, nem filtro/pré-seleção no `settle-drawer`. SEC-059b: risco aceito pelo usuário. `CreateSettlementSchema` e o motor não mudam; desfazer acerto (A6) inalterado.

### 4.6 Contratos alterados (resumo para o Dev)
| Símbolo | Antes | Depois |
| :-- | :-- | :-- |
| `ownerStanding` | `{ ownerIsActor, ownerRemoved }`, `findFirst` | `OwnerStanding` com `ownerUnlinked`, `$queryRaw ... FOR SHARE` |
| `assertPersonalForSelf` | síncrona `(ctx, input)` | `async (tx, ctx, input, { assistant? })` |
| `assertPlannedResultAllowed` | síncrona `(ctx, result, current?)` | `async (tx, ctx, result, current?)` |
| `assertCanMakePersonal` / `assertPlannedControllerLimits` | `opts { fullPower, ownerIsActor, payerGone }` | `+ unlinked?: { currentUnlinked: boolean; nextUnlinked: boolean }` e `viewer.role` lido de `ctx` |
| `canWriteTransaction` / `canWritePlanned` / `canChangeStructure` | 3 parâmetros | 4º opcional `ownerUnlinked = false` (UI passa `payer.unlinked && !payer.removed`) |
| `deny` | `(tx, ctx, ids)` | `(tx, ctx, ids, { adminCan?: boolean })` |
| Erros novos | — | 403 `UNLINKED_PAYER_FORBIDDEN` (+ 093a: 422 `UNLINKED_OWNER_ADMIN_ONLY`) |

Nenhum schema Zod de entrada muda (`CreateTransactionSchema`, `UpdateTransactionSchema`, previstas, séries, `CreateSettlementSchema`, contas, cartões): as regras são de autorização no serviço.

### 4.7 Erros da 093b
| HTTP | Código | Quando | Mensagem (UI) |
| :-: | :-- | :-- | :-- |
| 403 | `UNLINKED_PAYER_FORBIDDEN` | não-autor/não-ADMIN troca pagador/responsável para ou de sem conta | "Apenas quem lançou ou o Administrador pode definir este pagador." |
| 403 | `UNLINKED_PAYER_FORBIDDEN` | ADMIN (não autor) se põe no lugar do sem conta | "Você não pode se colocar como pagador no lugar de quem não tem acesso ao app. Escolha outro membro." |
| 403 | `PERSONAL_ON_BEHALF_FORBIDDEN` | fora da exceção §4.2 | texto atual |
| 403 | `PERSONAL_OWNER_ONLY` | quem não controla escreve no "Só meu" do sem conta | "Só {nomes} e um Administrador podem alterar este lançamento." |

### 4.8 Estados de UI da 093b
| Tela | Estado | Comportamento |
| :-- | :-- | :-- |
| Nova despesa (`transaction-drawer.tsx`) | "Só meu" ligado, ator ADMIN | "Quem pagou?" lista **eu + ativos sem conta** (selo); `personal-self-payer-notice` muda para "Só meu de {nome}: só você, como Administrador, e quem lançar poderão alterá-lo." quando o escolhido é sem conta |
| | "Só meu" ligado, ator MEMBER | como hoje (só eu) |
| | Dividida | todos os ativos, inclusive sem conta (qualquer membro) |
| Editar lançamento / prevista / série | ator não é autor nem ADMIN e o pagador atual é sem conta | seletor de pagador/responsável `disabled` com a dica `UNLINKED_PAYER_MESSAGE` |
| | ator não é autor nem ADMIN, pagador atual com conta | opções sem conta `disabled` com a mesma dica |
| | ator ADMIN (não autor), pagador atual sem conta | a própria opção `disabled` com `UNLINKED_PAYER_SELF_MESSAGE`; em "Só meu", seletor `disabled` ("O pagador só muda quando {nome} entrar no app.") |
| | ator ADMIN sobre "Só meu" do sem conta | ações Editar/Excluir/Restaurar/Estornar e interruptor "Dividir"/conta/"Pagar com" habilitados (`canWriteTransaction`/`canChangeStructure` com `ownerUnlinked`) |
| | ator sem controle | ações ocultas como hoje; mensagem com "um Administrador" (§4.4) |
| | 422 do servidor | mensagem no campo "Conta de destino"; drawer aberto |
| Qualquer 403 inesperado (estado mudou: aceite concorrente) | toast com a mensagem do servidor e `invalidate` de `familyKey` + lista afetada |
| Responsivo | 375 e 1280 px; dicas abaixo do campo, nunca só em tooltip |

## 5. Impacto no acerto, rateio e centavos (as duas fatias)
- **Motores**: zero mudança. O sem conta é `MemberInput` por `id`; o crédito dele aparece em `balance` como o de qualquer membro (M4). `Σ saldo = 0`, `Σ cotas = total comum` e `Σ amount = valor` por lançamento (trigger `tx_split_integrity`) seguem válidos.
- **Rateio na criação** (STORED): `resolveRuleShares` inclui o sem conta se ele está presente na data (EQUAL) ou tem `bps > 0` (PROPORTIONAL). Pagador sem conta com `bps > 0` recebe a sobra (R2).
- **Edição de pagador** (R6 `rewriteSplitAmounts`): quando permitida (Lanç/Admin-terceiro), recalcula centavos com os mesmos `bps`; a sobra muda de dono junto com o pagador (comportamento vigente).
- **Registrar acerto**: sem mudança (§4.5); o credor sem conta aparece no acerto como membro comum.
- **Exemplos obrigatórios** (dois motores):

| Caso | Entrada | Esperado |
| :-- | :-- | :-- |
| U1 (US) | 300,00 dividida EQUAL, pagos por Ana, entre Mariana, Lucas, Ana | Ana +200,00; Mariana −100,00; Lucas −100,00; sugestões Mariana➔Ana 100, Lucas➔Ana 100 |
| U2 (sobra) | 100,00 EQUAL pagos por Ana (3 membros) | cotas Ana 33,34 / 33,33 / 33,33; Ana +66,66; demais −33,33 |
| U3 (0%) | 100,01 PROPORTIONAL Mariana 50 / Lucas 50 / Ana 0, pago por Ana | Ana sem linha de split; cotas 50,01 (Mariana, menor ordinal) / 50,00; Ana +100,01 |
| U4 (entrada) | EQUAL; despesa antes e depois do `joinedOn` de Ana | antes: 2 partes; depois: 3 partes; splits antigos intactos |
| U5 (acerto parcial) | U1 + Mariana registra 50,00 para Ana, destino conta de Ana | Ana +150, Mariana −50; destino livre (§4.5) |
| U6 (desligado) | `settlementEnabled=false` | Home sem linha de acerto com Ana; `/settlements` 409 |

## 6. Invariantes (para o código e o reteste da Segurança)
1. **I-1**: o Administrador nunca vira pagador/responsável de item cujo pagador/responsável é sem conta, salvo se ele for o autor (D-034-2). Vale em lançamento, cartão, parcela, prevista e série.
2. **I-2**: ninguém torna "Só meu" uma dividida paga pelo sem conta, nem entrega um "Só meu" a ele ou dele (Q-TL-U2, SEC-026c).
3. **I-3**: "Só meu" em nome de outro só nasce com `ctx.role = ADMIN`, dono ativo sem conta lido com `FOR SHARE` na mesma transação, fora do MCP (SEC-066b/067).
4. **I-4**: o tutor existe só enquanto o dono é ativo e sem conta; aceite ou remoção o desligam sem migração.
5. **I-5**: acerto com credor sem conta nunca tem como destino conta do devedor (mesmo vínculo ou mesma pessoa).
6. **I-6**: titular sem conta (conta ou cartão) só é definido por ADMIN.
7. **I-7**: nenhum motor de acerto, rateio ou centavo muda; o sem conta é um `Member` como os outros (ADR-033 §3).
8. **I-8**: comparações de pessoa só por `samePerson`; nenhum `where` com `userId` vindo de `members` sem guarda (SEC-058, teste estático do SDD-033 §8.1 continua valendo para o código novo).
9. **I-9**: o histórico (revisões, `CARD_OWNER_CHANGED`, autor) registra o **ator real**; o sem conta nunca é ator.

## 7. Guia de testes para o Dev & QA

### 7.1 Unidade (`tests/unit/`)
1. `familia/display-name.test.ts`: `memberOptionLabel` com e sem `unlinked`.
2. `transacoes/unlinked-payer.test.ts`: tabela-verdade de `violatesUnlinkedPayerChange` (autor/Admin/membro × atual sem conta/novo sem conta/nenhum × para si/para terceiro/igual) — 18 linhas mínimo.
3. `transacoes/ownership-pure.test.ts` (existente, estender): `canWriteTransaction`/`canWritePlanned`/`canChangeStructure` com `ownerUnlinked` (Admin sim, membro não, removido+unlinked segue regra de ex-membro); `personalWriteMessage` com "um Administrador".
4. `split/settlement.test.ts`: casos **U1..U4** nos dois motores (S1..S16 sem alteração de asserção).
5. `split/split-amount.test.ts`: U2 e U3 como vetores adicionais (V1..V10 intactos).
6. Estático (`tests/unit/meta/member-reads.test.ts`, estender): `assertPersonalForSelf(` e `assertPlannedResultAllowed(` só chamados com `await`; `ownerStanding` usa `FOR SHARE`; nenhuma chamada de `assertPersonalForSelf` em `src/modules/mcp/**` sem `assistant`.

### 7.2 Integração 093a (`tests/integration/us-093a-titular-e-seletores.int.test.ts`)
1. ADMIN cria conta e cartão com titular Ana (sem conta) ⇒ 201; `owner.unlinked: true` no DTO.
2. MEMBER cria conta/cartão com titular Ana ⇒ 422 `UNLINKED_OWNER_ADMIN_ONLY`, nada gravado.
3. Cartão de Ana: MEMBER troca titular ⇒ 403 `CARD_OWNER_ONLY`; ADMIN troca para Lucas ⇒ 200 + `CARD_OWNER_CHANGED` com ator ADMIN; Lucas (titular) passa seu cartão a Ana ⇒ 422 `UNLINKED_OWNER_ADMIN_ONLY`; ADMIN titular passa o próprio a Ana ⇒ 200.
4. Canário (ADR-018 §2): `ownerMemberId` de sem conta de **outra** família ⇒ 422 `INVALID_REFERENCE` (nunca 201).
5. Acerto: U1, U5 (só caminho permitido), U6 por API; `GET /settlements/:period` traz Ana com `unlinked: true`.
6. Harness (`tests/integration/us-093a-harness-acerto-sem-conta.int.test.ts`): `buildUniverse(seed, { unlinked: 2 })`, sementes 1..240: (a) LEGACY ➜ `migrateFamily` ➜ STORED com `diffSnapshots == []` (já existe na 092a; reexecutar como regressão); (b) para cada período, `Σ balance = 0` e toda sugestão envolvendo sem conta tem `amountInCents > 0` e ≤ |saldo|; (c) registrar acerto de cada sugestão com credor sem conta usando destino **não** do devedor ⇒ período fica BALANCED/SETTLED (prepara a 093b; até ela o destino não é validado).

### 7.3 Integração 093b (`tests/integration/us-093b-so-meu-e-pagador-sem-conta.int.test.ts`)
Família: Mariana (ADMIN), Lucas (MEMBER), Bia (MEMBER), Ana (sem conta), Edu (ex-membro sem conta), conta "Poupança Ana" (titular Ana). **Um teste por célula da matriz ADR-033 §5**, em lançamento à vista, cartão, prevista e série:
1. **Criar "Só meu" para Ana**: Mariana ⇒ 201 (autor Mariana, pagador Ana); Lucas ⇒ 403 `PERSONAL_ON_BEHALF_FORBIDDEN`; Mariana para Lucas (com conta) ⇒ 403; Mariana para Edu (ex-membro sem conta) ⇒ 403; parcelado e prevista/série idem; **MCP** `lancar_despesa` sempre em nome do ator (nenhum campo de pagador) e, chamando `createExpenseCore` com `assistant` e `payerMemberId = Ana`, 403 (SEC-067).
2. **Controle** do "Só meu" de Ana lançado por Mariana: Lucas edita/exclui ⇒ 403 com mensagem "Só Mariana e um Administrador podem alterar..." (sem "Ana"); Mariana edita/exclui/restaura/estorna ⇒ 200; Bia (outra ADMIN, se promovida no teste) edita e divide ⇒ 200 (tutor); "Só meu" de Ana lançado por Lucas na "Poupança Ana": Lucas (Lanç) edita ⇒ 200, Bia (MEMBER) ⇒ 403.
3. **Pagador** (dividida de 300 paga por Ana, lançada por Mariana): Lucas troca pagador para si ⇒ 403 `UNLINKED_PAYER_FORBIDDEN` (`NOT_AUTHOR`); Lucas troca para Bia ⇒ 403 `NOT_AUTHOR`; Bia como ADMIN (não autora) troca para si ⇒ 403 `ADMIN_SELF`; Bia ADMIN troca para Lucas ⇒ 200 (revisão com ator Bia); Mariana (autora) troca para si ⇒ 200. Dividida paga por Lucas lançada por Lucas: Bia (MEMBER) troca para Ana ⇒ 403; Lucas (autor) ⇒ 200. Mesmo conjunto para `responsibleMemberId` de prevista e série.
4. **Captura (Q-TL-U2)**: tornar "Só meu" a dividida paga por Ana ⇒ 403 `PERSONAL_OWNER_ONLY` para Mariana (ADMIN), Lucas e o autor não-dono; dois passos (ADMIN não autor: pagador para si) ⇒ barrado no 1º passo.
5. **Tutor sem assumir**: Admin no "Só meu" de Ana muda divisão e conta ⇒ 200; muda pagador para si ⇒ 403 `ADMIN_SELF`; para Lucas ⇒ 403 `PERSONAL_ON_BEHALF_FORBIDDEN`.
6. **Acerto (Q-TL-93-1 = (c))**: U1; Mariana (devedora) registra para Ana com destino conta de Mariana, "Poupança Ana" ou conta de Lucas (terceiro) ⇒ 201 nos três (sem validação nova; teste de caracterização do comportamento atual); credor com conta: regra antiga intacta.
7. **Concorrência (SEC-066b)**: com 2 conexões, T1 (aceite simulado: `set_config('app.link_member', id, true)` + `UPDATE members SET "userId"=..., "linkedAt"=now(), name=...`, sem commit) e T2 (Admin cria "Só meu" para Ana): T2 bloqueia no `FOR SHARE`; T1 confirma ⇒ T2 recebe 403 `PERSONAL_ON_BEHALF_FORBIDDEN`. Ordem inversa (T2 primeiro): T1 espera e, ao confirmar, o "Só meu" criado passa a ser de Ana com conta (comportamento desejado, ADR-033 §4.6). Sem deadlock em 50 repetições.
8. **Regressão R2/D-GES-59**: Edu (ex-membro sem conta) com outro sem conta ativo: pagador imutável para todos, Admin-ex com `fullPower`; mensagens antigas idênticas.
9. **Regressão completa obrigatória** (sem alterar asserções): toda a suíte do "Só meu" (`sec021*`, `sec025-026*`, `sec038*`, `sec042-046*`, `sec047-050*`, `d-ges-55*`, `d-ges-59*`, `us-084*`), `us-092a-*`, `us-092b-*`, `us-009-acerto`, `us-011-registrar-acerto`, `us-013b-mes-acertado`, `us-028-acerto-opcional`, `en002-*`, `tests/unit/split/*`, `lock-coverage`.

### 7.4 BDD / E2E (`tests/e2e/features/US-093-membro-sem-conta-atribuicao.feature` + steps; 1:1 com os 9 cenários da US; 375 e 1280 px)
| Cenário da US | Fatia | Observação |
| :-- | :-: | :-- |
| Conta com titular sem conta | 093a | selo no titular |
| Cartão com titular sem conta | 093a | idem |
| Despesa paga por quem ainda não tem conta | 093a | Extrato mostra "Ana" como pagadora; detalhe mostra autor "Mariana" |
| Membro sem conta entra no acerto | 093a | U1 na tela do Acerto |
| Acerto desligado não inclui ninguém | 093a | U6 |
| Prevista com responsável sem conta | 093a | |
| Filtro por quem pagou inclui o membro sem conta | 093a | opção "Ana · sem acesso ao app" |
| Só meu de membro sem conta é controlado por quem lançou | 093b | Lucas vê a mensagem; Mariana exclui |
| Pagador sem conta só pelo lançador ou Administrador | 093b | mensagem exata `UNLINKED_PAYER_MESSAGE` |

Mais (093b, fora da US): Admin no registrar acerto não vê a própria conta como destino para credor Ana.

## 8. Estimativa e fatiamento
| Fatia | Pts | Conteúdo | Pode ir à produção |
| :-- | :-: | :-- | :-- |
| 093a | **3** | Titular só ADMIN em conta/cartão + exceção de troca do cartão (1); selo/rótulo em ~10 telas (1); testes de acerto U1..U6, harness, BDD/E2E dos 7 cenários (1) | Sim, depois da 092b |
| 093b | **4,5** | `ownerStanding` 3 estados com `FOR SHARE` e tutor nos 6 consumidores (1,5); exceção SEC-026c em 5 pontos de criação + MCP (1); `UNLINKED_PAYER_FORBIDDEN` em lançamento/prevista/série + UI (1); matriz de testes, concorrência, E2E (1) | Sim, depois da 093a; **reteste da Segurança** antes do aceite do Gestor |
| **Total** | **7,5** | | |

## 9. Ordem de implementação (Dev)
1. 093a: `memberOptionLabel` + `UnlinkedBadge`; `ownerCandidate` e travas de titular; telas; testes §7.2; E2E dos 7 cenários.
2. 093b, testes primeiro (§7.3 vermelhos): `ownerStanding` ➔ `adminFullPower` ➔ `deny` ➔ `assertPersonalForSelf`/`assertPlannedResultAllowed` assíncronas (o `tsc` aponta os chamadores) ➔ `violatesUnlinkedPayerChange` nos 3 serviços ➔ `registerSettlement` ➔ UI §4.8.
3. Suíte inteira verde (unit + int + E2E).
4. Estado no mesmo commit: `estado/so-meu.md` (matriz com `ownerUnlinked`, exceção SEC-026c, `UNLINKED_PAYER_FORBIDDEN`), `estado/acerto-divisao.md` (A1/A2; M5 "sem conta é membro comum"), `estado/familia-convites-sessoes.md` (D-033-4 revogado pela 093b; titular só ADMIN).

## 10. Riscos (inclui migração)
| # | Risco | Mitigação |
| :-- | :-- | :-- |
| R1 | **Migração**: nenhuma de schema ou dados. Itens criados entre a 092b e a 093b com pagador sem conta (só dividida; "Só meu" era 403 pela D-033-4) continuam válidos e passam a obedecer à matriz nova no primeiro acesso | Nada a converter; reversão = reverter o código (o banco não muda). O "ponto sem volta" segue o do ADR-033 §2.1 (primeiro sem conta em produção), não esta fatia |
| R2 | `FOR SHARE` em `ownerStanding` aumenta travas de linha em `members` e pode esperar o aceite (094b); risco de deadlock se algum caminho futuro do aceite tocar `families`/contas | Ordem fixa (§4.1); o aceite só faz `UPDATE members`; teste de 50 repetições (§7.3.7); revisar quando o SDD da 094b sair |
| R3 | Mudança de assinatura (síncrona ➔ assíncrona; 4º parâmetro opcional) esquece um chamador ou a UI não passa `ownerUnlinked` | `tsc` aponta os síncronos; estático §7.1.6; UI coberta por E2E da matriz |
| R4 | Crédito em nome de quem não contesta: Lanç corrige o pagador para si e depois torna "Só meu" | Aceito pela SEC-059a ("exceto o próprio Lanç"); histórico registra o ator; SEC-059c (094b) mostra ao sem conta, no aceite, quantas alterações outros fizeram |
| R5 | Admin-tutor divide o "Só meu" do sem conta (cria dívida dos outros para ele) | Aceito pela SEC-067 (membros com conta veem e contestam pelo histórico) |
| R6 | Acerto: devedor registra para credor sem conta com destino em qualquer conta, inclusive a própria (SEC-059b) | **Risco aceito pelo usuário** (Q-TL-93-1 = (c), 2026-10-31, D-GES-66); mitigação: histórico do acerto e desfazer (A6) |
| R7 | Titular de cartão: membro com conta (não ADMIN) não consegue passar o próprio cartão ao filho sem conta, e o ADMIN não pode trocar o cartão alheio (`CARD_OWNER_ONLY`) | TL-093-4: aceito (caminho: membro arquiva e o ADMIN cria o cartão com titular sem conta); reavaliar se aparecer no uso real |
| R8 | Mensagens 403 citando "um Administrador" mudam textos esperados em testes antigos | Só quando o dono é sem conta; mensagens dos demais casos idênticas (§7.3.9) |

### Hipóteses (TL-093-1,2,3,5,6,8,9 ratificadas e TL-093-4 aceita pelo Gestor/usuário em D-GES-66; TL-093-7 removida)
| ID | Data | História | Lacuna / desvio | Hipótese adotada | Impacto se mudar |
| :-- | :-- | :-- | :-- | :-- | :-- |
| TL-093-1 | 2026-10-31 | US-093 | ADR-033 §6 punha "acerto" na 093a; o brief do Gestor põe pagador/acerto na 093b | 093a = acerto só exibido/provado (motor intacto); SEC-059b sem código (D-GES-66) | Nenhum (SEC-059b não gera código) |
| TL-093-2 | 2026-10-31 | US-093 | Pagador atual **com conta** (não autor) quer passar o crédito ao sem conta (só se prejudica) | **Recusado** (`NOT_AUTHOR`), literal à US ("só o lançador ou o Administrador") | Liberar: uma condição a mais em `violatesUnlinkedPayerChange` (0 pt) |
| TL-093-3 | 2026-10-31 | US-093b | SEC-066b admite `FOR SHARE` **ou** lock da família | `FOR SHARE` na linha do dono, sempre que o dono não é o ator (mais barato que serializar a família) | Lock da família: +0,5 pt e contenção maior |
| TL-093-4 | 2026-10-31 | US-093a | Troca de titular de cartão **para** sem conta | Só ADMIN e, além disso, a regra `CARD_OWNER_ONLY` (titular atual, ou ADMIN se o atual é sem conta) | Liberar ao titular atual não-ADMIN: 0 pt |
| TL-093-5 | 2026-10-31 | US-093a | Conta não troca de titular fora da remoção | Titular sem conta só na criação da conta (e na reatribuição da remoção, já ADMIN) | Troca de titular de conta é história própria |
| TL-093-6 | 2026-10-31 | US-093b | Receita com "Quem recebeu?" sem conta | Trava de pagador só para `EXPENSE`, prevista e série (receita não entra no acerto) | Estender à receita: 0 pt |
| TL-093-8 | 2026-10-31 | US-093a | Onde mostrar o selo | Seletores, filtros, Acerto, Regra, detalhe, titular/responsável; linhas de listas e relatórios só com o nome | Selo em toda linha: +0,5 pt |
| TL-093-9 | 2026-10-31 | US-093b | Texto do 403 quando o Admin tenta se pôr no lugar do sem conta | `UNLINKED_PAYER_SELF_MESSAGE` (§4.7); PO pode ajustar | Só texto |

### Perguntas ao usuário (regra financeira; registradas, não bloqueiam)
| ID | Pergunta | Recomendação do TL | Hipótese até a resposta | Impacto se mudar |
| :-- | :-- | :-- | :-- | :-- |
| Q-TL-93-1 | Quando alguém registra o acerto **para** quem não tem acesso ao app (ex.: "Mariana pagou R$ 100 à Ana"), para quais contas o dinheiro pode ir? (a) qualquer conta da família **exceto** a de quem paga; (b) só contas da própria Ana (e, se ela não tiver nenhuma, qualquer conta exceto a de quem paga); (c) qualquer conta, como hoje | **(a)**, que fecha o caso grave (a dívida some sem o dinheiro sair) e aceita os demais pelo histórico; a tela já sugere a conta da Ana | (c) | (b): +0,5 pt na 093b (lista de destino filtrada pelo credor); (c): reabre SEC-059b, exige aceite de risco do usuário |

**Respondida pelo usuário em 2026-10-31: opção (c), "qualquer conta, como hoje" (D-GES-66).** SEC-059b risco aceito; TL-093-7 removida.

## 11. Rastreabilidade
NEED-028 (RN-028.1, 028.4, 028.5; Q-U16) ➔ FLUXO-020 ➔ US-093 ➔ ADR-033 §3, §5, §6, §8.3-8.5 ➔ **SDD-034** ➔ TASK (Dev cria; 093a e 093b separadas) ➔ `tests/integration/us-093a-*`, `us-093b-*`, `tests/unit/transacoes/unlinked-payer.test.ts`, `tests/e2e/features/US-093-*`. Segurança: SEC-059a (SEC-059b risco aceito, D-GES-66), SEC-066b, SEC-067 (reteste após a 093b). Estado: [so-meu.md](../../estado/so-meu.md), [acerto-divisao.md](../../estado/acerto-divisao.md), [familia-convites-sessoes.md](../../estado/familia-convites-sessoes.md).
