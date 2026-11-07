import { z } from "zod";
import { dateISOSchema } from "@/lib/dates";
import { periodKeySchema } from "@/lib/schemas";
import {
  boolParam,
  idListParam,
  lastDayOfWindow,
  UNTAGGED_WITH_TAGS_MSG,
} from "@/modules/transacoes/schemas";

/** US-048 (ADR-022): consulta da visão sintética. US-049: quebras por membro, conta/cartão e tag. */
export const AnalysisQuerySchema = z
  .object({
    period: periodKeySchema.optional(), // padrão: período corrente
    from: dateISOSchema.optional(),
    to: dateISOSchema.optional(),
    groupBy: z.enum(["category", "member", "account", "tag"]).default("category"),
    type: z.enum(["EXPENSE", "INCOME"]).default("EXPENSE"),
    categoryIds: idListParam.optional(),
    payerIds: idListParam.optional(),
    sourceIds: idListParam.optional(),
    tagIds: idListParam.optional(),
    untagged: boolParam.optional(),
  })
  .strict()
  .refine((v) => !(v.period && (v.from || v.to)), { message: "Use period ou from/to, não ambos" })
  .refine((v) => (v.from == null) === (v.to == null), { message: "Informe from e to juntos" })
  .refine((v) => !v.from || !v.to || v.from <= v.to, { message: "Intervalo inválido" })
  .refine((v) => !v.from || !v.to || v.from > v.to || v.to <= lastDayOfWindow(v.from), {
    message: "Escolha um intervalo de até 24 meses",
  })
  .refine((v) => !(v.untagged === true && v.tagIds && v.tagIds.length > 0), {
    message: UNTAGGED_WITH_TAGS_MSG,
    path: ["untagged"],
  });
export type AnalysisQuery = z.output<typeof AnalysisQuerySchema>;

export type AnalysisGroupBy = AnalysisQuery["groupBy"];

export type AnalysisRowDTO = {
  key: string;
  kind: "CATEGORY" | "MEMBER" | "ACCOUNT" | "CARD" | "TAG" | "NO_TAG";
  label: string;
  archived: boolean;
  amountInCents: number;
  count: number;
  permille: number | null; // participação em 1/1000 (soma exata 1000); null sem valor
  drillUrl: string;
};

export type AnalysisDTO = {
  period: { key: string; start: string; end: string; isCurrent: boolean };
  totals: { incomeInCents: number; expenseInCents: number; resultInCents: number; count: number };
  groupBy: AnalysisGroupBy;
  type: "EXPENSE" | "INCOME";
  rows: AnalysisRowDTO[];
  rowsTotalInCents: number;
  tagOverlapNotice: boolean; // quebra por tag: linhas somam mais que o total do lado
  isEmpty: boolean;
};
