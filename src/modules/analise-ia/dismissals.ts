import type { Tx } from "@/lib/api/types";

/** Chaves de descarte da família (US-071). Até a US-071 chegar, nada foi descartado. */
export async function loadDismissedKeys(_tx: Tx, _familyId: string): Promise<Set<string>> {
  return new Set();
}
