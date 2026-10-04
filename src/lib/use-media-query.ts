"use client";

import { useSyncExternalStore } from "react";

/** `matchMedia` reativo; no servidor (e na hidratação) assume `false` (mobile primeiro). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}
