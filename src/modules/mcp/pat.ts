import { z } from "zod";
import { ApiError, conflict, forbidden, notFound } from "@/lib/api/errors";
import type { ApiResult, RequestContext, Tx } from "@/lib/api/types";
import { recordAudit } from "@/modules/mcp/audit";
import {
  canonicalResource,
  mcpPatEnabled,
  PAT_CLIENT_NAME,
  PAT_CREATE_PER_DAY,
  PAT_DEFAULT_VALIDITY_DAYS,
  PAT_MAX_ACTIVE,
} from "@/modules/mcp/config";
import { toConnectionDTO } from "@/modules/mcp/connections";
import { notifyNewConnection } from "@/modules/mcp/new-connection";
import { hit } from "@/modules/mcp/rate-limit";
import { newTokenValue } from "@/modules/mcp/tokens";

// US-074b (ADR-043): token pessoal para clientes MCP locais sem OAuth. O valor só existe na resposta da criação.
const DAY_MS = 86_400_000;

const label = z
  .string()
  // saneia: sem caracteres de controle/formatação, espaços aparados
  .transform((s) => s.replace(/[\p{Cc}\p{Cf}]/gu, "").trim())
  .pipe(z.string().min(1, "Informe um nome").max(40, "Nome muito longo (máx. 40)"));

export const CreatePatSchema = z
  .object({
    label,
    validityDays: z
      .union([z.literal(7), z.literal(30), z.literal(90)])
      .default(PAT_DEFAULT_VALIDITY_DAYS),
    allowWrite: z.boolean().optional(),
    writeAcknowledged: z.literal(true).optional(),
  })
  .strict()
  .refine((v) => !v.allowWrite || v.writeAcknowledged === true, {
    message: "Confirme a ciência para permitir lançamentos",
    path: ["writeAcknowledged"],
  });
export type CreatePatInput = z.infer<typeof CreatePatSchema>;

/** Idempotência (ADR-009): guarda a conexão, nunca o token. */
export function redactPatBody(body: unknown): unknown {
  const b = (body ?? {}) as { connection?: unknown };
  return { connection: b.connection, tokenRedacted: true };
}

/** Antes da transação: chave do servidor (404) e 10 criações por dia por membro (429). */
export async function assertPatCreationAllowed(
  ctx: RequestContext,
  db: Parameters<typeof hit>[0],
  env: Record<string, string | undefined> = process.env,
): Promise<void> {
  if (!mcpPatEnabled(env)) throw notFound();
  const r = await hit(
    db,
    `pat-create:${ctx.memberId}:day`,
    PAT_CREATE_PER_DAY,
    86_400,
    ctx.clock.now(),
  );
  if (!r.ok) {
    throw new ApiError(429, "RATE_LIMITED", "Limite diário de tokens atingido. Tente amanhã.", {
      retryAfterSeconds: r.retryAfterS,
    });
  }
}

export async function createPat(
  tx: Tx,
  ctx: RequestContext,
  input: CreatePatInput,
  env: Record<string, string | undefined> = process.env,
): Promise<ApiResult> {
  if (!mcpPatEnabled(env)) throw notFound();
  const now = ctx.clock.now();
  const fam = await tx.$queryRaw<
    Array<{ access: boolean; pat: boolean }>
  >`SELECT "assistantAccessEnabled" AS access, "assistantPatEnabled" AS pat FROM families
    WHERE id = ${ctx.familyId}::uuid FOR SHARE`;
  if (!fam[0]?.access)
    throw forbidden("O acesso por assistente está bloqueado", "ASSISTANT_BLOCKED");
  if (!fam[0].pat)
    throw forbidden("O token pessoal não está liberado para a família", "PAT_DISABLED");

  // trava o membro: duas criações simultâneas não passam do teto
  await tx.$queryRaw`SELECT id FROM members WHERE id = ${ctx.memberId}::uuid FOR UPDATE`;
  const active = await tx.mcpGrant.count({
    where: { memberId: ctx.memberId, kind: "PAT", status: "ACTIVE", expiresAt: { gt: now } },
  });
  if (active >= PAT_MAX_ACTIVE) {
    throw conflict(
      "PAT_LIMIT_REACHED",
      `Você já tem ${PAT_MAX_ACTIVE} tokens ativos. Revogue um para criar outro.`,
    );
  }

  const write = input.allowWrite === true;
  const scopes = write ? ["read", "write"] : ["read"];
  const grant = await tx.mcpGrant.create({
    data: {
      familyId: ctx.familyId,
      memberId: ctx.memberId,
      userId: ctx.userId,
      kind: "PAT",
      clientId: null,
      label: input.label,
      scopes,
      resource: canonicalResource(env),
      expiresAt: new Date(now.getTime() + input.validityDays * DAY_MS),
      requireConfirmation: write, // ADR-043 §9: escrita nasce com confirmação
    },
    include: { client: { select: { clientName: true, redirectUris: true } } },
  });
  const pat = newTokenValue("PAT");
  await tx.mcpToken.create({
    data: { grantId: grant.id, kind: "PAT", tokenHash: pat.hash, expiresAt: grant.expiresAt },
  });
  await recordAudit(tx, {
    familyId: ctx.familyId,
    memberId: ctx.memberId,
    grantId: grant.id,
    clientName: PAT_CLIENT_NAME,
    kind: "CONNECTED",
    params: {
      type: "PAT",
      validityDays: input.validityDays,
      scopes,
      ...(write ? { writeAcknowledged: true } : {}),
    },
    outcome: "OK",
    at: now,
  });
  return {
    status: 201,
    body: { connection: toConnectionDTO(grant, now), token: pat.value },
    headers: { "Cache-Control": "no-store" },
    afterCommit: async () => {
      await notifyNewConnection(ctx, grant.id);
      return undefined;
    },
  };
}
