import { apportion } from "@/lib/apportion";
import type { Period } from "@/lib/period";
import type { RuleInput } from "@/modules/split/rules";
import { isPresent, type MemberInput } from "@/modules/split/settlement-common";
import { legacyGroupWeights } from "@/modules/split/settlement-legacy";

/**
 * Rateio por lançamento (EN-002a, ADR-016 §2, SDD-015 §4.1). PURO: centavos inteiros (BigInt interno).
 * `bps` é a intenção ("58% / 42%"); o valor debitado da cota sai de `splitAmount`.
 */
export type ShareInput = {
  memberId: string;
  bps: number;
  ordinal: number;
  /**
   * Peso EXATO do rateio quando o vetor em `bps` não é exato (regra EQUAL com N que não divide 10000, ex.: 3
   * membros ⇒ 3334/3333/3333): os centavos saem de `weight` para que "igual" continue igual (30000 × 3 em
   * 90000). Ausente ⇒ `bps` (Σ = 10000, caso do modo CUSTOM). Desvio registrado em DEV-49.
   */
  weight?: number;
};

/**
 * `base_m = ⌊amount × w_m ÷ W⌋` com `w = weight ?? bps` e `W = Σ w` (com `bps`, `W = 10000`); a sobra
 * (0..P-1 centavos, P = participantes com peso > 0): pagador com peso > 0 recebe TODA a sobra; senão,
 * 1 centavo para cada um dos `sobra` participantes de MAIOR resto (`amount × w mod W`; desempate: menor
 * ordinal). A ordem de `shares` não importa.
 */
export function splitAmount(i: {
  amountInCents: number;
  shares: ShareInput[];
  payerMemberId: string;
}): Record<string, number> {
  const amount = BigInt(i.amountInCents);
  const shares = [...i.shares].sort((a, b) => a.ordinal - b.ordinal);
  const weightOf = (s: ShareInput) => s.weight ?? s.bps;
  const W = shares.reduce((acc, s) => acc + BigInt(weightOf(s)), 0n);
  if (W === 0n) throw new RangeError("A soma dos pesos do rateio deve ser maior que zero");
  const rows = shares.map((s) => {
    const raw = amount * BigInt(weightOf(s));
    return {
      memberId: s.memberId,
      bps: weightOf(s),
      ordinal: s.ordinal,
      base: raw / W,
      rem: raw % W,
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
  return weights.map((w) => ({
    memberId: w.key,
    bps: bps[w.key] as number,
    ordinal: w.ordinal,
    weight: w.weight,
  }));
}
