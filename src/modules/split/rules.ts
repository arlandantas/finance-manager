import { apportion } from "@/lib/apportion";
import type { DateISO } from "@/lib/dates";

/** Regra de divisão versionada por vigência (ADR-011). Funções puras, sem I/O. */
export type RuleInput = {
  id: string;
  kind: "EQUAL" | "PROPORTIONAL";
  effectiveFrom: DateISO;
  createdAt: string;
  shares: Array<{ memberId: string; bps: number }>;
};

/** SDD-002 §4.2: a regra de maior `effectiveFrom <= date`; empate => `createdAt` mais recente. */
export function ruleAt<R extends Pick<RuleInput, "effectiveFrom" | "createdAt">>(
  rules: R[],
  date: DateISO,
): R {
  let best: R | undefined;
  for (const r of rules) {
    if (r.effectiveFrom > date) continue;
    if (
      !best ||
      r.effectiveFrom > best.effectiveFrom ||
      (r.effectiveFrom === best.effectiveFrom && r.createdAt > best.createdAt)
    ) {
      best = r;
    }
  }
  if (!best) throw new RangeError("Nenhuma regra vigente para a data");
  return best;
}

/** Partes iguais em basis points (soma 10000) pelo maior resto, na ordem canônica dos membros. */
export function equalShares(
  members: Array<{ id: string; ordinal: number }>,
): Array<{ memberId: string; bps: number }> {
  if (members.length === 0) return [];
  const out = apportion(
    10000,
    members.map((m) => ({ key: m.id, weight: 1, ordinal: m.ordinal })),
  );
  return [...members]
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((m) => ({ memberId: m.id, bps: out[m.id] as number }));
}

/** "60" -> 6000 ; "33,33" -> 3333 ; "100" -> 10000 ; inválido/fora de 0..100 -> null. Sem float. */
export function parsePercentToBps(input: string): number | null {
  const s = input.replace(/%/g, "").replace(/\s/g, "");
  const m = /^(\d{1,3})(?:[,.](\d{1,2}))?$/.exec(s);
  if (!m) return null;
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0") || "0");
  return bps >= 0 && bps <= 10000 ? bps : null;
}

/** 5000 -> "50" ; 3334 -> "33,34" ; 3330 -> "33,3" (sem o símbolo %). */
export function formatBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const frac = String(bps % 100)
    .padStart(2, "0")
    .replace(/0+$/, "");
  return frac ? `${whole},${frac}` : String(whole);
}

/** "33,34% / 33,33% / 33,33%" */
export function formatBpsList(shares: Array<{ bps: number }>): string {
  return shares.map((s) => `${formatBps(s.bps)}%`).join(" / ");
}

/** `stale`: a regra vigente hoje é PROPORTIONAL e não cobre exatamente os membros atuais. */
export function isRuleStale(
  current: Pick<RuleInput, "kind" | "shares">,
  memberIds: string[],
): boolean {
  if (current.kind !== "PROPORTIONAL") return false;
  const a = new Set(current.shares.map((s) => s.memberId));
  const b = new Set(memberIds);
  return a.size !== b.size || [...a].some((id) => !b.has(id));
}
