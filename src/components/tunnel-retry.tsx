"use client";

import { useEffect } from "react";

/**
 * DEV com túnel (APP_PUBLIC_ORIGIN): registra o Service Worker que limita a concorrência e repete 502/429
 * do localtunnel (só 2 conexões simultâneas). O layout só o renderiza fora de produção e com a variável.
 */
export function TunnelRetry() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/tunnel-retry-sw.js", { scope: "/" }).catch(() => {});
    }
  }, []);
  return null;
}
