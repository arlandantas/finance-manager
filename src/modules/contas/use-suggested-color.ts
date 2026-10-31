"use client";

import { useCards } from "@/modules/cartoes/hooks";
import { type AccountColor, pickNextColor } from "@/modules/contas/colors";
import { useAccounts } from "@/modules/contas/hooks";

/** US-050 (SDD-017 §6.1): cor sugerida no cliente com as contas e cartões em cache (o servidor repete a regra). */
export function useSuggestedColor(): AccountColor {
  const accounts = useAccounts();
  const cards = useCards();
  const used = [
    ...(accounts.data?.items ?? []).map((a) => a.color),
    ...(cards.data?.items ?? []).map((c) => c.color),
  ];
  return pickNextColor(used);
}
