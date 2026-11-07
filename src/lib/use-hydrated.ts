"use client";

import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * `false` no servidor e na hidratação; `true` depois. Evita mismatch quando o cache do React Query
 * já tem dados (ex.: o shell os buscou) no momento em que uma fronteira Suspense hidrata tarde.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
