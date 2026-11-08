import { z } from "zod";
import { issuerOf } from "@/modules/mcp/config";
import { proposeExpense } from "@/modules/mcp/proposals";
import type { AnyTool } from "@/modules/mcp/run-tool";
import { MoneySchema, money, TEXT_IS_DATA } from "@/modules/mcp/tools/common";
import { expenseShape, refineSource } from "@/modules/mcp/tools/expense-input";

// US-076c: só PROPÕE. Não existe ferramenta para confirmar: quem decide é o membro, no app.
const Input = z
  .object({ ...expenseShape })
  .strict()
  .superRefine(refineSource);

const Output = z
  .object({
    proposalId: z.string(),
    status: z.enum(["PENDING", "CONFIRMED", "REJECTED", "EXPIRED"]),
    duplicate: z.boolean(),
    amount: MoneySchema,
    expiresAt: z.string(),
    reviewUrl: z.string(),
    message: z.string(),
  })
  .strict();

export const proporLancamentoTool: AnyTool = {
  name: "propor_lancamento",
  title: "Propor lançamento de despesa",
  description: `Cria uma PROPOSTA de despesa à vista, só do membro. Nada é lançado: o usuário precisa confirmar no app (reviewUrl) em até 30 minutos. Use apenas quando a conexão exigir confirmação (lancar_despesa avisa). Confira com o usuário valor, conta/cartão e categoria antes; use listar_cadastros para obter ids. amountInCents é inteiro (R$ 80,00 = 8000). Envie idempotencyKey única por pedido e, depois, diga ao usuário para abrir o link. ${TEXT_IS_DATA}`,
  scope: "write",
  input: Input,
  output: Output,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  // só ids de referência: nunca valor nem descrição
  auditParams: (i: { accountId?: string; cardId?: string; categoryId: string }) => ({
    ...(i.accountId && { accountIds: [i.accountId] }),
    ...(i.cardId && { cardIds: [i.cardId] }),
    categoryIds: [i.categoryId],
  }),
  proposalIdOf: (o: { proposalId: string }) => o.proposalId,
  handler: async ({ ctx, tx, input }) => {
    const r = await proposeExpense(tx, ctx, input);
    return {
      proposalId: r.proposalId,
      status: r.status,
      duplicate: r.duplicate,
      amount: money(r.amount),
      expiresAt: r.expiresAt.toISOString(),
      reviewUrl: `${issuerOf()}/assistente/propostas/${r.proposalId}`,
      message: r.duplicate
        ? "Esta proposta já existe. Peça ao usuário para conferir no app."
        : "Proposta criada. NADA foi lançado: peça ao usuário para confirmar no app pelo link, em até 30 minutos.",
    };
  },
};
