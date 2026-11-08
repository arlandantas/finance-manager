import { z } from "zod";
import { conflict, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx, UserContext } from "@/lib/api/types";
import { DELETED_ACCOUNT_NAME } from "@/lib/deleted-account";
import { lockFamilyAdmins } from "@/modules/familia/manage";
import { removeMember } from "@/modules/familia/removal";
import { RemoveMemberSchema } from "@/modules/familia/schemas";
import { revokeGrant } from "@/modules/mcp/grants";

// SEC-017c (SDD-028 §7.4, US-080): excluir a minha conta. A identidade é anonimizada; o histórico financeiro
// da família permanece (ADR-019, D-GES-42 U5). Tudo numa transação.

export const deletedEmailOf = (userId: string) => `deleted+${userId}@invalid.local`;

export const LAST_ADMIN_MSG = "Passe a administração para outra pessoa antes de excluir sua conta.";
export const SOLE_MEMBER_MSG =
  "Você é a única pessoa na família. Exclua a família antes de excluir sua conta.";
export const EMAIL_MISMATCH_MSG = "O e-mail digitado não confere com o da conta";

/** Mesmas pendências da saída da família (US-035) + a confirmação pelo e-mail da conta. */
export const DeleteAccountBodySchema = RemoveMemberSchema.extend({
  confirmEmail: z.string().max(320),
}).strict();
export type DeleteAccountBody = z.output<typeof DeleteAccountBodySchema>;

/**
 * Apaga os registros de idempotência do titular (guardam hash do corpo de requisições dele) E as respostas guardadas
 * de OUTRAS pessoas que citam o titular. SEC-031: a janela de 24 h não vale para PII de excluídos.
 * SEC-039: o alcance é decidido por colunas próprias, nunca por trecho de texto em toda a tabela:
 * - identificadores únicos (UUIDs do titular/membros e e-mail completo) valem em qualquer linha;
 * - o NOME (texto livre, pode colidir com "Mariana", "banana") só é procurado nas linhas de quem compartilhou
 *   alguma família com o titular (`userId` dos co-membros), nunca nas de outras famílias.
 */
export async function scrubIdempotency(
  tx: Tx,
  userId: string,
  mentions: { identifiers?: string[]; names?: string[] } = {},
) {
  await tx.$executeRaw`DELETE FROM idempotency_records WHERE "userId" = ${userId}::uuid`;
  const coMembers = await tx.$queryRaw<Array<{ userId: string }>>`
    SELECT DISTINCT "userId"::text AS "userId" FROM members
    WHERE "familyId" IN (SELECT "familyId" FROM members WHERE "userId" = ${userId}::uuid)
      AND "userId" <> ${userId}::uuid`;
  await scrubIdempotencyMentioning(tx, {
    identifiers: mentions.identifiers,
    names: mentions.names,
    scopeUserIds: coMembers.map((m) => m.userId),
  });
}

const normalizeNeedles = (list: string[] | undefined, min: number) => [
  ...new Set((list ?? []).map((n) => n.trim().toLowerCase()).filter((n) => n.length >= min)),
];

/**
 * Apaga respostas guardadas que citam identificadores (UUID/e-mail completos; qualquer usuário) ou nomes (só nas
 * linhas de `scopeUserIds`), sem diferenciar caixa. Sem escopo, nome nenhum é procurado.
 */
export async function scrubIdempotencyMentioning(
  tx: Tx,
  opts: { identifiers?: string[]; names?: string[]; scopeUserIds?: string[] },
) {
  const ids = normalizeNeedles(opts.identifiers, 8);
  if (ids.length > 0) {
    await tx.$executeRaw`DELETE FROM idempotency_records
      WHERE "responseStatus" <> 0 AND EXISTS (SELECT 1 FROM unnest(${ids}::text[]) AS t(needle)
                    WHERE position(t.needle in lower("responseBody"::text)) > 0)`;
  }
  const names = normalizeNeedles(opts.names, 3);
  const scope = opts.scopeUserIds ?? [];
  if (names.length > 0 && scope.length > 0) {
    await tx.$executeRaw`DELETE FROM idempotency_records
      WHERE "responseStatus" <> 0 AND "userId" = ANY(${scope}::uuid[])
        AND EXISTS (SELECT 1 FROM unnest(${names}::text[]) AS t(needle)
                    WHERE position(t.needle in lower("responseBody"::text)) > 0)`;
  }
}

