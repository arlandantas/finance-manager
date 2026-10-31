"use client";

import type { LucideIcon } from "lucide-react";
import { useId, useRef } from "react";
import { cn } from "@/components/ui/cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  icon?: LucideIcon;
  /** Indisponível mas focável (`aria-disabled`); a dica explica o motivo. */
  disabled?: boolean;
  hint?: string;
  /** Id de um elemento visível que explica o motivo (alternativa ao `hint` sr-only). */
  describedBy?: string;
  /** Cor do estado selecionado (padrão: marca). A cor nunca é o único sinal: ícone + texto. */
  tone?: "brand" | "expense" | "income";
};

const TONE: Record<NonNullable<SegmentedOption<string>["tone"]>, string> = {
  brand: "bg-brand-700 text-white border-brand-700",
  expense: "bg-red-700 text-white border-red-700",
  income: "bg-emerald-700 text-white border-emerald-700",
};

/**
 * Seletor segmentado único (US-085): dois ou mais botões de largura igual, o selecionado preenchido
 * com ícone + texto. `variant="radio"` (formulários) ou `"tabs"` (filtra uma lista, ex.: Categorias).
 * Teclado: setas movem e selecionam (roving tabindex).
 */
export function SegmentedChoice<T extends string>({
  label,
  options,
  value,
  onChange,
  variant = "radio",
  className,
  onBlocked,
}: {
  label: string;
  options: Array<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  variant?: "radio" | "tabs";
  className?: string;
  /** Toque/Enter numa opção indisponível: quem usa leva o foco à dica (SDD-031 §6.1). */
  onBlocked?: (value: T) => void;
}) {
  const id = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabs = variant === "tabs";

  function move(from: number, delta: number) {
    for (let step = 1; step <= options.length; step++) {
      const i = (from + delta * step + options.length * step) % options.length;
      const o = options[i];
      if (o && !o.disabled) {
        onChange(o.value);
        refs.current[i]?.focus();
        return;
      }
    }
  }

  return (
    <div
      role={tabs ? "tablist" : "radiogroup"}
      aria-label={label}
      data-testid="segmented-choice"
      className={cn("grid gap-1 rounded-xl bg-slate-100 p-1", className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        const Icon = o.icon;
        const hintId = o.hint ? `${id}-${o.value}-hint` : undefined;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={tabs ? "tab" : "radio"}
            {...(tabs ? { "aria-selected": selected } : { "aria-checked": selected })}
            aria-disabled={o.disabled ? true : undefined}
            aria-describedby={hintId ?? o.describedBy}
            tabIndex={selected ? 0 : -1}
            data-selected={selected ? "true" : "false"}
            onClick={() => {
              if (o.disabled) onBlocked?.(o.value);
              else onChange(o.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                move(i, 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                move(i, -1);
              }
            }}
            className={cn(
              "flex min-h-11 items-center justify-center gap-1.5 rounded-lg border text-sm font-semibold",
              selected
                ? TONE[o.tone ?? "brand"]
                : "border-slate-300 bg-transparent text-slate-700 aria-disabled:opacity-60",
            )}
          >
            {Icon ? <Icon size={16} aria-hidden="true" /> : null}
            {o.label}
            {o.hint ? (
              <span id={hintId} className="sr-only">
                {o.hint}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
