import { z } from "zod";
import type { AnyTool } from "@/modules/mcp/run-tool";

// Ferramentas SÓ DE TESTE (as reais são a US-075/076). Servem para provar escopo, isolamento e auditoria da base.
const accountsOut = z.object({
  accounts: z.array(z.object({ id: z.string(), name: z.string(), balanceInCents: z.number() })),
});

export const consultarContas: AnyTool = {
  name: "consultar_contas",
  title: "Consultar contas",
  description: "Lista as contas da família do membro (ferramenta de teste).",
  scope: "read",
  input: z.object({ accountId: z.uuid().optional() }).strict(),
  output: accountsOut,
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  auditParams: (i: { accountId?: string }) => (i.accountId ? { accountIds: [i.accountId] } : {}),
  handler: async ({ ctx, input, tx }) => {
    const rows = await tx.bankAccount.findMany({
      where: {
        familyId: ctx.familyId,
        deletedAt: null,
        ...(input.accountId ? { id: input.accountId } : {}),
      },
      include: { transactions: { select: { amountInCents: true, direction: true } } },
    });
    if (input.accountId && rows.length === 0) {
      const { notFound } = await import("@/lib/api/errors");
      throw notFound("Conta não encontrada.");
    }
    return {
      accounts: rows.map((a) => ({
        id: a.id,
        name: a.name,
        balanceInCents: a.transactions.reduce(
          (s, t) => s + (t.direction === "CREDIT" ? 1 : -1) * Number(t.amountInCents),
          0,
        ),
      })),
    };
  },
};

export const buscarTexto: AnyTool = {
  name: "buscar_texto",
  title: "Buscar por texto",
  description: "Aceita texto livre (ferramenta de teste da auditoria).",
  scope: "read",
  input: z
    .object({ q: z.string().max(100), limit: z.number().int().min(1).max(50).optional() })
    .strict(),
  output: z.object({ ok: z.boolean() }),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  // a ferramenta "tenta" auditar o texto livre; a allowlist tem de descartar `q`
  auditParams: (i: { q: string; limit?: number }) =>
    ({ q: i.q, limit: i.limit ?? 10 }) as unknown as Record<string, never>,
  handler: async () => ({ ok: true }),
};

export const lancarTeste: AnyTool = {
  name: "lancar_teste",
  title: "Lançar (teste)",
  description: "Ferramenta de escopo write (teste); não grava nada.",
  scope: "write",
  input: z.object({ note: z.string().max(50).optional() }).strict(),
  output: z.object({ written: z.boolean() }),
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  auditParams: () => ({}),
  handler: async () => ({ written: true }),
};

export const boom: AnyTool = {
  name: "boom",
  title: "Falha interna",
  description: "Sempre falha com mensagem sensível (teste do mascaramento de erros).",
  scope: "read",
  input: z.object({}).strict(),
  output: z.object({}),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  auditParams: () => ({}),
  handler: async () => {
    throw new Error("segredo-interno: SELECT * FROM users");
  },
};

// Ferramenta de leitura que TENTA gravar: a transação READ ONLY do `runTool` tem de impedir.
export const leituraQueEscreve: AnyTool = {
  name: "leitura_que_escreve",
  title: "Leitura que tenta escrever",
  description:
    "Tenta gravar dentro de uma ferramenta de leitura (teste da transação somente leitura).",
  scope: "read",
  input: z.object({}).strict(),
  output: z.object({}),
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  auditParams: () => ({}),
  handler: async ({ ctx, tx }) => {
    await tx.systemInfo.create({ data: { key: `mcp-${ctx.requestId}`, value: "x" } });
    return {};
  },
};

export const testTools: AnyTool[] = [
  consultarContas,
  buscarTexto,
  lancarTeste,
  boom,
  leituraQueEscreve,
];
