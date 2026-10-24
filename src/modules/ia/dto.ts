// Tipos de transporte do módulo de IA (SDD-021 §2). Só tipos: seguro para componentes client.
export type AiPurposeDTO = "SPENDING_ANALYSIS" | "INVOICE_IMPORT";

export type AiUsageDTO = {
  month: string; // "2026-11"
  capInCents: number | null; // null = IA indisponível (flag desligada)
  usedInCents: number; // gasto + reservas vencidas, ceil
  remainingInCents: number | null;
  resetsOn: string; // "2026-12-01"
  byPurpose: { purpose: AiPurposeDTO; usedInCents: number; calls: number }[];
};
