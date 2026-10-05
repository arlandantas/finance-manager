import { apportion } from "@/lib/apportion";
import type { Period } from "@/lib/period";
import type { RuleInput } from "@/modules/split/rules";
import { isPresent, type MemberInput } from "@/modules/split/settlement-common";
import { legacyGroupWeights } from "@/modules/split/settlement-legacy";

/**
 * Rateio por lançamento (EN-002a, ADR-016 §2, SDD-015 §4.1). PURO: centavos inteiros (BigInt interno).
 * `bps` é a intenção ("58% / 42%"); o valor debitado da cota sai de `splitAmount`.
 */
export type ShareInput = { memberId: string; bps: number; ordinal: number };

/**
 * `base_m = ⌊amount × bps_m ÷ 10000⌋`; a sobra (0..P-1 centavos, P = participantes com bps > 0):
 * pagador com bps > 0 recebe TODA a sobra; senão, 1 centavo para cada um dos `sobra` participantes de
 * MAIOR resto (`amount × bps mod 10000`; desempate: menor ordinal). A ordem de `shares` não importa.
 */
export function splitAmount(i: {
  amountInCents: number;
  shares: ShareInput[];
  payerMemberId: string;
}): Record<string, number> {
  const amount = BigInt(i.amountInCents);
  const shares = [...i.shares].sort((a, b) => a.ordinal - b.ordinal);
  const rows = shares.map((s) => {
    const raw = amount * BigInt(s.bps);
    return {
      memberId: s.memberId,
      bps: s.bps,
      ordinal: s.ordinal,
      base: raw / 10000n,
      rem: raw % 10000n,
    };
  });
  const sobra = Number(amount - rows.reduce((acc, r) => acc + r.base, 0n));
  const out: Record<string, number> = {};
  for (const r of rows) out[r.memberId] = Number(r.base);
  if (sobra > 0) {
    const payer = rows.find((r) => r.memberId === i.payerMemberId && r.bps > 0);
    if (payer) {
      out[payer.memberId] = (out[payer.memberId] as number) + sobra;
    } else {
      const byRemainder = rows
        .filter((r) => r.bps > 0)
        .sort((a, b) => (a.rem === b.rem ? a.ordinal - b.ordinal : a.rem > b.rem ? -1 : 1));
      for (const r of byRemainder.slice(0, sobra))
        out[r.memberId] = (out[r.memberId] as number) + 1;
    }
  }
  return out;
}

/**
 * Vetor de "Pela regra" para um lançamento NOVO (SDD-015 §4.2, TL-18): os pesos do motor LEGACY para o
 * período do lançamento (membros presentes) e `bps = apportion(10000, pesos)`. Só entram pesos > 0.
 */
export function resolveRuleShares(i: {
  rule: RuleInput;
  members: MemberInput[];
  period: Pick<Period, "start" | "end">;
}): ShareInput[] {
  const present = [...i.members]
    .filter((m) => isPresent(m, i.period))
    .sort((a, b) => a.ordinal - b.ordinal || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const weights = legacyGroupWeights({ rule: i.rule, members: present, period: i.period }).filter(
    (w) => w.weight > 0,
  );
  const bps = apportion(10000, weights);
  return weights.map((w) => ({ memberId: w.key, bps: bps[w.key] as number, ordinal: w.ordinal }));
}
