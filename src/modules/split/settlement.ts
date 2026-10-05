import { isRuleStale } from "@/modules/split/rules";
import { computeSettlementLegacy } from "@/modules/split/settlement-legacy";

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

export { isRuleStale };
