import type { z } from "zod";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import { logger } from "@/lib/logger";
import { type AuditParams, recordAudit } from "@/modules/mcp/audit";
import type { McpScope } from "@/modules/mcp/config";
import type { McpContext } from "@/modules/mcp/context";
import { hit } from "@/modules/mcp/rate-limit";

// SDD-024 §5.3: execução de ferramenta. Escopo -> entrada -> limite próprio -> transação -> saída validada
// (allowlist) -> auditoria ANTES de devolver. Nenhum erro interno vaza para o assistente.
type Tx = Prisma.TransactionClient;

export type ToolDef<I = unknown, O = unknown> = {
  name: string;
  title: string;
  description: string;
  scope: McpScope;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: false;
    idempotentHint: boolean;
    openWorldHint: false;
  };
  /** Só chaves da allowlist de `audit.ts`; nunca texto livre. */
  auditParams: (input: I) => AuditParams;
  handler: (args: { ctx: McpContext; input: I; tx: Tx }) => Promise<O>;
  rateKey?: (ctx: McpContext) => { key: string; limit: number; windowS: number };
  /** Mesmo `prepare` da rota da tela (ex.: horizonte da recorrência), ANTES da transação da ferramenta. */
  prepare?: (ctx: McpContext, db: PrismaClient) => Promise<void>;
  /** Mesmo nível de isolamento da rota da tela (Resumo do Mês é `RepeatableRead`). */
  isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable";
  /** Ferramentas que gravam informam o lançamento criado para a auditoria. */
  transactionIdOf?: (output: O) => string | null;
};

export type AnyTool = ToolDef<any, any>;

export type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  _meta?: Record<string, unknown>;
};

export const INSUFFICIENT_SCOPE_MESSAGE = "sem permissão de lançamento";

export function toolError(
  code: string,
  message: string,
  meta?: Record<string, unknown>,
): ToolResult {
  const error = { code, message };
  return {
    content: [{ type: "text", text: JSON.stringify({ error }) }],
    structuredContent: { error },
    isError: true,
    ...(meta ? { _meta: meta } : {}),
  };
}

export function scopeAllows(ctx: Pick<McpContext, "scopes">, scope: McpScope): boolean {
  return ctx.scopes.includes(scope);
}

export function scopeDeniedResult(wwwAuthenticate: string): ToolResult {
  return toolError("INSUFFICIENT_SCOPE", INSUFFICIENT_SCOPE_MESSAGE, {
    "mcp/www_authenticate": [wwwAuthenticate],
  });
}

export async function runTool(
  db: PrismaClient,
  ctx: McpContext,
  def: AnyTool,
  rawInput: unknown,
  opts: { wwwAuthenticateInsufficientScope: string },
): Promise<ToolResult> {
  const started = Date.now();
  const clock = ctx.clock;
  const audit = (
    outcome: "OK" | "DENIED_SCOPE" | "INVALID" | "RATE_LIMITED" | "ERROR" | "LIMIT_EXCEEDED",
    extra: { errorCode?: string; params?: AuditParams; transactionId?: string | null } = {},
  ) =>
    recordAudit(db, {
      familyId: ctx.familyId,
      memberId: ctx.memberId,
      grantId: ctx.grantId,
      clientName: ctx.clientName,
      kind: "TOOL",
      tool: def.name,
      outcome,
      ...(extra.errorCode ? { errorCode: extra.errorCode } : {}),
      ...(extra.params ? { params: extra.params } : {}),
      ...(extra.transactionId ? { transactionId: extra.transactionId } : {}),
      durationMs: Date.now() - started,
      at: clock.now(),
    });
  const internal = () => toolError("INTERNAL", "Erro inesperado. Tente novamente em instantes.");

  try {
    if (!scopeAllows(ctx, def.scope)) {
      await audit("DENIED_SCOPE", { errorCode: "INSUFFICIENT_SCOPE" });
      return scopeDeniedResult(opts.wwwAuthenticateInsufficientScope);
    }
    const parsed = def.input.safeParse(rawInput ?? {});
    if (!parsed.success) {
      await audit("INVALID", { errorCode: "VALIDATION_ERROR" });
      return toolError(
        "VALIDATION_ERROR",
        parsed.error.issues[0]?.message ?? "Parâmetros inválidos.",
      );
    }
    if (def.rateKey) {
      const r = def.rateKey(ctx);
      const h = await hit(db, r.key, r.limit, r.windowS, clock.now());
      if (!h.ok) {
        await audit("RATE_LIMITED", { errorCode: "RATE_LIMITED" });
        return toolError("RATE_LIMITED", "Limite de uso excedido. Tente novamente mais tarde.");
      }
    }
    const params = def.auditParams(parsed.data);
    let output: unknown;
    try {
      if (def.prepare) await def.prepare(ctx, db);
      output = await db.$transaction(
        async (tx) => {
          if (def.scope === "read") await tx.$executeRaw`SET TRANSACTION READ ONLY`;
          const out = await def.handler({ ctx, input: parsed.data, tx });
          return def.output.parse(out);
        },
        {
          maxWait: 5_000,
          timeout: 10_000,
          ...(def.isolationLevel ? { isolationLevel: def.isolationLevel } : {}),
        },
      );
    } catch (e) {
      if (e instanceof ApiError) {
        await audit(e.status === 400 || e.status === 422 ? "INVALID" : "ERROR", {
          errorCode: e.code,
          params,
        });
        return toolError(e.code, e.message);
      }
      logger.error({ tool: def.name, err: e instanceof Error ? e.message : "erro" }, "mcp tool");
      await audit("ERROR", { errorCode: "INTERNAL", params });
      return internal();
    }
    // auditoria antes de devolver: se não for possível registrar, nada é devolvido
    await audit("OK", { params, transactionId: def.transactionIdOf?.(output) ?? null });
    return {
      content: [{ type: "text", text: JSON.stringify(output) }],
      structuredContent: output as Record<string, unknown>,
    };
  } catch (e) {
    logger.error(
      { tool: def.name, err: e instanceof Error ? e.message : "erro" },
      "mcp audit/internal",
    );
    return internal();
  }
}
