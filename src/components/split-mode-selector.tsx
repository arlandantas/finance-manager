"use client";

import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/field";
import { customSharesOf, ruleModeLabel } from "@/modules/split/custom-input";
import { formatBps } from "@/modules/split/rules";
import { SPLIT_SUM_MSG } from "@/modules/split/split-input";

export type SplitModeValue = "NONE" | "RULE" | "CUSTOM";

/**
 * Seletor "Dividir" (US-043): "Só meu" (padrão), "Pela regra da família (a / b)" e "De outro jeito" (percentual por
 * membro; 0% e 100% valem). O servidor valida a soma; aqui só se avisa e se bloqueia o envio (`customValid`).
 */
export function SplitModeSelector({
  idPrefix,
  mode,
  onModeChange,
  ruleShares,
  members,
  pct,
  onPctChange,
  allowCustom = true,
  blockedText,
  serverError,
}: {
  idPrefix: string;
  mode: SplitModeValue;
  onModeChange: (m: SplitModeValue) => void;
  ruleShares: Array<{ memberId: string; bps: number }> | null | undefined;
  members: Array<{ memberId: string; name: string }>;
  pct: Record<string, string>;
  onPctChange: (memberId: string, value: string) => void;
  allowCustom?: boolean;
  /** Compra parcelada: a divisão ainda não vale (US-042); mostra o motivo e desabilita as opções. */
  blockedText?: string | undefined;
  serverError?: string | undefined;
}) {
  const options: Array<{ value: SplitModeValue; label: string }> = [
    { value: "NONE", label: "Só meu" },
    { value: "RULE", label: ruleModeLabel(ruleShares) },
    ...(allowCustom ? [{ value: "CUSTOM" as const, label: "De outro jeito" }] : []),
  ];
  const custom = customSharesOf(members, pct);
  const sumError =
    mode === "CUSTOM" && (custom.invalid || custom.sum !== 10000) ? SPLIT_SUM_MSG : undefined;
  const error = sumError ?? serverError;
  return (
    <div className="flex flex-col gap-2" data-testid="split-selector">
      <span id={`${idPrefix}-split-label`} className="text-sm font-medium text-slate-800">
        Dividir com a família
        {blockedText ? (
          <span data-testid="split-label" className="block text-xs font-normal text-slate-500">
            {blockedText}
          </span>
        ) : null}
      </span>
      <div
        role="radiogroup"
        aria-labelledby={`${idPrefix}-split-label`}
        className="flex flex-col gap-1.5"
      >
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={blockedText ? o.value === "NONE" : mode === o.value}
            aria-disabled={blockedText ? true : undefined}
            aria-describedby={blockedText ? `${idPrefix}-installment-notice` : undefined}
            onClick={() => {
              if (!blockedText) onModeChange(o.value);
            }}
            className={cn(
              "flex min-h-11 items-center rounded-xl border px-3 text-left text-sm font-medium",
              (blockedText ? o.value === "NONE" : mode === o.value)
                ? "border-brand-700 bg-brand-50 text-brand-800 dark:text-emerald-300"
                : "border-slate-200 bg-white dark:bg-slate-100 text-slate-700 hover:bg-slate-50",
            )}
          >
            {o.label}
          </button>
        ))}
      </div>
      {mode === "CUSTOM" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-slate-200 p-3">
          {members.map((m) => (
            <label
              key={m.memberId}
              className="flex min-h-11 items-center justify-between gap-3 text-sm text-slate-800"
            >
              <span>{m.name.split(" ")[0]}</span>
              <span className="flex items-center gap-1">
                <input
                  className={cn(inputClass, "w-24 text-right")}
                  inputMode="decimal"
                  aria-label={`Percentual de ${m.name.split(" ")[0]}`}
                  aria-invalid={error ? true : undefined}
                  value={pct[m.memberId] ?? ""}
                  onChange={(e) => onPctChange(m.memberId, e.target.value)}
                />
                <span aria-hidden="true">%</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-slate-600" data-testid="split-sum">
            Soma: {formatBps(custom.sum)}%
          </p>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** `true` quando o modo escolhido pode ser enviado (CUSTOM exige soma 100% e texto válido). */
export function splitModeValid(
  mode: SplitModeValue,
  members: Array<{ memberId: string }>,
  pct: Record<string, string>,
): boolean {
  if (mode !== "CUSTOM") return true;
  const c = customSharesOf(members, pct);
  return !c.invalid && c.sum === 10000;
}
