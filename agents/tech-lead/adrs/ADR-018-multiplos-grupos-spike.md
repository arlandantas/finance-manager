# ADR-018: Spike de modelo — uma pessoa em mais de um grupo e conta privada dentro do grupo (EN-003)

## Status
Aceito como **diagnóstico e recomendação** (Tech Lead, 2026-10-04). **Sem implementação e sem mudança de comportamento** (aceite da EN-003). Responde P2 de [`pedidos-ao-tech-lead-r21-r3.md`](../../product-owner/backlog/pedidos-ao-tech-lead-r21-r3.md) (NEED-021, Q-F08, D-PO-02, D-PO-32). Evidência: leitura de `prisma/schema.prisma`, `src/lib/api/with-api.ts`, `src/modules/familia/**`, `src/lib/auth/session.ts`, SDD-000..009 e ADR-012/013, em 2026-10-04.

## 1. Diagnóstico: o vínculo usuário↔família é N:N?
**Estruturalmente sim; por regra, 1:1.** `Member` já é a **tabela de junção** `(userId, familyId, role, joinedAt)`, com identidade própria (`Member.id`) e todas as FKs do domínio apontando para `(familyId, memberId)` (autoria, pagador, titular, responsável). O que impõe "uma família por usuário" é **uma única restrição** e o código que a usa:

| Onde | O que assume "1 família por usuário" | Custo de relaxar |
| :-- | :-- | :-- |
| `schema.prisma`: `Member @@unique([userId])` (índice `members_userId_key`) | Impede o 2º vínculo do mesmo usuário. `@@unique([familyId, userId])` já existe e basta para "uma vez por família" | 1 migração (trocar por índice parcial `WHERE removedAt IS NULL`; já exigido pelo ADR-019/US-035) |
| `src/lib/api/with-api.ts:123` | `db.member.findUnique({ where: { userId } })` resolve o `RequestContext` (`memberId`, `familyId`, `role`) a partir **só do usuário** | Passar a resolver por **vínculo ativo da sessão** (ver §3) |
| `src/modules/familia/repo.ts:13` `findMembershipByUserId` (usada por `resolveAppEntry`, `/api/v1/me`, `(app)/layout.tsx`) | Devolve **um** vínculo; `MeDTO.membership` é singular | `MeDTO.memberships[]` + `activeMembershipId` |
| `src/modules/familia/service.ts:74` `createFamily` | `ALREADY_IN_FAMILY` se existe qualquer `Member` do usuário | Passar a ser "já é membro **desta** família" (não se aplica a uma família nova) |
| `src/modules/familia/invitations/service.ts:191` `acceptPendingInvitation` | Retorna `NONE` se o usuário já tem `Member` ⇒ **convite de uma 2ª família jamais é aceito** | Trocar o teste por "membro ativo **desta** família" |
| `invitations/repo.ts:21` (`DUPLICATE_MEMBER`) | Já é por `(familyId, user.email)`: **correto** como está | nenhum |
| `Session` (Auth.js, sessão em banco) | Não guarda família ativa; `ctx.familyId` é derivado do vínculo | Coluna `Session.activeMemberId` (FK composta) ou cookie assinado de família ativa |
| `IdempotencyRecord` (`UNIQUE(userId, key)`) | Escopo por usuário; chaves são UUID v4 por intenção ⇒ **sem colisão entre grupos** | nenhum |
| UI: cabeçalho com `familyName`, chaves de cache TanStack sem escopo de família, `QuickAddProvider`, preferências por usuário no navegador | Um grupo implícito | Seletor de grupo, `queryClient.clear()` ao trocar, chaves com `memberId` |
| Seed e fábricas (`makeFamily`) | 1 usuário por membro | Fábrica `makeUserInFamilies` |
| `ADR-012 §2` (`Member.userId UNIQUE`), `SDD-003 §5.6` (gate) | Texto normativo | Errata/novo ADR no momento da construção |

