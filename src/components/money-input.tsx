"use client";

import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/field";
import { formatBRL, MAX_AMOUNT_IN_CENTS } from "@/lib/money";

/**
 * Campo de valor com máscara BRL que acumula dígitos (SDD-000 §3): digitar 1,5,0,5,0 => "R$ 150,50".
 * `value` e `onChange` trabalham em centavos inteiros. Com `allowNegative`, o sinal "-" (digitado
 * ou pelo botão ±) torna o valor negativo.
 */
export function MoneyInput({
  id,
  value,
  onChange,
  allowNegative = false,
  invalid,
  autoFocus,
  className,
  describedBy,
  large,
}: {
  id: string;
  value: number;
  onChange: (cents: number) => void;
  allowNegative?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  className?: string;
  describedBy?: string | undefined;
  large?: boolean;
}) {
  // Sinal pendente enquanto o valor ainda é zero ("-R$ 0,00").
  const [negativeZero, setNegativeZero] = useState(false);
  const text = value === 0 && negativeZero ? `-${formatBRL(0)}` : formatBRL(value);

  function handleChange(raw: string) {
    const digits = raw.replace(/\D/g, "").replace(/^0+/, "").slice(0, 12);
    const magnitude = Math.min(digits === "" ? 0 : Number(digits), MAX_AMOUNT_IN_CENTS);
    const negative = allowNegative && raw.includes("-");
    setNegativeZero(negative && magnitude === 0);
    onChange(negative ? -magnitude : magnitude);
  }

  function toggleSign() {
    if (value === 0) setNegativeZero((v) => !v);
    else onChange(-value);
  }

  return (
    <div className="flex items-stretch gap-2">
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        aria-invalid={invalid ? true : undefined}
        aria-describedby={describedBy}
        className={cn(inputClass, large && "min-h-14 text-3xl font-semibold", className)}
      />
      {allowNegative ? (
        <button
          type="button"
          aria-label="Alternar sinal do valor"
          aria-pressed={value < 0 || negativeZero}
          onClick={toggleSign}
          className="min-h-11 min-w-11 rounded-lg border border-slate-300 bg-white text-lg font-semibold text-slate-700 hover:bg-slate-50 aria-pressed:border-red-600 aria-pressed:text-red-700"
        >
          ±
        </button>
      ) : null}
    </div>
  );
}
