import { z } from "zod";
import { dateISOSchema } from "@/lib/dates";
import { uuidSchema } from "@/lib/schemas";
import { DESCRIPTION_MSG } from "@/modules/transacoes/schemas";

// Campos comuns de `lancar_despesa` e `propor_lancamento` (US-076c): mesma forma, mesmas validações.
const hasControlChar = (s: string) =>
  [...s].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

export const expenseShape = {
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
} as const;

/** Exatamente um entre conta e cartão. */
export function refineSource(
  v: { accountId?: string | undefined; cardId?: string | undefined },
  c: z.RefinementCtx,
) {
  if (!v.accountId && !v.cardId) {
    c.addIssue({ code: "custom", path: ["accountId"], message: "Escolha uma conta ou um cartão" });
  }
  if (v.accountId && v.cardId) {
    c.addIssue({
      code: "custom",
      path: ["cardId"],
      message: "Informe a conta ou o cartão, não os dois",
    });
  }
}
