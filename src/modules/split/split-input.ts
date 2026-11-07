import { z } from "zod";
import { uuidSchema } from "@/lib/schemas";

/** Mensagem única da soma dos percentuais do modo "De outro jeito" (US-043). */
export const SPLIT_SUM_MSG = "Os percentuais precisam somar 100%";

/**
 * Modo de divisão no lançamento/previsão (US-043, ADR-016): "Só meu" (NONE), "Pela regra" (RULE, regra vigente
 * na data) ou "De outro jeito" (CUSTOM, percentuais em bps escolhidos agora; 0% e 100% valem).
 */
export const SplitInputSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("NONE") }).strict(),
  z.object({ mode: z.literal("RULE") }).strict(),
  z
    .object({
      mode: z.literal("CUSTOM"),
      shares: z
        .array(
          z
            .object({
              memberId: uuidSchema,
              bps: z.number().int().min(0).max(10000),
            })
            .strict(),
        )
        .min(2, "Informe o percentual de ao menos dois membros"),
    })
    .strict()
    .superRefine((v, c) => {
      if (new Set(v.shares.map((s) => s.memberId)).size !== v.shares.length) {
        c.addIssue({ code: "custom", path: ["shares"], message: "Membro repetido no rateio" });
      }
      if (v.shares.reduce((a, s) => a + s.bps, 0) !== 10000) {
        c.addIssue({ code: "custom", path: ["shares"], message: SPLIT_SUM_MSG });
      }
    }),
]);
export type SplitInput = z.infer<typeof SplitInputSchema>;

export const SPLIT_XOR_MSG = "Informe split ou isSharedExpense, não os dois";

/** `split` e `isSharedExpense` juntos => 400 (contrato da US-043). */
export function refineSplitXor(
  v: { split?: unknown; isSharedExpense?: unknown },
  c: { addIssue: (i: { code: "custom"; path: string[]; message: string }) => void },
) {
  if (v.split !== undefined && v.isSharedExpense !== undefined) {
    c.addIssue({ code: "custom", path: ["split"], message: SPLIT_XOR_MSG });
  }
}

/** Modo efetivo de um corpo de escrita: `split` vence; legado `isSharedExpense: true` == RULE; ausente == NONE. */
export function splitOf(i: {
  split?: SplitInput | undefined;
  isSharedExpense?: boolean | undefined;
}): SplitInput {
  if (i.split) return i.split;
  return i.isSharedExpense ? { mode: "RULE" } : { mode: "NONE" };
}
