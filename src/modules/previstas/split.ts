import type { Tx } from "@/lib/api/types";
import type { SplitInput } from "@/modules/split/split-input";
import { resolveCustomSplit } from "@/modules/split/write";

type Mode = "NONE" | "RULE" | "CUSTOM";
type Shares = Array<{ memberId: string; bps: number }>;

/** Lê o JSON gravado em `splitShares` (só CUSTOM). */
export function sharesOf(json: unknown): Shares {
  return Array.isArray(json) ? (json as Shares) : [];
}

/** Modo efetivo da previsão: ocorrência de série e legado dividida sem modo valem RULE (US-043). */
export function plannedModeOf(row: { isSharedExpense: boolean; splitMode: Mode }): Mode {
  return row.isSharedExpense ? (row.splitMode === "NONE" ? "RULE" : row.splitMode) : "NONE";
}

export function plannedSplitDto(row: {
  isSharedExpense: boolean;
  splitMode: Mode;
  splitShares: unknown;
}): { mode: "RULE" | "CUSTOM"; shares: Shares } | null {
  const mode = plannedModeOf(row);
  if (mode === "NONE") return null;
  return { mode, shares: mode === "CUSTOM" ? sharesOf(row.splitShares) : [] };
}

/** Colunas a gravar para o modo pedido; CUSTOM confere os membros ativos (422 SHARES_MEMBER_MISMATCH). */
export async function plannedSplitColumns(
  tx: Tx,
  familyId: string,
  split: SplitInput,
): Promise<{ isSharedExpense: boolean; splitMode: Mode; splitShares: Shares | null }> {
  if (split.mode === "CUSTOM") await resolveCustomSplit(tx, familyId, split);
  return {
    isSharedExpense: split.mode !== "NONE",
    splitMode: split.mode,
    splitShares: split.mode === "CUSTOM" ? split.shares : null,
  };
}

/** Mesmo conjunto de percentuais (ordem irrelevante)? */
export function sameShares(a: Shares, b: Shares): boolean {
  const m = new Map(a.filter((s) => s.bps > 0).map((s) => [s.memberId, s.bps]));
  const w = b.filter((s) => s.bps > 0);
  return w.length === m.size && w.every((s) => m.get(s.memberId) === s.bps);
}
