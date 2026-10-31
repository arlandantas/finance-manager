# SDD-033: Membro sem conta: modelo/migração (US-092a) e cadastro (US-092b)

- **História**: [US-092](../../product-owner/backlog/stories/US-092-cadastrar-membro-sem-conta.md) · **Necessidade**: [NEED-028](../../stakeholder/needs/NEED-028-membro-sem-conta-ativa-e-convite-posterior.md) (Q-U15, Q-U17) · **Fluxo**: [FLUXO-020](../../product-owner/flows/FLUXO-020-membro-sem-conta-e-convite-posterior.md) §2.1-2.2 · **ADR**: [ADR-033](../adrs/ADR-033-membro-sem-conta-e-convite-vinculado.md) (Aceito, condições da revisão da Segurança incorporadas) · **Segurança**: revisão de 2026-10-30 (SEC-058..068; relatório em `agents/security/relatorios/`) · **Decisões**: Q-TL-U1..U5 (usuário, 2026-10-30, D-GES-63) · D-PO-103
- **Status**: **SDD pronto, aprovado para Dev** (092a pode ir à produção sozinha; 092b depois dela) · **Autor**: Agente Tech Lead · **Data**: 2026-10-30
- **Estimativa (TL)**: **5 pts** = 092a **3** + 092b **2** (confirma o ADR-033 §6). **Executor**: Dev & QA, modelo **Sonnet** (092a toca o modelo de membro: revisão final do TL/Opus no diff da migração e do gatilho).
- **Numeração**: SDD-030..032 ficam reservados aos SDDs das US-089/090/091 (TL-2, em paralelo); este usa o número do ADR-033.
- **Próximos SDDs (fora deste)**: **093a** (seletores com selo, filtros, titular de conta/cartão só ADMIN, acerto), **093b** (matriz "Só meu" ADR-033 §5, `ownerUnlinked`, exceção SEC-026c com os limites SEC-066b/067, pagador e acerto SEC-059), **094a** (convite vinculado `POST /members/{id}/invitations`, guardas §4 1-6, `INVITATION_RESENT` sem e-mail SEC-061), **094b** (aceite que assume, nome escolhido ADR-033 §2.2, prévia com contagens, propriedade de reconciliação, SEC-062(1,2)/063/064/066a), **095** (editar nome/e-mail, `MEMBER_UPDATED`, polimento da remoção).
- **Restrição**: nenhum motor de acerto (`src/modules/split/**`) muda; nenhuma linha de ledger é reescrita; nenhuma migração de dados. Regressão S1..S16 e V1..V10 intacta.

## 1. Verificação no código (o código vence a doc)
| Achado | Consequência |
| :-- | :-- |
| `members.userId` é `NOT NULL` e `Member` **não tem nome**: o nome vem de `m.user.name ?? localPart(m.user.email)` em **~32 linhas** (`grep "user.name ??\|localPart("`) e `m.user.*` em **~76** leituras (`contas/service.memberRef`, `cartoes/invoice-service.memberRefOf`, `familia/{service,manage,removal}`, `previstas/service`, `privacidade/{export,delete-account}`, `ia/consent`, `analise-ia/*`, `categorias/repo`, telas `(app)/layout`, `(app)/page`, `perfil`, `onboarding`). | `user` vira `User \| null` no Prisma: o TypeScript aponta todas. Todas passam por `memberDisplayName` (§3.2). |
| `ownerStanding` (`transacoes/ownership.ts:118`) faz `findFirst({ familyId, userId: owner.userId, removedAt: null })`. Com `owner.userId = null` o Prisma gera `IS NULL` e acha **qualquer cadastro ativo** ⇒ ex-membro sem conta vira "voltou" (perde a trava D-GES-59 e o Admin-ex). | **Correção obrigatória na 092a** (§3.4) + teste de regressão R2. |
| `privacidade/export.ts:122-124` e `analise-ia/suggestions.ts:67-69` montam `Set` de `userId` ativos sem filtrar `null`: um cadastro ativo põe `null` no conjunto e o ex-membro sem conta deixa de ser `gone`/`removed` ⇒ observação de dividida de ex-membro alheio vazaria (SEC-050) e o "Só meu" dele seria tratado como de dono ativo nas sugestões. O TypeScript **não** acusa (`Set.has(null)`). | Mesma correção (§3.4, SEC-058). `memberRefsWithReturn` já filtra `m.userId` (ok). |
| `endUserSessions(db, userId)` (`lib/auth/session.ts:104`) e o `session.deleteMany` do `changeRole` recebem `userId` de linha de `members`: com `undefined` o Prisma **ignora o filtro** e encerraria as sessões de todos os usuários. | Guarda explícita (§3.4, SEC-058). |
| `registerSettlement` (`split/service.ts:445`) aceita qualquer conta da família como destino. | Restrição com credor sem conta é da 093a (SEC-059b), listada nos próximos SDDs. |
| `familia/removal.ts`: `blockersOf` conta `active.length <= 1` ⇒ ONLY_MEMBER; `endUserSessions(tx, target.userId)`; `revokeMemberGrants`. `privacidade/delete-account.ts:151` (`SOLE_MEMBER`) e `delete-family.ts:61-64` (`HAS_OTHER_MEMBERS`) contam todos os ativos. | Contagens passam a **só ativos com conta** (§3.5); remoção de sem conta pula sessões/concessões e apaga o e-mail. |
| `familia/manage.changeRole` encerra `session.deleteMany({ userId: target.userId })` e não conhece "sem conta". | 422 `UNLINKED_MEMBER_ROLE` antes de tudo (§3.5); a CHECK do banco é a rede. |
| `tests/support/split-universe.ts:71-74` e fixtures alteram `joinedAt` com `UPDATE` depois do insert. | O gatilho só congela `joinedAt` **no UPDATE de vínculo** (ADR-033 §2.5, ajuste deste SDD). |
| `createInvitation` checa `repo.memberWithEmail(email)` (membro ativo **com conta**) e o índice parcial de pendentes; não toma o lock da família. | 092b acrescenta a guarda `EMAIL_BELONGS_TO_UNLINKED_MEMBER` e o `lockFamilyAdmins` (§4.4). |
| `MemberDTO.email: string` é mostrado a todos os membros (e-mail de quem tem conta). | Sem conta: `email: null` para todos; `pendingEmail` só para ADMIN (§4.2). |
| `User.name` é reescrito pelo Google a cada login (`profileUpdates`, `lib/auth/config.ts`). | O nome escolhido no aceite (094b) vive em `members.name`, não em `User.name` (ADR-033 §2.2). Na 092a já: excluir conta zera `members.name` da pessoa. |
| `FAMILY_TABLES_DELETE_ORDER` (`delete-family.ts`) já apaga `invitations` antes de `members`. | FK nova `invitations → members` não muda a ordem; o teste de `information_schema` confere. |
| `tests/support/pii.ts` (`findResidue`) varre todas as colunas texto do `information_schema`. | `members.name`/`pendingEmail` entram sozinhas no reteste de LGPD. |

