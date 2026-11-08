import { z } from "zod";
import { notFound } from "@/lib/api/errors";
import { toCents } from "@/lib/money";
import { uuidSchema } from "@/lib/schemas";
import { effectiveStatus } from "@/modules/mcp/proposals";
import type { AnyTool } from "@/modules/mcp/run-tool";
import { MoneySchema, money, READ_ANNOTATIONS } from "@/modules/mcp/tools/common";

// US-076c: consulta o estado de uma proposta da própria conexão. Não expõe descrição nem nomes.
const Output = z
  .object({
    proposalId: z.string(),
    status: z.enum(["PENDING", "CONFIRMED", "REJECTED", "EXPIRED"]),
    amount: MoneySchema,
    expiresAt: z.string(),
    transactionId: z.string().nullable(),
  })
  .strict();

export const consultarPropostaTool: AnyTool = {
  name: "consultar_proposta",
  title: "Consultar proposta",
  description:
    "Mostra se uma proposta criada por propor_lancamento foi confirmada, recusada ou expirou. Só leitura; não confirma nada.",
  // escopo `write` (só quem pode propor consulta a proposta); conexão só de consulta continua vendo as 7 de leitura
  scope: "write",
  input: z
    .object({ proposalId: uuidSchema.describe("Id devolvido por propor_lancamento.") })
    .strict(),
  output: Output,
  annotations: READ_ANNOTATIONS,
  auditParams: () => ({}),
  proposalIdOf: (o: { proposalId: string }) => o.proposalId,
  handler: async ({ ctx, tx, input }) => {
    const p = await tx.assistantProposal.findFirst({
      where: { id: input.proposalId, familyId: ctx.familyId, grantId: ctx.grantId },
    });
    if (!p) throw notFound("Proposta não encontrada.");
    return {
      proposalId: p.id,
      status: effectiveStatus(p, ctx.clock.now()),
      amount: money(toCents(p.amountInCents)),
      expiresAt: p.expiresAt.toISOString(),
      transactionId: p.transactionId,
    };
  },
};