**Pessoa em dois grupos não vaza dados por construção do ledger**: `Transaction`, `BankAccount`, `CreditCard`, `PlannedExpense`, `SplitRuleVersion` etc. têm `familyId` com **FK composta** `(familyId, id)`; o mesmo usuário em dois grupos tem **dois `Member`** com ids distintos, e `ctx.familyId` define a única família lida. Os convites são por `(familyId, email)`.

## 2. Isolamento por grupo: o que já cobre e o que falta
**Cobre hoje** (ADR-013): (1) a API **nunca** recebe `familyId`; (2) `makeRepos` exige `familyId` em todo método; (3) FKs compostas (uma linha não aponta para pai de outra família); (4) recurso alheio ⇒ `404`; (5) teste "isolamento" obrigatório por recurso (SDD-000 §9.4).
**Lacunas para N grupos**: (a) **17 pontos de SQL cru** (`$queryRaw`/`$executeRaw` em `previstas/repo`, `transacoes/extrato`, `categorias/repo`, `contas/ledger-queries`, `cartoes/*`, `health`) dependem de disciplina (`t."familyId" = $1` + teste de lint); (b) **não há RLS** (ADR-013 §4 adiou); (c) nada impede, por esquema, uma tabela futura com `familyId` **sem** FK composta.
**Testes que cobririam o 2º grupo** (propor já, custo ~1 ponto, independem do produto): 
1. **Estrutural** (integração): consulta `information_schema`/`pg_constraint` falha se alguma tabela com coluna `familyId` (exceto `families`) **não** tiver FK composta `(familyId, …)` para o pai de domínio.
2. **Canário** (integração): semear duas famílias, marcar **todas** as strings da família B com `CANARY-B-<n>` e varrer **toda** rota `GET /api/v1/**` (descoberta por glob de `route.ts`, 41 hoje) autenticado como A, com ids de B em parâmetros: o corpo **nunca** contém `CANARY-B`; mutações com ids de B ⇒ `404`/`INVALID_REFERENCE`.
3. **Mesmo usuário em duas famílias** (só quando o recurso existir): o canário roda com um usuário membro de A **e** B, alternando o grupo ativo.
4. **Lint de SQL**: teste que percorre os `Prisma.sql` gerados e exige `"familyId"` (já existe para o extrato; estender aos 17 pontos).

**RLS**: recomendado **no momento em que (a) for construída**: `SET LOCAL app.family_id` por transação + política `familyId = current_setting('app.family_id')::uuid` nas tabelas de domínio; é a única defesa que cobre SQL cru esquecido. Custo ≈ 5 pontos (pool/Prisma, `withApi` abre a transação e define a variável, testes). Não é necessário para o modelo atual.

## 3. Custo estimado (pontos Fibonacci; não entra no backlog sem decisão do Gestor)

### (a) Uma pessoa em mais de um grupo, com troca de grupo ativo — **13**
| Parte | Pts |
| :-- | :-: |
| Migração: índice parcial no lugar de `UNIQUE(userId)` (já feito pela US-035/ADR-019) + `Session.activeMemberId` | 2 |
| Núcleo: `resolveMembership(userId, sessionActive)` (uma função), `withApi`, `resolveAppEntry`, `/api/v1/me` (`memberships[]`), `POST /api/v1/me/active-member` | 3 |
| Convites e onboarding: aceitar convite de 2ª família, "Criar outra família", mensagens `ALREADY_IN_FAMILY` | 2 |
| UI: seletor de grupo no cabeçalho, `queryClient.clear()` ao trocar, rota raiz pós-troca, avisos | 3 |
| Testes: canário com usuário em dois grupos, E2E de troca, regressão geral | 3 |
**Risco principal**: dado de um grupo aparecer em cache do outro no cliente (mitigação: reset de cache + chaves com `memberId`). Sem mudança em ledger, acerto ou faturas.