/** Desliga o consentimento de IA que este titular deu e ainda está em vigor (um evento DISABLED por finalidade). */
async function revokeAiConsents(tx: Tx, memberIds: string[], now: Date) {
  if (memberIds.length === 0) return 0;
  const rows = await tx.$queryRaw<
    Array<{ familyId: string; purpose: string; textVersion: number; memberId: string; at: Date }>
  >`
    SELECT DISTINCT ON ("familyId", purpose) "familyId", purpose::text AS purpose, "textVersion", "memberId",
           "createdAt" AS at, action::text AS action
    FROM ai_consent_events
    WHERE "familyId" IN (SELECT "familyId" FROM members WHERE id = ANY(${memberIds}::uuid[]))
    ORDER BY "familyId", purpose, "createdAt" DESC, id DESC`;
  const mine = new Set(memberIds);
  let n = 0;
  for (const r of rows as Array<(typeof rows)[number] & { action: string }>) {
    if (r.action !== "ENABLED" || !mine.has(r.memberId)) continue;
    const at = r.at >= now ? new Date(r.at.getTime() + 1) : now;
    await tx.$executeRaw`INSERT INTO ai_consent_events (id, "familyId", purpose, action, "textVersion", "memberId", "createdAt")
      VALUES (gen_random_uuid(), ${r.familyId}::uuid, ${r.purpose}::"LlmPurpose", 'DISABLED'::"AiConsentAction",
              ${r.textVersion}, ${r.memberId}::uuid, ${at})`;
    await tx.familyEvent.create({
      data: {
        familyId: r.familyId,
        type: "AI_CONSENT_CHANGED",
        actorMemberId: r.memberId,
        changes: {
          purpose: r.purpose,
          action: "DISABLED",
          textVersion: r.textVersion,
          reason: "ACCOUNT_DELETED",
        },
      },
    });
    n++;
  }
  return n;
}

/**
 * POST /me/delete-account. Idempotente por estado (a rota não usa `Idempotency-Key`: a linha de chave tem FK para
 * `users` e, ao anonimizar o e-mail, a transação vencedora esperaria as perdedoras que seguram esse FK, o que
 * dá deadlock): conta já excluída => `{ deleted: true }`. Serializa por usuário
 * (`FOR NO KEY UPDATE`) e, se ainda ativo numa família, por família (lock da US-035).
 */