## 2. Decisões
| ID | Decisão |
| :-- | :-- |
| D-033-1 | **092a = só expand + leitura segura.** Todo o schema do ADR-033 §2 (inclusive `invitations.memberId` e os 3 valores do enum) sobe na 092a, numa migração idempotente sem dados. O código antigo nunca grava `NULL`, então a migração pode ir à produção antes do código. |
| D-033-2 | `memberDisplayName` e `memberFirstName` em **um único módulo** `src/modules/familia/display-name.ts`; nenhuma outra leitura de `user.name`/`localPart` para nome de membro (verificação estática §8.1). |
| D-033-3 | `MemberRef` ganha `unlinked: true` (opcional, aditivo); nunca `pendingEmail`. Os seletores existentes passam a listar o sem conta automaticamente (leem membros ativos); o selo visual nos seletores e filtros é da 093a, o selo na tela Família é da 092b. |
| D-033-4 | Até a 093b, um dono sem conta **ativo** é tratado como "outro membro ativo" pelo `ownerStanding` (`ownerIsActor=false, ownerRemoved=false`): só DC/Lanç controlam, o Administrador não tem poder de tutor, "Só meu" em nome dele dá `PERSONAL_ON_BEHALF_FORBIDDEN`. É o comportamento mais restritivo; a 093b abre a exceção do Admin. |
| D-033-5 | Cadastro (`POST /members`) só ADMIN, sob `lockFamilyAdmins(needAdmin=true)`, com `Idempotency-Key`. Unicidade de nome e e-mail checada **dentro do lock** (índice não alcança `User.name`/`User.email`); o índice `members_family_pending_email_uq` é a rede de concorrência. |
| D-033-6 | Nome do cadastro = **rótulo provisório** (Q-TL-U4 revisada): 2..60, aparado, espaços colapsados, único entre ativos sem caixa/acentos. Nesta fatia não há edição (US-095) nem aceite (094b). |
| D-033-7 | Q-TL-U1: EQUAL inclui o cadastrado nas despesas **novas** (motor STORED materializa o split na criação); o drawer avisa. Nenhuma pergunta "Entra na divisão?". |
| D-033-8 | Q-TL-U5 (Segurança concorda e amplia, SEC-061/068): a remoção de sem conta anonimiza o e-mail de **todos** os convites do cadastro (`invitations.memberId`), já na 092a (no-op até a 094a criar convites vinculados). |
| D-033-9 | Eventos: só `MEMBER_CREATED` nesta fatia, `changes: { hasEmail: boolean }` (nunca nome nem e-mail). `MEMBER_UPDATED`/`MEMBER_LINKED` existem no enum, sem uso até 095/094b. |

## 3. Fatia 092a: modelo, migração e leitura segura (3 pts)

### 3.1 Migrações (`prisma/migrations/`, SQL cru onde o Prisma não alcança)
Duas migrações (o `ADD VALUE` de enum não roda em transação com uso do valor):

**`20261030010000_us092_enum_member_events`**
```sql
ALTER TYPE "FamilyEventType" ADD VALUE IF NOT EXISTS 'MEMBER_CREATED';
ALTER TYPE "FamilyEventType" ADD VALUE IF NOT EXISTS 'MEMBER_UPDATED';
ALTER TYPE "FamilyEventType" ADD VALUE IF NOT EXISTS 'MEMBER_LINKED';
```

