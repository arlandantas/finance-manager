"use client";

import { createContext, type ReactNode, useContext } from "react";

/** US-053: o acerto ligado/desligado da família, para a UI esconder selos e filtros de divisão. */
const SettlementContext = createContext(true);

export function SettlementProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: ReactNode;
}) {
  return <SettlementContext.Provider value={enabled}>{children}</SettlementContext.Provider>;
}

export function useSettlementEnabled(): boolean {
  return useContext(SettlementContext);
}
