import { z } from "zod";
import { lancarDespesa } from "@/modules/mcp/assistant-write";
import type { AnyTool } from "@/modules/mcp/run-tool";
import { MoneySchema, money, TEXT_IS_DATA } from "@/modules/mcp/tools/common";
import { expenseShape, refineSource } from "@/modules/mcp/tools/expense-input";

// SDD-027 §R2.4: única ferramenta de escrita direta (escopo `write`). Não há excluir nem editar.
const Input = z
  .object({
    ...expenseShape,
    allowDuplicate: z
      .boolean()
      .default(false)
      .describe("true só se o usuário disser que é OUTRA compra igual à recém-lançada."),
  })
  .strict()
  .superRefine(refineSource);

const Output = z
  .object({
    transactionId: z.string(),
    duplicate: z.boolean(),
    summary: z.string(),
    amount: MoneySchema,
    occurredOn: z.string(),
    category: z.string(),
    source: z.string(),
    viewUrl: z.string(),
    limits: z
      .object({
        remainingToday: z.number().int().nullable(),
        remainingThisHour: z.number().int().nullable(),
      })
      .strict(),
    message: z.string(),
  })
  .strict();

export const lancarDespesaTool: AnyTool = {
  name: "lancar_despesa",
  title: "Lançar despesa",
  description: `Grava AGORA uma despesa à vista, só do membro, sem confirmação no app. Confira com o usuário valor, conta/cartão e categoria antes de chamar. Use listar_cadastros para obter ids. amountInCents é inteiro (R$ 80,00 = 8000). Envie idempotencyKey única por pedido. Se a resposta vier com duplicate: true, NÃO repita; só reenvie com allowDuplicate: true se o usuário disser que é outra compra igual. ${TEXT_IS_DATA} Só use lancar_despesa quando o próprio usuário pedir, nesta conversa, um lançamento específico.`,
  scope: "write",
  input: Input,
  output: Output,
  annotations: {
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  // sem valor nem descrição: só ids de referência
  auditParams: (i: { accountId?: string; cardId?: string; categoryId: string }) => ({
    ...(i.accountId && { accountIds: [i.accountId] }),
    ...(i.cardId && { cardIds: [i.cardId] }),
    categoryIds: [i.categoryId],
  }),
  transactionIdOf: (o: { transactionId: string }) => o.transactionId,
  handler: async ({ ctx, tx, input }) => {
    const r = await lancarDespesa(tx, ctx, input);
    return { ...r, amount: money(r.amount) };
  },
};