**`20261030010100_us092_unlinked_member`**
```sql
-- 1. vínculo pode existir sem usuário (só metadado)
ALTER TABLE members ALTER COLUMN "userId" DROP NOT NULL;
-- 2. colunas novas, nulas, sem default (instantâneo)
ALTER TABLE members
  ADD COLUMN name text,
  ADD COLUMN "pendingEmail" text,
  ADD COLUMN "linkedAt" timestamptz(3),
  ADD COLUMN "createdByMemberId" uuid;
ALTER TABLE members ADD CONSTRAINT members_created_by_fk
  FOREIGN KEY ("familyId", "createdByMemberId") REFERENCES members("familyId", id) ON DELETE RESTRICT NOT VALID;
-- 3. CHECKs (todas as linhas atuais têm userId ⇒ passam)
ALTER TABLE members ADD CONSTRAINT members_unlinked_has_name_chk
  CHECK ("userId" IS NOT NULL OR name IS NOT NULL) NOT VALID;
ALTER TABLE members ADD CONSTRAINT members_unlinked_is_member_chk
  CHECK ("userId" IS NOT NULL OR role = 'MEMBER') NOT VALID;
ALTER TABLE members ADD CONSTRAINT members_pending_email_chk
  CHECK ("pendingEmail" IS NULL OR ("userId" IS NULL AND "removedAt" IS NULL)) NOT VALID;
ALTER TABLE members ADD CONSTRAINT members_name_len_chk
  CHECK (name IS NULL OR char_length(name) BETWEEN 2 AND 60) NOT VALID;
ALTER TABLE members ADD CONSTRAINT members_pending_email_lower_chk
  CHECK ("pendingEmail" IS NULL OR "pendingEmail" = lower(btrim("pendingEmail"))) NOT VALID;
ALTER TABLE members VALIDATE CONSTRAINT members_created_by_fk;
ALTER TABLE members VALIDATE CONSTRAINT members_unlinked_has_name_chk;
ALTER TABLE members VALIDATE CONSTRAINT members_unlinked_is_member_chk;
ALTER TABLE members VALIDATE CONSTRAINT members_pending_email_chk;
ALTER TABLE members VALIDATE CONSTRAINT members_name_len_chk;
ALTER TABLE members VALIDATE CONSTRAINT members_pending_email_lower_chk;
CREATE UNIQUE INDEX members_family_pending_email_uq
  ON members ("familyId", "pendingEmail") WHERE "pendingEmail" IS NOT NULL;
-- 4. gatilho do vínculo (padrão SEC-036: search_path fixo; SEC-065: só IS DISTINCT FROM / IS NULL)
CREATE OR REPLACE FUNCTION members_link_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW."familyId" IS DISTINCT FROM OLD."familyId"
     OR NEW."createdByMemberId" IS DISTINCT FROM OLD."createdByMemberId" THEN
    RAISE EXCEPTION 'members: id/familyId/createdByMemberId imutáveis' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."linkedAt" IS NOT NULL AND NEW."linkedAt" IS DISTINCT FROM OLD."linkedAt" THEN
    RAISE EXCEPTION 'members: linkedAt imutável' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."userId" IS NOT NULL AND NEW."userId" IS DISTINCT FROM OLD."userId" THEN
    RAISE EXCEPTION 'members: userId não troca nem volta a NULL' USING ERRCODE = 'check_violation';
  END IF;
  IF OLD."userId" IS NULL AND NEW."userId" IS NOT NULL THEN       -- UPDATE de vínculo (094b)
    -- SEC-065: só a transação do aceite liga a GUC com o id deste membro
    IF coalesce(current_setting('app.link_member', true), '') IS DISTINCT FROM OLD.id::text THEN
      RAISE EXCEPTION 'members: vínculo fora do aceite' USING ERRCODE = 'check_violation';
    END IF;
    IF OLD."removedAt" IS NOT NULL OR NEW."removedAt" IS NOT NULL
       OR NEW."pendingEmail" IS NOT NULL OR NEW."linkedAt" IS NULL OR NEW.name IS NULL
       OR NEW."joinedAt" IS DISTINCT FROM OLD."joinedAt" THEN
      RAISE EXCEPTION 'members: vínculo inválido' USING ERRCODE = 'check_violation';
    END IF;
  ELSIF NEW."linkedAt" IS DISTINCT FROM OLD."linkedAt" THEN
    RAISE EXCEPTION 'members: linkedAt só no vínculo' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER members_link_guard BEFORE UPDATE ON members
  FOR EACH ROW EXECUTE FUNCTION members_link_guard();
-- 5. convite vinculado (uso a partir da 094a)
ALTER TABLE invitations ADD COLUMN "memberId" uuid;
ALTER TABLE invitations ADD CONSTRAINT invitations_member_fk
  FOREIGN KEY ("familyId", "memberId") REFERENCES members("familyId", id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX invitations_member_pending_uq
  ON invitations ("memberId") WHERE status = 'PENDING' AND "memberId" IS NOT NULL;
```
- **Prisma (`schema.prisma`)**: `userId String? @db.Uuid`, `user User? @relation(...)`, `name String?`, `pendingEmail String?`, `linkedAt DateTime? @db.Timestamptz(3)`, `createdByMemberId String? @db.Uuid`; `Invitation.memberId String? @db.Uuid` (relação composta opcional com `Member`); enum com os 3 valores. Comentários apontando os CHECKs/gatilho em SQL cru.
- **Reversão** (documentar no cabeçalho da migração): até existir o primeiro sem conta, `DROP TRIGGER`, `DROP CONSTRAINT`, `DROP COLUMN` e `SET NOT NULL` desfazem. Depois, só removendo/vinculando os cadastros (ponto sem volta, ADR-033 §2.1). Valores de enum não se removem (inofensivos).
- `members_name_len_chk` e `members_pending_email_lower_chk` são acréscimos deste SDD ao ADR (defesa em profundidade da validação Zod).
- **Teste da SEC-036** (`tests/integration/sec036-travas.int.test.ts`): trocar a lista fixa de 8 funções por **todas** as funções `plpgsql` do schema `public` (`pg_proc` ⨝ `pg_language`), exigindo `search_path=pg_catalog, public` em `proconfig` (SEC-065).

### 3.2 Nome exibido (`src/modules/familia/display-name.ts`, novo)
```ts
import { localPart } from "@/lib/auth/dev-login-guard";

export type MemberNameSource = {
  name: string | null;                                   // members.name (rótulo do cadastro ou nome escolhido no aceite)
  user: { name: string | null; email: string; deletedAt?: Date | null } | null;
};

/** Nome do membro em toda tela, relatório, exportação, MCP e evento (ADR-033 §2.3 e §2.2). */
export function memberDisplayName(m: MemberNameSource): string {
  if (m.user?.deletedAt) return m.user.name ?? DELETED_ACCOUNT_NAME; // conta excluída: nunca o nome antigo
  return m.name ?? m.user?.name ?? (m.user ? localPart(m.user.email) : "Membro");
}
export const memberFirstName = (m: MemberNameSource): string =>
  memberDisplayName(m).split(" ")[0] as string;

/** Saneamento (SEC-063b): NFKC, sem invisíveis/controle/bidi, espaços colapsados. É o valor gravado. */
export function sanitizeMemberName(s: string): string {
  return s.normalize("NFKC").replace(/[\p{Cf}\p{Cc}]/gu, "").replace(/\s+/g, " ").trim();
}
/** Chave de unicidade: saneado, sem acentos, sem caixa. */
export function nameKey(s: string): string {
  return sanitizeMemberName(s).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
}
/** Termos do sistema que não podem ser nome de membro (422 NAME_RESERVED). */
export const RESERVED_NAME_KEYS = new Set([
  "conta excluida", "ex-membro", "ex membro", "administrador", "sem acesso ao app", "assistente", "membro", "voce",
]);
```
- `DELETED_ACCOUNT_NAME` vem de `privacidade/delete-account.ts` (mover para `familia/display-name.ts` se der ciclo de import).
- **Substituir** todas as leituras de nome de membro (§1) por `memberDisplayName`/`memberFirstName`. `memberRef` (`contas/service.ts`) e `memberRefOf` (`cartoes/invoice-service.ts`) passam a receber `MemberNameSource & { id; removedAt?; user: { image } | null }` e emitem `image: m.user?.image ?? null`, `unlinked` quando `m.user == null`. Os `select`/`include` de `user` precisam trazer também `name` do membro (`select: { name: true, user: { select: { name, email, image, deletedAt } } }`).
- Nome de **usuário** (sessão, `/perfil`, `MeDTO.user`, e-mails do Auth.js) continua `User.name`: não é nome de membro e não muda.