export async function deleteAccount(tx: Tx, ctx: UserContext, body: DeleteAccountBody) {
  await tx.$queryRaw`SELECT id FROM users WHERE id = ${ctx.userId}::uuid FOR NO KEY UPDATE`;
  const user = await tx.user.findUnique({ where: { id: ctx.userId } });
  if (!user || user.deletedAt) {
    await scrubIdempotency(tx, ctx.userId);
    return { deleted: true as const };
  }
  if (body.confirmEmail.trim().toLowerCase() !== user.email.toLowerCase()) {
    throw unprocessable("EMAIL_MISMATCH", EMAIL_MISMATCH_MSG);
  }

  const now = ctx.clock.now();
  const memberships = await tx.member.findMany({ where: { userId: user.id } });
  const memberIds = memberships.map((m) => m.id);
  const active = memberships.find((m) => m.removedAt === null) ?? null;

  // (1) sai da família pelo mesmo serviço da US-035 (pendências, reatribuições, evento MEMBER_LEFT)
  if (active) {
    const rctx: RequestContext = {
      ...ctx,
      memberId: active.id,
      familyId: active.familyId,
      role: active.role,
    };
    await lockFamilyAdmins(tx, rctx);
    // US-092a (SDD-033 §3.5): cadastros sem conta não contam como "outra pessoa" na família
    const members = await tx.member.findMany({
      where: { familyId: active.familyId, removedAt: null, userId: { not: null } },
      select: { role: true },
    });
    if (members.length <= 1) throw conflict("SOLE_MEMBER", SOLE_MEMBER_MSG);
    if (active.role === "ADMIN" && members.filter((m) => m.role === "ADMIN").length <= 1) {
      throw conflict("LAST_ADMIN", LAST_ADMIN_MSG);
    }
    await removeMember(
      tx,
      rctx,
      active.id,
      { acknowledgeSettlement: body.acknowledgeSettlement, reassign: body.reassign },
      "LEFT",
    );
  }

  // (2) consentimentos de IA do titular, conexões de assistente (todas as famílias) e limites
  await revokeAiConsents(tx, memberIds, now);
  const grants = await tx.mcpGrant.findMany({
    where: { userId: user.id, status: "ACTIVE" },
    select: { id: true },
  });
  for (const g of grants) await revokeGrant(tx, g.id, "MEMBER_REMOVED", now, null);
  await tx.mcpToken.deleteMany({ where: { grant: { userId: user.id } } });
  await tx.mcpAuthorizationRequest.deleteMany({ where: { userId: user.id } });
  await tx.memberAssistantLimits.deleteMany({ where: { memberId: { in: memberIds } } });
  // US-076c: propostas não confirmadas guardam descrição; as confirmadas são só histórico do lançamento
  await tx.assistantProposal.deleteMany({
    where: { memberId: { in: memberIds }, status: { not: "CONFIRMED" } },
  });

  // (3) credenciais e rastros técnicos: sessões (todos os aparelhos), vínculo com o Google, tokens por e-mail
  await tx.session.deleteMany({ where: { userId: user.id } });
  await tx.account.deleteMany({ where: { userId: user.id } });
  await tx.verificationToken.deleteMany({ where: { identifier: user.email } });
  await scrubIdempotency(tx, user.id, {
    identifiers: [user.id, user.email, ...memberIds],
    // US-092a: o nome escolhido no aceite (`members.name`) também é PII da pessoa
    names: [user.name ?? "", ...memberships.map((m) => m.name ?? "")],
  });

  // (4) o e-mail antigo some de convites encerrados e dos eventos de reenvio; convites PENDENTES ficam
  // (valem para a conta nova que a pessoa criar com o mesmo e-mail)
  const anon = deletedEmailOf(user.id);
  await tx.$executeRaw`UPDATE invitations SET email = ${anon} WHERE lower(email) = ${user.email.toLowerCase()} AND status <> 'PENDING'`;
  await tx.$executeRaw`SELECT set_config('app.anonymize_user', ${user.id}, true)`;
  await tx.$executeRaw`UPDATE family_events SET changes = jsonb_set(changes, '{email}', to_jsonb(${anon}::text))
    WHERE type = 'INVITATION_RESENT' AND lower(changes->>'email') = ${user.email.toLowerCase()}`;
  await tx.$executeRaw`SELECT set_config('app.anonymize_user', '', true)`;

  // (5) rede de segurança: nenhum vínculo ativo sobrevive (ex.: aceite de convite concorrente)
  await tx.member.updateMany({
    where: { userId: user.id, removedAt: null },
    data: { removedAt: now, removalKind: "LEFT" },
  });

  // (6) a identidade é anonimizada; o histórico segue apontando para esta linha. O nome escolhido no aceite
  // (`members.name`, ADR-033 §2.2) é zerado: o nome exibido volta a ser o de `users.name` ("Conta excluída").
  await tx.$executeRaw`UPDATE members SET name = NULL WHERE "userId" = ${user.id}::uuid AND name IS NOT NULL`;
  await tx.user.update({
    where: { id: user.id },
    data: {
      name: DELETED_ACCOUNT_NAME,
      email: anon,
      image: null,
      emailVerified: null,
      deletedAt: now,
    },
  });
  return { deleted: true as const };
}
