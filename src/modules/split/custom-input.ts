import { formatBps, parsePercentToBps } from "@/modules/split/rules";

type Member = { memberId: string };

/** Texto inicial dos percentuais de "De outro jeito": parte da regra vigente (sugestão), senão vazio. */
export function initialCustomPct(
  members: Member[],
  ruleShares: Array<{ memberId: string; bps: number }> | null | undefined,
): Record<string, string> {
  return Object.fromEntries(
    members.map((m) => {
      const bps = ruleShares?.find((s) => s.memberId === m.memberId)?.bps;
      return [m.memberId, bps === undefined ? "" : formatBps(bps)];
    }),
  );
}

/** Percentuais digitados => bps por membro e a soma; texto inválido conta como 0 e marca `invalid`. */
export function customSharesOf(
  members: Member[],
  pct: Record<string, string>,
): { shares: Array<{ memberId: string; bps: number }>; sum: number; invalid: boolean } {
  let invalid = false;
  const shares = members.map((m) => {
    const raw = (pct[m.memberId] ?? "").trim();
    const bps = raw === "" ? 0 : parsePercentToBps(raw);
    if (bps === null) invalid = true;
    return { memberId: m.memberId, bps: bps ?? 0 };
  });
  return { shares, sum: shares.reduce((a, s) => a + s.bps, 0), invalid };
}

/** "Pela regra da família (50% / 50%)" (US-043); sem regra carregada, só o nome do modo. */
export function ruleModeLabel(shares: Array<{ bps: number }> | null | undefined): string {
  if (!shares || shares.length === 0) return "Pela regra da família";
  return `Pela regra da família (${shares.map((s) => `${formatBps(s.bps)}%`).join(" / ")})`;
}