### 3.3 Contratos comuns (`src/lib/schemas.ts`, aditivo)
```ts
export const memberRefSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  image: z.string().nullable(),
  removed: z.literal(true).optional(),
  deleted: z.literal(true).optional(),
  activeId: uuidSchema.optional(),
  unlinked: z.literal(true).optional(), // ADR-033: membro sem conta (selo "Sem acesso ao app"); nunca pendingEmail
});
```
`MemberRef.unlinked` é derivado de `userId == null` na leitura; um ex-membro removido sem conta leva `removed: true` **e** `unlinked: true`.

### 3.4 "Mesma pessoa" nunca compara `NULL` (bug latente R2)
```ts
// transacoes/ownership.ts
export async function ownerStanding(tx, ctx, ownerId) {
  if (ownerId === ctx.memberId) return { ownerIsActor: true, ownerRemoved: false };
  const owner = await tx.member.findFirst({ where: { id: ownerId, familyId: ctx.familyId }, select: { removedAt: true, userId: true } });
  if (!owner || owner.removedAt == null) return { ownerIsActor: false, ownerRemoved: false };
  if (owner.userId == null) return { ownerIsActor: false, ownerRemoved: true };   // sem conta nunca "volta"
  if (owner.userId === ctx.userId) return { ownerIsActor: true, ownerRemoved: false };
  const returned = await tx.member.findFirst({ where: { familyId: ctx.familyId, userId: owner.userId, removedAt: null }, select: { id: true } });
  return { ownerIsActor: false, ownerRemoved: returned == null };
}
```
- Helper único `samePerson(a: string | null | undefined, b: string | null | undefined): boolean` (`familia/display-name.ts` ou `transacoes/ownership.ts`): `a != null && b != null && a === b`. Toda comparação de pessoa por `userId` usa ele.
- `privacidade/export.ts` **e** `analise-ia/suggestions.ts` (SEC-058): `activeUsers` = `members.filter(m => m.removedAt === null && m.userId != null)`; `gone`/`removed` = removidos com `m.userId == null || !activeUsers.has(m.userId)`; `mine` por `samePerson(m.userId, ctx.userId)`.
- **Regra contra `undefined` (SEC-058.3):** `endUserSessions` começa com `if (!userId) return 0;`; `removeMember` não chama `endUserSessions`/`revokeMemberGrants` para alvo sem conta; `changeRole` dá 422 `UNLINKED_MEMBER_ROLE` antes de qualquer escrita; proibido `?? undefined` ou `!` em `userId` vindo de `members`.
- Regra geral (comentário no código e verificação §8.1): **toda** consulta `where: { userId: X }` com `X` vindo de uma linha de `members` exige `X != null` antes. `findActiveMembership`/`findPendingRemovalNotice` recebem `userId` da sessão (nunca nulo): sem mudança. `analise-ia/suggestions.ts:71` compara com `ctx.userId` (não nulo): ok.

### 3.5 Contagens, papéis, remoção mínima e exclusões
| Ponto | Mudança |
| :-- | :-- |
| `removal.blockersOf` | `ONLY_MEMBER` só se o **alvo tem conta** e `active.filter(m => m.userId != null).length <= 1`. Remover um sem conta nunca dá `ONLY_MEMBER`. `LAST_ADMIN` inalterado (sem conta nunca é ADMIN). |
| `removeMember(REMOVED)` com alvo sem conta | Mesmo fluxo de pendências (contas, cartões, previstas, acerto). **Pula** `endUserSessions` e `revokeMemberGrants` (nada a encerrar). O `UPDATE` que grava `removedAt` grava `pendingEmail = NULL` **na mesma linha** (a CHECK `members_pending_email_chk` recusa o contrário). Depois, na mesma transação: `UPDATE invitations SET status='CANCELED', "canceledAt"=now WHERE "memberId"=$alvo AND status='PENDING'` e `UPDATE invitations SET email = 'deleted+' \|\| $alvo \|\| '@invalid.local' WHERE "memberId" = $alvo` (Q-TL-U5; no-op até a 094a). `LEFT` com alvo sem conta é impossível (não há sessão); defensivo: 403. |
| `privacidade/delete-account` | `SOLE_MEMBER` conta só ativos com conta. Passo (6): `UPDATE members SET name = NULL WHERE "userId" = $u` antes de anonimizar `User` (ADR-033 §2.2); `scrubIdempotency` recebe também os `members.name` não nulos da pessoa. Cadastros sem conta ficam com a família. |
| `privacidade/delete-family` | `HAS_OTHER_MEMBERS` conta só ativos com conta (`NOT: { id }`, `userId: { not: null }`). A limpeza de idempotência por `userId` filtra `null`. Cadastros sem conta são apagados com a família (ordem atual). |
| `familia/manage.changeRole` | Alvo com `userId == null` ⇒ **422 `UNLINKED_MEMBER_ROLE`** "Quem ainda não tem acesso ao app não pode ser Administrador." antes de qualquer escrita; o `session.deleteMany` só roda com `userId` não nulo. |
| `getFamily` | `members` traz os sem conta (`unlinked: true`, `email: null`, `canChangeRole: false`); `exMembers` idem com `unlinked` (§4.2). |
| MCP / IA | Leituras de membros só por `memberDisplayName`; `pendingEmail` nunca é selecionado fora de `familia/` (verificação §8.1). |

### 3.6 Erros novos da 092a
| HTTP | Código | Quando | Mensagem |
| :-: | :-- | :-- | :-- |
| 422 | `UNLINKED_MEMBER_ROLE` | `PATCH /members/{id}` em sem conta | "Quem ainda não tem acesso ao app não pode ser Administrador." |
| 500 (bug) | `check_violation` do gatilho/CHECK | Só se o código violar o modelo; mapeado a 500 genérico, logado | — |

## 4. Fatia 092b: cadastrar membro sem conta (2 pts)

### 4.1 Rota `POST /api/v1/members` (arquivo novo `src/app/api/v1/members/route.ts`)
`withApi({ role: "ADMIN", body: CreateUnlinkedMemberSchema })`, igual a `POST /invitations` (a idempotência por `Idempotency-Key` é a do `withApi`). Resposta **201** `CreateUnlinkedMemberResponse`.

