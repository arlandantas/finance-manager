import type { Tx } from "@/lib/api/types";
import type { SplitInput } from "@/modules/split/split-input";

type Mode = "NONE" | "RULE" | "CUSTOM";

/**
 * Edição do modo de divisão (US-043). `modeBefore`: linha legada (`isSharedExpense` sem modo) vale RULE.
 * `target`: `split` vence; `isSharedExpense: true` numa linha já dividida não muda nada (preserva o modo);
 * `false` vira "Só meu". `changed`: modo diferente, ou CUSTOM com percentuais diferentes (RULE sobre RULE
 * não reescreve: mudar a regra nunca altera o passado).
 */
export async function planSplitChange(
  tx: Tx,
  familyId: string,
  row: { id: string; kind: string; isSharedExpense: boolean; splitMode: Mode },
  input: { split?: SplitInput | undefined; isSharedExpense?: boolean | undefined },
): Promise<{ modeBefore: Mode; target: SplitInput | undefined; changed: boolean }> {
  const modeBefore: Mode =
    row.kind === "EXPENSE" && row.isSharedExpense
      ? row.splitMode === "NONE"
        ? "RULE"
        : row.splitMode
      : "NONE";
  const target: SplitInput | undefined =
    input.split ??
    (input.isSharedExpense === undefined
      ? undefined
      : input.isSharedExpense
        ? modeBefore === "NONE"
          ? { mode: "RULE" }
          : undefined
        : { mode: "NONE" });
  if (!target) return { modeBefore, target, changed: false };
  if (target.mode !== modeBefore) return { modeBefore, target, changed: true };
  if (target.mode !== "CUSTOM") return { modeBefore, target, changed: false };
  const rows = await tx.transactionSplit.findMany({ where: { familyId, transactionId: row.id } });
  const now = new Map(rows.filter((r) => r.bps > 0).map((r) => [r.memberId, r.bps]));
  const wanted = target.shares.filter((s) => s.bps > 0);
  const same = wanted.length === now.size && wanted.every((s) => now.get(s.memberId) === s.bps);
  return { modeBefore, target, changed: !same };
}

export const SPLIT_MODE_LABEL: Record<Mode, string> = {
  NONE: "Só meu",
  RULE: "Pela regra da família",
  CUSTOM: "De outro jeito",
};
