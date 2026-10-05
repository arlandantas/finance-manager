"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { formatBRL } from "@/lib/money";
import { usePref } from "@/lib/prefs";

/** Máscara de largura fixa: não revela sinal nem ordem de grandeza (US-027). */
export const MONEY_MASK = "R$ •••••";
export const REVEAL_MS = 5000;
export const HIDE_VALUES_HINT = "Oculta os valores na tela. Não protege seus dados.";

const MONEY_IN_TEXT = /-?R\$\s?\d{1,3}(?:\.\d{3})*,\d{2}/g;

/** Troca valores em reais de um texto vindo do servidor pela máscara (alertas, erros). */
export function maskMoneyInText(text: string): string {
  return text.replace(MONEY_IN_TEXT, MONEY_MASK);
}

/** Estado global (por usuário/dispositivo) de ocultar valores. */
export function useHideValues(): { hidden: boolean; toggle: () => void } {
  const [hidden, setHidden] = usePref("hideValues");
  return { hidden, toggle: () => setHidden(!hidden) };
}

/** Texto seguro para toasts e mensagens: mascara valores quando ocultos. */
export function useMoneyText(): (text: string) => string {
  const { hidden } = useHideValues();
  return (text) => (hidden ? maskMoneyInText(text) : text);
}

/**
 * Único componente que mostra valor monetário de leitura (SDD-010 §4.4). Oculto: anuncia
 * "valor oculto"; tocar revela por 5 s. Entradas (`MoneyInput`) não passam por aqui.
 */
export function Money({
  cents,
  signed = false,
  className,
}: {
  cents: number;
  signed?: boolean;
  className?: string;
}) {
  const { hidden } = useHideValues();
  const [revealed, setRevealed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  // Ao ocultar tudo pelo olho do cabeçalho, a revelação pontual termina.
  useEffect(() => {
    if (!hidden) return;
    setRevealed(false);
    if (timer.current) clearTimeout(timer.current);
  }, [hidden]);

  const reveal = () => {
    setRevealed(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setRevealed(false), REVEAL_MS);
  };

  if (hidden && !revealed) {
    return (
      <span
        role="img"
        aria-label="valor oculto"
        data-money="hidden"
        className={cn("cursor-pointer whitespace-nowrap", className)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          reveal();
        }}
      >
        <span aria-hidden="true">{MONEY_MASK}</span>
      </span>
    );
  }
  const text = signed && cents > 0 ? `+${formatBRL(cents)}` : formatBRL(cents);
  return (
    <span data-money="visible" className={cn("whitespace-nowrap", className)}>
      {text}
    </span>
  );
}
