import { isRuleStale } from "@/modules/split/rules";
import type { SettlementResult } from "@/modules/split/settlement-common";
import { computeSettlementLegacy, type SettlementInput } from "@/modules/split/settlement-legacy";
import {
  computeSettlementStored,
  type StoredSettlementInput,
} from "@/modules/split/settlement-stored";

// Motor do acerto (SDD-002 §4). EN-002a (SDD-015 §2): o corpo de `computeSettlement` foi MOVIDO, sem mudança
// de lógica, para `settlement-legacy.ts` (`computeSettlementLegacy`); tipos e funções comuns vivem em
// `settlement-common.ts`. Este módulo continua sendo a fachada que os consumidores já importam.
export * from "@/modules/split/settlement-common";
export {
  computeSettlementLegacy,
  legacyGroupWeights,
  type SettlementInput,
} from "@/modules/split/settlement-legacy";

/** Motor LEGACY (vigência por data, maior resto por grupo). Mantido para os consumidores da R1..R2.1. */
export const computeSettlement = computeSettlementLegacy;

export {
  computeSettlementStored,
  SplitInconsistentError,
  type StoredExpenseInput,
  type StoredSettlementInput,
} from "@/modules/split/settlement-stored";

/** Despachante por `Family.splitEngine` (ADR-016 §4): LEGACY = vigência por data; STORED = Σ do rateio gravado. */
export function computeSettlementFor(engine: "LEGACY", i: SettlementInput): SettlementResult;
export function computeSettlementFor(engine: "STORED", i: StoredSettlementInput): SettlementResult;
export function computeSettlementFor(
  engine: "LEGACY" | "STORED",
  i: SettlementInput | StoredSettlementInput,
): SettlementResult {
  return engine === "LEGACY"
    ? computeSettlementLegacy(i as SettlementInput)
    : computeSettlementStored(i as StoredSettlementInput);
}

export { isRuleStale };
