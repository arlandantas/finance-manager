import type { McpAuditKind, McpAuditOutcome, PrismaClient } from "@/generated/prisma/client";

// SDD-024 §7: auditoria append-only SEM conteúdo. `params` só aceita chaves de uma allowlist global;
// nunca `q`, descrição, valores nem texto livre.
export const AUDIT_PARAM_KEYS = [
  "period",
  "from",
  "to",
  "accountIds",
  "cardIds",
  "categoryIds",
  "type",
  "page",
  "limit",
  "cardId",
  "origin",
  "proposalId",
  // alteração de limites (LIMITS_CHANGED): campo e valores (configuração do membro; "none" = sem limite)
  "field",
  // eventos de conexão/revogação (não são ferramentas)
  "validityDays",
  "scopes",
  "writeAcknowledged",
  "reason",
] as const;

export type AuditParams = Partial<
  Record<(typeof AUDIT_PARAM_KEYS)[number], string | number | boolean | string[]>
>;

const ALLOWED = new Set<string>(AUDIT_PARAM_KEYS);

/** Defesa em profundidade: descarta chaves fora da allowlist e valores que não sejam escalares curtos. */
export function sanitizeAuditParams(params: Record<string, unknown> | undefined): AuditParams {
  const out: Record<string, string | number | boolean | string[]> = {};
  for (const [k, v] of Object.entries(params ?? {})) {
    if (!ALLOWED.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 100);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
      out[k] = (v as string[]).slice(0, 50).map((x) => x.slice(0, 100));
    }
  }
  return out;
}

export type AuditInput = {
  familyId: string;
  memberId: string;
  grantId: string | null;
  clientName: string;
  kind: McpAuditKind;
  tool?: string | null;
  params?: Record<string, unknown>;
  outcome: McpAuditOutcome;
  errorCode?: string | null;
  transactionId?: string | null;
  proposalId?: string | null;
  durationMs?: number;
  at?: Date;
};

export async function recordAudit(db: Pick<PrismaClient, "mcpAuditEvent">, e: AuditInput) {
  return db.mcpAuditEvent.create({
    data: {
      familyId: e.familyId,
      memberId: e.memberId,
      grantId: e.grantId,
      clientName: e.clientName.slice(0, 80),
      kind: e.kind,
      tool: e.tool ?? null,
      params: sanitizeAuditParams(e.params),
      outcome: e.outcome,
      errorCode: e.errorCode ?? null,
      transactionId: e.transactionId ?? null,
      proposalId: e.proposalId ?? null,
      durationMs: Math.max(0, Math.round(e.durationMs ?? 0)),
      ...(e.at ? { createdAt: e.at } : {}),
    },
  });
}