```ts
// src/modules/familia/schemas.ts
export const memberNameSchema = z
  .string({ error: "Informe o nome" })
  .transform(sanitizeMemberName)                                  // SEC-063b
  .pipe(z.string().min(2, "Use de 2 a 60 caracteres").max(60, "Use de 2 a 60 caracteres"))
  .refine((s) => !RESERVED_NAME_KEYS.has(nameKey(s)), { message: "Escolha outro nome", params: { code: "NAME_RESERVED" } });
// O corpo NUNCA traz joinedAt/role/userId (.strict()): joinedAt = now() só no servidor (SEC-060)

export const CreateUnlinkedMemberSchema = z
  .object({
    name: memberNameSchema,
    email: z.union([z.literal("").transform(() => undefined), emailSchema]).optional(),
  })
  .strict();
export type CreateUnlinkedMemberInput = z.infer<typeof CreateUnlinkedMemberSchema>;

export type MemberDTO = {
  memberId: string;
  name: string;                 // memberDisplayName
  email: string | null;         // e-mail da conta; null para sem conta (nunca o pendingEmail)
  image: string | null;
  role: Role;
  joinedAt: string;
  unlinked?: true;              // selo "Sem acesso ao app"
  pendingEmail?: string | null; // SÓ para ADMIN e só em sem conta; ausente para os demais
};
export type CreateUnlinkedMemberResponse = { member: MemberDTO & { canChangeRole: false } };
```
`FamilyDTO.members` e `FamilyDTO.exMembers[]` ganham `unlinked?: true`; `FamilyEventDTO.type` ganha `"MEMBER_CREATED" | "MEMBER_UPDATED" | "MEMBER_LINKED"`.

### 4.2 Serviço `createUnlinkedMember(tx, ctx, input)` (`src/modules/familia/members.ts`, novo)
1. `lockFamilyAdmins(tx, ctx, true)` (reconfere ator ativo e ADMIN depois do lock).
2. Ativos da família com `name`, `pendingEmail`, `user { name, email, deletedAt }`.
3. **Teto (SEC-068):** ativos sem conta ≥ 20 ⇒ 422 `UNLINKED_MEMBER_LIMIT` ("A família já tem 20 membros sem acesso ao app.").
3b. **Nome:** se `nameKey(input.name)` ∈ `{ nameKey(memberDisplayName(m)) }` ⇒ 409 `NAME_TAKEN`.
4. **E-mail** (se informado, já normalizado):
   - de membro ativo com conta (`m.user.email`) ⇒ 409 `DUPLICATE_MEMBER` ("Este e-mail já pertence a outro membro");
   - `pendingEmail` de outro cadastro ativo ⇒ 409 `EMAIL_BELONGS_TO_OTHER_MEMBER` (mesma mensagem);
   - convite **comum** PENDING e não vencido para o e-mail nesta família ⇒ 409 `EMAIL_HAS_PENDING_INVITATION` ("Já existe um convite pendente para este e-mail. Cancele-o antes de cadastrar."). Convite vencido: chamar `expireStale(email, now)` antes (mesma regra do convite).
   - e-mail de **ex-membro** desta família: permitido (ADR-033 §4).
   - **Todas** as checagens são restritas a `ctx.familyId` (SEC-068.3): e-mail cadastrado em outra família nunca gera erro (não há oráculo entre famílias).
5. `INSERT members (familyId, userId NULL, role 'MEMBER', joinedAt now, name, pendingEmail, createdByMemberId = ctx.memberId)`. Violação de `members_family_pending_email_uq` (corrida) ⇒ 409 `EMAIL_BELONGS_TO_OTHER_MEMBER`.
6. `FamilyEvent MEMBER_CREATED` (`actor = ctx.memberId`, `target = novo id`, `changes: { hasEmail }`).
7. Nenhum e-mail é enviado; nenhuma cota de convite é consumida (ADR-033 §3, "Tetos").
8. Devolve o `MemberDTO` (com `pendingEmail`, pois o ator é ADMIN).

**`createInvitation` (convite comum) ganha, na 092b:** `lockFamilyAdmins(tx, ctx, true)` antes das checagens e 409 **`EMAIL_BELONGS_TO_UNLINKED_MEMBER`** "Este e-mail é do cadastro de {nome}. Convide pelo cadastro dele(a)." quando o e-mail é `pendingEmail` de um ativo (a ação "Convidar pelo cadastro" chega na 094a; até lá o Admin pode remover o e-mail do cadastro só na 095, então a 092b deve sair junto ou depois da 094a **se** o usuário for usar convite antes: registrado como R3).

### 4.3 Erros da 092b
| HTTP | Código | Mensagem (UI) |
| :-: | :-- | :-- |
| 403 | `FORBIDDEN` | (não-ADMIN; a UI nem mostra a ação) |
| 409 | `NAME_TAKEN` | "Já existe um membro com este nome" (campo nome) |
| 409 | `DUPLICATE_MEMBER` / `EMAIL_BELONGS_TO_OTHER_MEMBER` | "Este e-mail já pertence a outro membro" (campo e-mail) |
| 409 | `EMAIL_HAS_PENDING_INVITATION` | "Já existe um convite pendente para este e-mail. Cancele-o antes de cadastrar." |
| 409 | `EMAIL_BELONGS_TO_UNLINKED_MEMBER` (em `POST /invitations`) | "Este e-mail é do cadastro de {nome}. Convide pelo cadastro dele(a)." |
| 422 | `VALIDATION_ERROR` / `NAME_RESERVED` | mensagens do Zod por campo; termo reservado: "Escolha outro nome" |
| 422 | `UNLINKED_MEMBER_LIMIT` | "A família já tem 20 membros sem acesso ao app." |
| 409 | `IDEMPOTENCY_*` | padrão `withApi` |

