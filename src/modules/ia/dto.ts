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

// EN-005 (SDD-022 §2)
export type AiFeatureStateDTO = {
  purpose: AiPurposeDTO;
  available: boolean; // false p/ INVOICE_IMPORT (R5) e com a IA indisponível
  state: "ON" | "OFF" | "NEEDS_RECONSENT" | "UNAVAILABLE";
  currentText: { version: number; summary: string; details: string[] };
  lastChange: {
    action: "ENABLED" | "DISABLED";
    at: string;
    by: { id: string; name: string; former: boolean };
    textVersion: number;
  } | null;
};

export type AiSettingsDTO = {
  canEdit: boolean; // role === ADMIN
  features: AiFeatureStateDTO[];
  usage: AiUsageDTO | null; // só ADMIN (SDD-021)
  familyVersion: number;
};
