"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui/cn";
import { MONEY_MASK, maskMoneyInText } from "@/lib/mask-money";
import { formatBRL } from "@/lib/money";
import { usePref } from "@/lib/prefs";

export { MONEY_MASK, maskMoneyInText };
export const REVEAL_MS = 5000;
export const HIDE_VALUES_HINT = "Oculta os valores na tela. Não protege seus dados.";

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

/** Para textos (hints, `aria`, mensagens): "R$ 1,00" visível ou a máscara quando oculto. */
export function useFormatMoney(): (cents: number, o?: { signed?: boolean }) => string {
  const { hidden } = useHideValues();
  return (cents, o) => {
    if (hidden) return MONEY_MASK;
    return o?.signed && cents > 0 ? `+${formatBRL(cents)}` : formatBRL(cents);
  };
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
