"use client";

import { useRef } from "react";
import { cn } from "@/components/ui/cn";
import { ACCOUNT_COLOR_LABEL, ACCOUNT_COLORS, type AccountColor } from "@/modules/contas/colors";

/**
 * US-050 (SDD-017 §6.1): `radiogroup` de 10 cores. Cada opção tem NOME falado (`aria-label`) e a
 * selecionada aparece com `aria-checked`, anel visível e a linha de texto "Cor: Laranja (selecionada)".
 */
export function ColorPicker({
  value,
  onChange,
  id = "color-picker",
  error,
}: {
  value: AccountColor;
  onChange: (c: AccountColor) => void;
  id?: string;
  error?: string | undefined;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (from: number, step: number) => {
    const next = (from + step + ACCOUNT_COLORS.length) % ACCOUNT_COLORS.length;
    onChange(ACCOUNT_COLORS[next] as AccountColor);
    refs.current[next]?.focus();
  };
  return (
    <div className="flex flex-col gap-2">
      <span id={`${id}-label`} className="text-sm font-medium text-slate-800">
        Cor
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        aria-describedby={`${id}-selected`}
        className="grid grid-cols-5 justify-items-center gap-1"
      >
        {ACCOUNT_COLORS.map((c, i) => {
          const selected = c === value;
          return (
            <button
              key={c}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={ACCOUNT_COLOR_LABEL[c]}
              data-testid="color-option"
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(c)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                }
              }}
              className="flex h-11 w-11 items-center justify-center rounded-full"
            >
              <span
                className={cn(
                  "source-dot [--dot:28px]",
                  selected && "outline-2 outline-offset-2 outline-slate-900",
                )}
                data-color={c}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>
      <p id={`${id}-selected`} data-testid="color-selected" className="text-sm text-slate-700">
        Cor: {ACCOUNT_COLOR_LABEL[value]} (selecionada)
      </p>
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