### 4.4 Estados técnicos de UI (`src/app/(app)/familia/familia-screen.tsx` + `add-member-drawer.tsx`, novo)
| Estado | Comportamento |
| :-- | :-- |
| Ação | Botão **"Cadastrar membro"** ao lado de "Convidar", só se `currentRole === "ADMIN"` (não-ADMIN: ausente do DOM). |
| Drawer idle | Campos **Nome** (obrigatório, contador 60) e **E-mail (opcional)** com ajuda "Só para convidar depois. Só Administradores veem." Nota fixa: "{nome} não terá acesso ao app nem receberá e-mail." |
| Aviso de divisão (Q-TL-U1; **SEC-060 pendente do usuário**: se ele optar pela pergunta "Entra na divisão?", ela substitui este aviso, +1 pt) | Se o acerto está ligado: regra vigente EQUAL ⇒ "A divisão igual passará a incluir {nome} nas despesas novas. Para não dividir com {nome}, use a divisão proporcional com 0%." com link para Regra de divisão; PROPORTIONAL ⇒ "A divisão proporcional precisará ser redefinida para incluir {nome} (pode ser 0%)." Lido de `GET /split-rule` já em cache. |
| Enviando | Botão "Cadastrar" com spinner e desabilitado; `Idempotency-Key` gerada ao abrir o drawer e mantida em reenvios (padrão `useCreateInvitation`). |
| Sucesso | Fecha o drawer, toast "{nome} cadastrado(a)", chama `useInvalidateFamily()` (`familyKey`, `["me"]`) e invalida também as chaves da regra de divisão e do acerto (aviso `stale`) e de contas (seletores); usar as constantes de chave já exportadas pelos hooks de `split`/`contas`. |
| Erro de campo | 409/422 mostram a mensagem no campo; o drawer fica aberto com os valores. |
| Erro geral / rede | Banner no drawer "Não foi possível cadastrar. Tente de novo." mantendo os dados (mesma chave ⇒ sem duplicar). |
| Lista | Cartão do membro com o selo **"Sem acesso ao app"** (mesmo estilo dos selos de papel), sem e-mail para não-ADMIN; para ADMIN, o `pendingEmail` em texto secundário. Menu "…": nesta fatia só **Remover** (Editar = 095, Convidar = 094a); **"Tornar Administrador" ausente**. |
| Histórico | `MEMBER_CREATED`: "{ator} cadastrou {alvo} (sem acesso ao app)" (nome resolvido na leitura, ADR-033 §2.2). |
| Remoção | Reusa `remove-member-dialog.tsx`; para `unlinked` o texto omite "a pessoa perderá o acesso em todos os aparelhos" (polimento completo na 095). |
| Responsivo | Drawer em tela cheia < 768 px; foco no Nome ao abrir; `Esc` fecha; rótulos acessíveis. |

## 5. Segurança e LGPD (resumo para o Dev; revisão da Segurança de 2026-10-30)
1. **Isolamento:** `POST /members` só cria na família do ator (`ctx.familyId`); nenhum id de outra família entra no corpo. Canário do ADR-018 §2 estendido à rota.
2. **PII de terceiro:** `pendingEmail` só sai em `getFamily`/`createUnlinkedMember` para ADMIN; nunca em `MemberRef`, `FamilyEvent.changes`, exportação, MCP, IA, logs (o logger já mascara e-mail; conferir o `withApi` não logar o corpo).
3. **Sem acesso:** nenhum caminho cria sessão, consentimento, concessão MCP ou idempotência para membro sem conta (não há `userId`). `ctx.memberId` nunca é um sem conta.
4. **SEC-004 intacto:** nenhum caminho além de `acceptInvitation` (094b) grava `members.userId` não nulo em linha existente; o gatilho recusa vínculo inválido e o teste estático §8.1 busca `userId:` em `member.update*`.
5. **Remoção:** apaga `pendingEmail` e anonimiza convites do cadastro (Q-TL-U5); o rótulo fica como nome de ex-membro (U5, risco aceito vigente).
6. **Limitação a registrar em privacidade-lgpd (Gestor):** titular sem conta só exerce direitos via Administrador/suporte; o dado pode ser de criança (LGPD art. 14): citar no texto de `/privacidade` (SEC-068.2).
7. **Remoção (SEC-061/068):** além de anonimizar convites, chamar `scrubIdempotencyMentioning(tx, { identifiers: [pendingEmail] })` quando o alvo tinha e-mail; as respostas de idempotência do `POST /members` que citam o e-mail somem com ele.
8. **Mapa dos achados da revisão** (onde cada um é tratado): SEC-058 inteiro na 092a (§3.4, §8); SEC-063b saneamento/reservados já no cadastro (092b); SEC-065 na 092a (§3.1); SEC-068 (1-5) na 092b; SEC-059 (pagador, destino do acerto, transparência) na 093a/093b/094b; SEC-061 (`INVITATION_RESENT` sem e-mail) na 094a; SEC-062(1,2), SEC-064, SEC-066a na 094a/094b; SEC-066b e SEC-067 na 093b; SEC-063 (aceite, renomear só o próprio, exclusão de conta) na 094b/095, com a parte "exclusão de conta zera `members.name`" já na 092a; SEC-060 e SEC-062(3) pendentes do usuário.

## 6. Estimativa e fatiamento
| Fatia | Pts | Conteúdo | Pode ir à produção |
| :-- | :-: | :-- | :-- |
| 092a | **3** | 2 migrações + gatilho (1), `display-name.ts` e troca mecânica das ~32/76 leituras + `MemberRef.unlinked` (1), `ownerStanding`/export/contagens/remoção/papel/exclusões + testes de migração e regressão (1) | Sim, sozinha (expand) |
| 092b | **2** | Rota + serviço + guarda no convite comum + saneamento/reservados/teto (1), drawer, selo, aviso, eventos, E2E (1) | Depois da 092a |
| **Total** | **5** | | |

## 7. Ordem de implementação (Dev)
1. Migrações + Prisma + `pnpm prisma generate`; `tsc` lista todas as leituras de `user` ⇒ `display-name.ts`.
2. `ownerStanding`, export, contagens, remoção, `changeRole`, exclusões (testes primeiro: §8.2 R2/R3).
3. Suíte inteira verde (unit + int) **sem nenhum sem conta** = prova de que a 092a não muda comportamento.
4. 092b: schema, serviço, rota, guarda do convite comum, UI, E2E.
5. Atualizar `estado/familia-convites-sessoes.md` (§b novas regras 21-23, §c invariantes 9-10, §f fontes) no mesmo commit da implementação.

## 8. Guia de testes para o Dev & QA

### 8.1 Unidade e verificação estática (`tests/unit/familia/`)
1. `display-name.test.ts`: `name` > `user.name` > parte local; `user` nulo com `name`; conta excluída ⇒ "Conta excluída" mesmo com `members.name`; `memberFirstName`; `nameKey("  Ána  Maria ") === nameKey("ana maria")`.
2. `CreateUnlinkedMemberSchema`: nome 1/2/60/61 caracteres, espaços colapsados, e-mail vazio ⇒ `undefined`, e-mail com maiúsculas ⇒ minúsculo, campo extra ⇒ 422 (`.strict()`).
3. **Estático** (`tests/unit/meta/member-reads.test.ts`, lê `src/**` como texto): (0) SEC-058: reprova `userId: <expr>.userId` em `where` (exceto com guarda `!= null` na linha anterior, lista de exceções explícita), `userId: undefined` e `?? undefined` em objetos `where`; (a) nenhum `user.name ??`/`localPart(` fora de `familia/display-name.ts`, `lib/auth/**` e `perfil`/`MeDTO` (lista de exceções explícita); (b) `pendingEmail` só aparece em `src/modules/familia/**` e `privacidade/delete-*`; (c) nenhum `member.update*`/`UPDATE members` com `userId` em `data` fora de `familia/invitations/service.ts` (094b).

