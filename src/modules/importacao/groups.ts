import type { ImportDraftItem } from "./schemas";

// Spec 13 regra 11 (PURO, sem server-only: o cliente usa as mesmas regras na revisão, US-067b).
export const GROUPS = {
  PURCHASE: "Compras",
  FEE: "Encargos",
  CREDIT: "Estornos e créditos",
  PAYMENT: "Pagamento da fatura",
} as const;

type Kind = ImportDraftItem["kind"];

/** Só compra e encargo podem virar lançamento; estorno e pagamento aparecem apenas na conferência. */
export const isImportableKind = (kind: Kind): boolean => kind === "PURCHASE" || kind === "FEE";

/** Padrão de seleção: só `PURCHASE` marcado (encargo é importável, mas desmarcado). */
export const defaultSelected = (kind: Kind): boolean => kind === "PURCHASE";

/** Selecionável = tipo importável e sem marca de duplicidade definitiva (regra 13). */
export function isItemSelectable(item: Pick<ImportDraftItem, "kind" | "flags">): boolean {
  return (
    isImportableKind(item.kind) &&
    !item.flags.includes("ALREADY_IMPORTED") &&
    !item.flags.includes("ALREADY_POSTED_PARCEL")
  );
}
