import { formatBpsList } from "@/modules/split/rules";

/** Rótulo do interruptor "Dividir com a família" (US-030): "Só meu" ou a regra vigente com os percentuais. */
export function splitSwitchLabel(
  on: boolean,
  shares: Array<{ bps: number }> | null | undefined,
): string {
  if (!on) return "Só meu";
  if (!shares || shares.length === 0) return "Divisão pela regra da família";
  const equal = shares.every((s) => Math.abs(s.bps - (shares[0]?.bps ?? 0)) <= 1);
  return `${equal ? "Divisão igual" : "Divisão proporcional"} (${formatBpsList(shares)})`;
}