### 8.2 Integração (`tests/integration/us-092a-modelo-membro-sem-conta.int.test.ts`)
1. **Migração:** depois do `migrate`, todas as linhas de `members` existentes intactas (contagem, `userId` não nulo, `version`s da família); `information_schema` mostra as colunas e o gatilho com `search_path` fixo (como `sec036-travas`).
2. **CHECKs** (SQL cru, cada um recusa): sem conta sem nome; sem conta ADMIN; `pendingEmail` em membro com conta; `pendingEmail` em removido; nome com 1 e 61 caracteres; `pendingEmail` com maiúsculas; dois cadastros com o mesmo `pendingEmail` na família (ok em famílias diferentes).
3. **Gatilho:** recusa `userId` A ➔ B, A ➔ `NULL`; vínculo de removido; vínculo sem `linkedAt`, com `pendingEmail`, sem `name` ou mudando `joinedAt`; `linkedAt` fora do vínculo; troca de `familyId`/`createdByMemberId`. **Aceita**: `UPDATE removedAt/role/assistantReviewedAt/removalNoticeAt` (código atual), `joinedAt` fora do vínculo (harness), vínculo válido (preparação da 094b).
3b. **`undefined` (SEC-058.3):** `endUserSessions(tx, "" as never)` e `endUserSessions(tx, undefined as never)` devolvem 0 e **nenhuma** sessão de outro usuário muda (semear 3 usuários com sessões).
4. **R2 (ownerStanding):** família com Admin, ex-membro sem conta X (removido) dono de "Só meu" e pagador de dividida, e outro sem conta ativo Y ⇒ X continua `ownerRemoved` (Admin-ex edita; pagador imutável D-GES-59 para todos); antes da correção o teste falha (reprodução).
5. **R3 (exportação e sugestões):** mesmo cenário ⇒ observação de dividida de X sai `null` no arquivo de um membro comum (SEC-050); nas sugestões de categoria (`analise-ia/suggestions`), o "Só meu" de X é tratado como de ex-membro (só Admin-ex), não de dono ativo.
6. **Contagens:** família Admin + 1 sem conta: Admin não sai (`ONLY_MEMBER`), excluir conta dá `SOLE_MEMBER`, excluir a família é **permitido** e apaga o cadastro (e seus convites); Admin remove o sem conta sem `ONLY_MEMBER`.
7. **Remoção de sem conta:** pendências exigidas como hoje (conta com saldo, cartão com fatura, previstas, acerto); depois: `removedAt`, `removalKind=REMOVED`, `pendingEmail = NULL`, nenhum `session`/`mcp_grant` tocado, convites com `memberId` (semeados por SQL) cancelados e com e-mail `deleted+<id>@invalid.local`; `findResidue([email])` vazio.
8. **Papel:** `PATCH /members/{semConta}` `{ role: "ADMIN" }` ⇒ 422 `UNLINKED_MEMBER_ROLE`, nada escrito.
9. **Excluir conta:** membro vinculado (semeado com `members.name = "Bia"` por SQL, simulando a 094b) exclui a conta ⇒ `members.name` nulo, nome exibido "Conta excluída", `findResidue(["Bia"])` vazio (fora `family_events`, que não deve conter nada).
10. **D-033-4:** "Só meu" com pagador sem conta ativo criado por Admin ⇒ 403 `PERSONAL_ON_BEHALF_FORBIDDEN`; dividida com pagador sem conta criada por membro comum ⇒ 201 (autor = membro).
11. **Regressão completa obrigatória** (sem alterar asserções): `pnpm test` e `pnpm test:int` inteiros, com destaque para `en002-harness` (240 famílias), `en002-migracao`, `en002a-stored`, `en002-constraints`, `us-009-acerto`, `us-011-registrar-acerto`, `us-008-regra-divisao`, `tests/unit/split/settlement.test.ts` (**S1..S16**, dois motores) e `split-amount.test.ts` (**V1..V10**), e toda a suíte do "Só meu" (`sec021*`, `sec025-026*`, `sec038*`, `sec042-046*`, `sec047-050*`, `d-ges-55*`, `d-ges-59*`, `us-084*`), `us-035-remover-membro`, `us-034-familia-papeis`, `sec017b/c/d`, `sec029-032-exportacao`, `sec030-033-conta-excluida`.

### 8.3 Harness de famílias com sem conta (`tests/support/split-universe.ts` + `tests/integration/us-092a-harness-sem-conta.int.test.ts`)
- `buildUniverse(seed, { unlinked: k })`: até 2 membros sem conta por família (sementes fixas 1..240, `HARNESS_SEEDS`), que entram como pagadores de divididas, titulares de contas (por SQL, a UI de titular é da 093a), participantes de splits e, em 30%, removidos.
- **Propriedade:** para cada família, `snapshotPeriod` LEGACY ➜ `migrateFamily` ➜ STORED com `diffSnapshots == []` em todos os períodos (mesmo gate de 1 centavo do EN-002b): o motor trata sem conta como qualquer membro.
- **Base para a 094b:** o mesmo universo expõe `snapshotFamily(familyId)` (totais por mês, saldos, `computeSettlement` por período, `collectOpenPayables`, lista de `version`s, contagem de membros e splits), que a 094b usa antes/depois do aceite.

