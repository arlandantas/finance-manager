import { invoiceRefFor } from "@/modules/cartoes/cycle";
import {
  addMonthsClamped,
  buildRemainingInstallments,
  type InstallmentDraft,
} from "@/modules/cartoes/installments";
import type { ConfirmItem } from "./confirm-schema";

// Spec 13 regra 15 e ADR-042 §9 (PURO, sem Prisma): item confirmado -> lançamento à vista ou plano de parcelas.

export type PlanContext = {
  closingDay: number;
  dueDay: number;
  /** Mês de fechamento da fatura alvo. */
  invoiceRef: string;
  /** Data de fechamento da fatura alvo. */
  closingDate: string;
  today: string;
};

export type SingleDraft = { kind: "SINGLE"; item: ConfirmItem; key: string; amountInCents: bigint };
export type PlanDraft = {
  kind: "PLAN";
  item: ConfirmItem;
  key: string;
  /** Valor de cada parcela (= valor da linha). */
  amountInCents: bigint;
  /** `valor × N`. */
  totalInCents: bigint;
  paidBeforeApp: number;
  anchorOn: string;
  parcels: InstallmentDraft[];
};
export type ItemDraft = SingleDraft | PlanDraft;

/**
 * Âncora da parcela `n` (regra 15): `addMonthsClamped(data da linha, n-1)` se cair no ciclo da fatura alvo e não
 * for futura; senão o último dia válido do ciclo (fechamento da fatura, ou hoje se ela ainda estiver aberta).
 */
export function anchorFor(date: string, no: number, c: PlanContext): string {
  const candidate = addMonthsClamped(date, no - 1);
  if (candidate <= c.today && invoiceRefFor(candidate, c.closingDay) === c.invoiceRef) {
    return candidate;
  }
  return c.closingDate < c.today ? c.closingDate : c.today;
}

/** Mapeia um item (e sua `importKey`) para o que será gravado. O valor da linha é o da parcela `n`. */
export function mapItem(item: ConfirmItem, key: string, c: PlanContext): ItemDraft {
  const amount = BigInt(item.amountInCents);
  if (!item.installment) return { kind: "SINGLE", item, key, amountInCents: amount };
  const { no, count } = item.installment;
  const anchorOn = anchorFor(item.date, no, c);
  const total = amount * BigInt(count);
  const parcels = buildRemainingInstallments({
    totalInCents: Number(total), // ≤ 9.999.999.999 × 24: inteiro seguro
    count,
    paidBeforeApp: no - 1,
    anchorOn,
    closingDay: c.closingDay,
    dueDay: c.dueDay,
  });
  return {
    kind: "PLAN",
    item,
    key,
    amountInCents: amount,
    totalInCents: total,
    paidBeforeApp: no - 1,
    anchorOn,
    parcels,
  };
}

/** Σ centavos que o item grava: à vista = valor; parcela n/N = valor × (N − n + 1). */
export function draftTotal(d: ItemDraft): bigint {
  return d.kind === "SINGLE" ? d.amountInCents : d.amountInCents * BigInt(d.parcels.length);
}

/** Refs de fatura que o lote toca (alvo + parcelas futuras), únicas e em ordem crescente. */
export function refsOf(drafts: readonly ItemDraft[], target: string): string[] {
  const refs = new Set<string>([target]);
  for (const d of drafts) if (d.kind === "PLAN") for (const p of d.parcels) refs.add(p.invoiceRef);
  return [...refs].sort();
}
