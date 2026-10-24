// Tipos de transporte da análise de gastos (SDD-023 §2.3). Só tipos: seguros para componentes client.
import type { AiFeatureStateDTO } from "@/modules/ia/dto";

export type MemberRefDTO = { id: string; name: string; image: string | null; removed?: true };
export type PeriodDTO = { key: string; label: string; partial: boolean };

export type AnalysisPayloadDTO = {
  schemaVersion: 1;
  locale: "pt-BR";
  currency: "BRL";
  partial: boolean;
  months: { rel: number; expenseInCents: number; incomeInCents: number }[];
  categories: {
    ref: string;
    label: string;
    icon: string;
    totals: { rel: number; amountInCents: number; count: number }[];
  }[];
  recurring: {
    ref: string;
    categoryRef: string;
    source: "SCHEDULED" | "DETECTED";
    monthlyAvgInCents: number;
    presentIn: number[];
  }[];
};

export type ReadableDTO = {
  categories: { label: string; months: { rel: number; amountInCents: number }[] }[];
  recurring: { ref: string; label: string; monthlyAvgInCents: number; months: number }[];
};

export type AnalysisPreviewDTO = {
  period: PeriodDTO;
  eligible: boolean;
  ineligibleReason: "NOT_ENOUGH_MONTHS" | null;
  ineligibleMessage: string | null;
  feature: AiFeatureStateDTO;
  limitReached: boolean;
  limitMessage: string | null;
  sentSummary: string;
  payload: AnalysisPayloadDTO | null; // o JSON EXATO; nulo quando inelegível
  readable: ReadableDTO;
  previewHash: string;
  estimateInCents: number | null; // reserva máxima, ceil; nulo para quem não é ADMIN
};

export type AnalysisClassDTO = "ESSENTIAL" | "IMPORTANT" | "SUPERFLUOUS" | "UNCLASSIFIED";

export type SpendingAnalysisDTO = {
  id: string;
  period: PeriodDTO;
  createdAt: string;
  requestedBy: MemberRefDTO;
  summary: string;
  summaryFromAi: boolean;
  aiGenerated: true;
  model: string;
  groups: {
    class: AnalysisClassDTO;
    categories: {
      categoryId: string;
      label: string; // nome ATUAL da categoria (local)
      amountInCents: number;
      prevAmountInCents: number | null;
      deltaPermille: number | null;
      reason: string;
      reasonFromAi: boolean;
    }[];
  }[];
  avoidable: {
    key: string; // ref local da análise (R1, C2...)
    kind: "RECURRING" | "CATEGORY";
    displayName: string; // local
    categoryId: string;
    monthlyInCents: number;
    annualInCents: number; // = monthly × 12
    reason: string;
    reasonFromAi: boolean;
    drillUrl: string;
  }[];
  disclaimer: "Análise educativa. Não substitui um profissional. Nenhum dado foi alterado.";
};

export type AnalysisListItemDTO = {
  id: string;
  period: PeriodDTO;
  createdAt: string;
  requestedBy: MemberRefDTO;
};

export type SentDataDTO = { period: PeriodDTO; payload: AnalysisPayloadDTO; readable: ReadableDTO };

export type AvoidableDismissalDTO = {
  id: string;
  kind: "RECURRING" | "CATEGORY";
  displayName: string;
  categoryId: string;
  categoryName: string;
  reason: string | null;
  by: MemberRefDTO;
  at: string;
};

export type CategorySuggestionDTO = {
  transactionId: string;
  version: number;
  description: string;
  descriptionKey: string;
  occurredOn: string;
  amountInCents: number;
  from: { id: string; name: string };
  to: { id: string; name: string };
  why: string;
};
