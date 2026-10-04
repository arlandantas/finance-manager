"use client";

import { useEffect } from "react";

/**
 * Sinaliza que a hidratação terminou (`<html data-hydrated="1">`). Usado pelo E2E para não clicar
 * em botões do HTML do servidor antes de o React anexar os handlers (evita testes instáveis).
 */
export function HydrationMarker() {
  useEffect(() => {
    document.documentElement.dataset.hydrated = "1";
  }, []);
  return null;
}
