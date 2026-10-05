"use client";

import { useEffect } from "react";

/**
 * DEV com túnel (APP_PUBLIC_ORIGIN): registra o Service Worker que limita a concorrência e repete 502/429
 * do localtunnel (só 2 conexões simultâneas), SOMENTE quando a página está no host do túnel. Em localhost
 * ou IP da LAN, remove um SW antigo. O layout só o renderiza fora de produção e com a variável.
 */
export function TunnelRetry({ host }: { host: string }) {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (window.location.hostname.toLowerCase() === host) {
      navigator.serviceWorker.register("/tunnel-retry-sw.js", { scope: "/" }).catch(() => {});
    } else {
      navigator.serviceWorker
        .getRegistrations()
        .then((regs) => {
          for (const r of regs) {
            if (r.active?.scriptURL.endsWith("/tunnel-retry-sw.js")) void r.unregister();
          }
        })
        .catch(() => {});
    }
  }, [host]);
  return null;
}