### (b) Conta privada dentro do grupo (só o titular vê; opção de entrar no acerto) — **13 (só titular vê) a 21 (com acerto opcional e totais "meus × da família")**
- Modelo: `BankAccount.visibility {FAMILY, PRIVATE}` e `CreditCard.visibility` (titular já existe: `ownerMemberId`). Visibilidade de uma `Transaction` é **derivada** da conta/cartão (`accountId`/`cardId`); transferência entre privada e comum mostra para os demais apenas a perna visível.
- **Todas** as leituras passam por um predicado único `visibleTo(memberId)` (Extrato lista/totais/busca, detalhe `GET /transactions/:id` ⇒ `404` para não titular, saldos e Home, Resumo do Mês, `byMember`, Análise, previstas e sugestão de conta de origem, faturas e limite, acerto). Com a disciplina do predicado único (SDD-010 §1), é **uma** costura, mas toca todas as consultas já escritas: por isso 13.
- **Acerto**: despesa "dividida" numa conta privada **expõe** valor e descrição aos demais na lista do acerto ⇒ decisão de produto (opt-in por conta, `includeInSettlement`, e o que os outros veem). +5.
- **Totais**: família × "meus" (Resumo do Mês mostraria dois números) +3.
- **Impacto em D-PO-02** ("todos veem tudo"): ela deixa de valer **para contas marcadas privadas**; `US-020` (permissões granulares) é o superconjunto. **Impacto em "ocultar valores"**: nenhum (é privacidade de exibição local, não de acesso). **Impacto em US-035** (remover membro): conta privada de ex-membro precisa de regra de titularidade/arquivo. **Impacto em US-032**: arquivar conta privada só pelo titular.
- **Risco principal**: vazamento por consulta esquecida (mitigação: predicado único + teste canário com conta privada + RLS opcional por `visibleTo`).

## 4. Recomendação
1. **Não construir agora** (concordo com Q-F08: sem demanda concreta). Os custos acima (13 e 13–21) são **moderados e sem retrabalho** se as costuras abaixo forem feitas **dentro do trabalho já previsto**; construir só com evidência de uso.
2. **Preparar já, a custo ≈ 0** (todas dentro de histórias existentes):
   - **R2.1 / US-035 (ADR-019)**: trocar `UNIQUE(userId)` por índice **parcial** (`WHERE removedAt IS NULL`) e centralizar a leitura do vínculo em **uma** função `findActiveMembership(userId, db)` (hoje há 4 chamadas diretas a `member.findUnique({ where: { userId } })`).
   - **R2.1 / SDD-010**: um **único predicado de leitura do ledger** (`ledgerPeriodWhere` ⇒ evolui para `ledgerReadWhere`) com o gancho `visibleTo` retornando `TRUE` (no-op). Evita que as consultas de Resumo/Análise nasçam fora do ponto único.
   - **R2.1**: **teste estrutural e canário** (§2, itens 1 e 2), ~1 ponto, sem afetar a estimativa das histórias.
   - **R3**: toda tabela nova leva `familyId` + FK composta (tags, planos de parcelamento, rateio por lançamento já seguem); **proibido** criar unicidade global por `userId` fora de `Member`/`Session`.
   - **Cliente**: `MeDTO` mantém `membership` singular, mas o cache usa `["me"]` e há um único ponto (`QueryClient`) para resetar na troca; preferências locais já são por usuário (SDD-010).
3. **Ordem se um dia for construído**: (a) primeiro (13), depois RLS (5), depois (b) (13..21). A necessidade que o Stakeholder considera mais provável é a (b); ela **não** depende de (a).
4. **Pergunta ao Stakeholder (não bloqueante)**: se (b) vier, o que os demais veem de uma despesa dividida paga numa conta privada (valor? descrição? só o rateio?). Registrada na seção de decisões do Stakeholder pelo Gestor se for o caso.

## Consequências
Nenhuma mudança de comportamento. O ADR-012 §2 e o SDD-003 §5.6 ganham errata quando a US-035 for especificada (SDD-012 §5). Estimativas (a) = 13 e (b) = 13..21 ficam registradas para o Gestor.
