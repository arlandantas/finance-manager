import { z } from "zod";
import { dateISOSchema } from "@/lib/dates";
import { uuidSchema } from "@/lib/schemas";
import { lancarDespesa } from "@/modules/mcp/assistant-write";
import type { AnyTool } from "@/modules/mcp/run-tool";
import { MoneySchema, money, TEXT_IS_DATA } from "@/modules/mcp/tools/common";
import { DESCRIPTION_MSG } from "@/modules/transacoes/schemas";

// SDD-027 §R2.4: única ferramenta de escrita do POC (escopo `write`). Não há excluir nem editar.
const hasControlChar = (s: string) =>
  [...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

const Input = z
  .object({
    description: z
      .string()
      .transform((s) => s.normalize("NFKC").trim())
      .pipe(
        z
          .string()
          .min(2, DESCRIPTION_MSG)
          .max(100, DESCRIPTION_MSG)
          .refine((s) => !hasControlChar(s), "A descrição não pode ter caracteres de controle"),
      )
      .describe("O que foi comprado (2 a 100 caracteres)."),
    amountInCents: z
      .number({ error: "valor inválido: informe um inteiro em centavos maior que zero" })
      .int("valor inválido: informe um inteiro em centavos maior que zero")
      .positive("valor inválido: informe um inteiro em centavos maior que zero")
      .max(9_999_999_999, "valor inválido: acima do limite permitido")
      .describe("Valor em centavos, inteiro: R$ 80,00 = 8000."),
    categoryId: uuidSchema.describe("Id de uma categoria de despesa (listar_cadastros)."),
    accountId: uuidSchema.optional().describe("Id da conta. Informe a conta OU o cartão."),
    cardId: uuidSchema.optional().describe("Id do cartão. Informe a conta OU o cartão."),
    occurredOn: dateISOSchema
      .optional()
      .describe("AAAA-MM-DD; padrão: hoje; no máximo 60 dias atrás."),
    idempotencyKey: z
      .string()
      .regex(/^[A-Za-z0-9_-]{8,64}$/, "idempotencyKey: use 8 a 64 letras, números, _ ou -")
      .optional()
      .describe("Chave única por pedido (8 a 64 caracteres) para evitar lançar duas vezes."),
    allowDuplicate: z
      .boolean()
      .default(false)
      .describe("true só se o usuário disser que é OUTRA compra igual à recém-lançada."),
  })
  .strict()
  .superRefine((v, c) => {
    if (!v.accountId && !v.cardId) {
      c.addIssue({
        code: "custom",
        path: ["accountId"],
        message: "Escolha uma conta ou um cartão",
      });
    }
    if (v.accountId && v.cardId) {
      c.addIssue({
        code: "custom",
        path: ["cardId"],
        message: "Informe a conta ou o cartão, não os dois",
      });
    }
  });

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