### 8.4 Integração da 092b (`tests/integration/us-092b-cadastrar-membro.int.test.ts`)
1. ADMIN cadastra "Ana" ⇒ 201; `GET /family` mostra `unlinked: true`, `email: null`; para ADMIN `pendingEmail`, para MEMBER **sem** a chave; mailpit sem mensagem; cotas de convite intactas.
2. MEMBER ⇒ 403; outra família ⇒ cria só na própria (canário).
3. `NAME_TAKEN` para "ana", "ÁNA", " Ana " e para o nome do Google de um membro com conta; nome de ex-membro é permitido.
4. E-mail: de membro com conta ⇒ `DUPLICATE_MEMBER`; de outro cadastro ⇒ `EMAIL_BELONGS_TO_OTHER_MEMBER`; com convite comum pendente ⇒ `EMAIL_HAS_PENDING_INVITATION`; com convite vencido ⇒ 201 (convite vira EXPIRED); de ex-membro ⇒ 201.
5. Convite comum para o `pendingEmail` de um cadastro ⇒ 409 `EMAIL_BELONGS_TO_UNLINKED_MEMBER`, sem consumir cota.
6. **Concorrência:** 2 cadastros simultâneos com o mesmo nome ou o mesmo e-mail ⇒ 1 vence, outro 409; cadastro × convite comum para o mesmo e-mail ⇒ um só sobrevive.
7. Idempotência: mesma chave repetida ⇒ mesma resposta, 1 linha; chave reutilizada com corpo diferente ⇒ erro padrão.
7b. **SEC-063b/SEC-068:** nome com espaço invisível (`"Ana\u200B"`) e com forma de compatibilidade (`"Ａna"`) colide com "Ana" (`NAME_TAKEN`); "Conta excluída", "Administrador", "Sem acesso ao app" ⇒ 422 `NAME_RESERVED`; 21º cadastro ⇒ 422 `UNLINKED_MEMBER_LIMIT`; e-mail que é `pendingEmail` de cadastro em **outra** família ⇒ 201; corpo com `joinedAt` ⇒ 422 (`.strict()`).
8. `MEMBER_CREATED` com `changes = { hasEmail }`; `findResidue([pendingEmail])` só acha `members.pendingEmail` (nunca `family_events`).
9. **Q-TL-U1:** com regra EQUAL e acerto ligado, despesa dividida **criada depois** do cadastro tem 3 splits (STORED); despesas anteriores mantêm os splits (nenhum `transaction_splits` muda); com PROPORTIONAL, `GET /split-rule` passa a `stale: true` e o PUT aceita 0% para o cadastrado.
10. Seletores: `GET /family` (fonte dos seletores de pessoa) e os `MemberRef` de `/accounts`, `/transactions` e `/planned-expenses` trazem o cadastrado com `unlinked: true`.

### 8.5 E2E / BDD (`tests/e2e/features/US-092-cadastrar-membro-sem-conta.feature` + steps; 1:1 com os 8 cenários da US, 375 e 1280 px)
Cadastrar só com nome (selo, sem e-mail no mailpit); aparece em "Quem pagou?" e "Responsável" de "Nova despesa"; e-mail opcional; Lucas (Membro) não vê "Cadastrar membro"; nome repetido; e-mail de outro membro; sem "Tornar Administrador"; histórico "Mariana cadastrou Ana (sem acesso ao app)". Mais: aviso de divisão igual no drawer.

## 9. Riscos e pendências
| # | Risco | Mitigação |
| :-- | :-- | :-- |
| R1 | Troca mecânica de ~76 leituras esquece um ponto e mostra "undefined"/quebra com `user` nulo | O TypeScript aponta (`User \| null`); verificação estática §8.1(3); E2E com sem conta em Home, Extrato, Acerto, Previstas, Cartões |
| R2 | Comparação de pessoa com `NULL` em código novo | Regra §3.4 + teste R2/R3 + revisão do TL |
| R3 | Entre a 092b e a 094a, o Admin cadastra e-mail e depois quer convidar por convite comum: 409 `EMAIL_BELONGS_TO_UNLINKED_MEMBER` sem saída na UI (editar/remover e-mail é da 095) | Ordem sugerida ao Gestor: 092a ➔ 092b ➔ 093a ➔ 093b ➔ 094a ➔ 094b ➔ 095; se a 095 for cortada, a 094a passa a incluir "remover e-mail do cadastro" (+0,5) |
| R4 | Aviso Q-TL-U1 ignorado: a criança passa a dividir EQUAL | Aviso no drawer + `stale` da PROPORTIONAL; nenhuma despesa antiga muda |
| R5 | Gatilho bloqueia script de manutenção futuro que mexa em `joinedAt` no vínculo | Intencional; documentado no cabeçalho da migração |
| R6 | Respostas do usuário a SEC-060 (pergunta "Entra na divisão?") e SEC-062(3) ("Desvincular conta") | SEC-060 muda só o drawer da 092b (+1 pt); SEC-062(3) é fatia nova após a 094b; nenhuma bloqueia a 092a |
| R7 | Esqueleto de confusáveis (cirílico/grego) não coberto pela NFKC | Risco baixo registrado (SEC-063b "idealmente"); unicidade NFKC + reservados já cobre invisíveis e formas de compatibilidade |

### Hipóteses no formato dos pedidos ao Gestor (nenhuma bloqueia; Gestor ratifica)
| ID | Data | História | Lacuna / desvio | Hipótese adotada | Impacto |
| :-- | :-- | :-- | :-- | :-- | :-- |
| TL-092-1 | 2026-10-30 | US-092 | US/ADR não dizem o que fazer com convite comum pendente para o e-mail cadastrado | 409 `EMAIL_HAS_PENDING_INVITATION` (evita 2º membro) | Nenhum |
| TL-092-2 | 2026-10-30 | US-092 | ADR-033 §2.5 congelava `joinedAt` sempre; harness e fixtures alteram | Congelado só no UPDATE de vínculo | Nenhum em produção |
| TL-092-3 | 2026-10-30 | US-094 (antecipado) | Q-TL-U4: campo do nome no aceite, pré-preenchimento | Pré-preenche com o nome do Google, mostra o rótulo como dica (ADR-033 §2.2); SDD da 094b detalha | Texto da US-094 muda (PO) |
| TL-092-4 | 2026-10-30 | US-092 | Seletores: selo é da 093a, mas o BDD da 092 exige o cadastrado nos seletores | Os seletores listam o cadastrado já na 092a (sem selo); selo na 093a | Nenhum |

## 10. Rastreabilidade
NEED-028 (RN-028.1, 028.3, 028.6, 028.7) ➔ FLUXO-020 ➔ US-092 ➔ ADR-033 §2, §2.1, §2.2, §3, §6, §8 ➔ **SDD-033** ➔ TASK (Dev cria) ➔ `tests/integration/us-092a-*`, `us-092b-*`, `tests/unit/familia/*`, `tests/e2e/features/US-092-*`. Estado: [familia-convites-sessoes.md](../../estado/familia-convites-sessoes.md).
