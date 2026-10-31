"use client";

import { CalendarClock, CheckCircle2 } from "lucide-react";
import { useRef } from "react";
import { cn } from "@/components/ui/cn";
import { Field, inputClass } from "@/components/ui/field";
import { SegmentedChoice } from "@/components/ui/segmented-choice";
import {
  type DoorField,
  type DoorRepeat,
  type DoorWhen,
  effectLine,
  laterHint,
} from "@/modules/lancamento/door";

/** "Quando? Já aconteceu | Vai acontecer" + linha de efeito + dica de indisponibilidade (SDD-031 §4.1, §6.1). */
export function WhenSwitch({
  when,
  repeat,
  onChange,
  later,
  locked,
}: {
  when: DoorWhen;
  repeat: DoorRepeat;
  onChange: (w: DoorWhen) => void;
  later: { enabled: boolean; reason?: "CARD_SELECTED" | "INCOME_NOT_AVAILABLE" };
  locked: boolean;
}) {
  const hintRef = useRef<HTMLParagraphElement>(null);
  const hint = later.enabled ? undefined : laterHint(later.reason);
  return (
    <div className="flex flex-col gap-1.5">
      <SegmentedChoice
        label="Quando?"
        value={when}
        onChange={onChange}
        onBlocked={(v) => {
          if (v === "LATER" && hint) hintRef.current?.focus();
        }}
        options={[
          {
            value: "NOW",
            label: "Já aconteceu",
            icon: CheckCircle2,
            disabled: locked && when !== "NOW",
          },
          {
            value: "LATER",
            label: "Vai acontecer",
            icon: CalendarClock,
            disabled: !later.enabled || (locked && when !== "LATER"),
            ...(hint ? { describedBy: "tx-when-hint" } : {}),
          },
        ]}
      />
      <p data-testid="door-effect" aria-live="polite" className="text-xs text-slate-600">
        {effectLine(when, repeat)}
      </p>
      {hint ? (
        <p
          ref={hintRef}
          id="tx-when-hint"
          tabIndex={-1}
          data-testid="door-hint"
          className="text-xs font-medium text-amber-900 dark:text-amber-200"
        >
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** "Repetir: Não | Todo mês" e, com "Todo mês", Dia do mês, Início e Fim (SDD-031 §4.1, §7). */
export function RepeatFields({
  repeat,
  onRepeat,
  locked,
  day,
  onDay,
  startMonth,
  onStartMonth,
  monthOptions,
  endKind,
  onEndKind,
  endMonths,
  onEndMonths,
  errors,
}: {
  repeat: DoorRepeat;
  onRepeat: (r: DoorRepeat) => void;
  locked: boolean;
  day: string;
  onDay: (v: string) => void;
  startMonth: string;
  onStartMonth: (v: string) => void;
  monthOptions: Array<{ value: string; label: string }>;
  endKind: "NONE" | "COUNT";
  onEndKind: (k: "NONE" | "COUNT") => void;
  endMonths: string;
  onEndMonths: (v: string) => void;
  errors: Partial<Record<DoorField, string>>;
}) {
  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span aria-hidden="true" className="text-sm font-medium text-slate-800">
          Repetir
        </span>
        <SegmentedChoice
          label="Repetir"
          value={repeat}
          onChange={onRepeat}
          options={[
            { value: "NONE", label: "Não", disabled: locked && repeat !== "NONE" },
            { value: "MONTHLY", label: "Todo mês", disabled: locked && repeat !== "MONTHLY" },
          ]}
        />
      </div>
      {repeat === "MONTHLY" ? (
        <div className="flex flex-col gap-4 rounded-lg border border-slate-200 p-3">
          <Field
            id="tx-day"
            label="Dia do mês"
            error={errors.day}
            hint="Nos meses sem esse dia, vence no último dia do mês."
          >
            <input
              id="tx-day"
              type="number"
              inputMode="numeric"
              min={1}
              max={31}
              className={inputClass}
              value={day}
              onChange={(e) => onDay(e.target.value)}
              aria-invalid={errors.day ? true : undefined}
            />
          </Field>
          <Field id="tx-start" label="Começa em" error={errors.startMonth}>
            <select
              id="tx-start"
              className={inputClass}
              value={startMonth}
              onChange={(e) => onStartMonth(e.target.value)}
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex flex-col gap-1.5">
            <span id="tx-end-label" className="text-sm font-medium text-slate-800">
              Termina
            </span>
            <div role="radiogroup" aria-labelledby="tx-end-label" className="flex flex-wrap gap-2">
              {(
                [
                  ["NONE", "Sem fim"],
                  ["COUNT", "Depois de N meses"],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={endKind === k}
                  onClick={() => onEndKind(k)}
                  className={cn(
                    "min-h-11 rounded-full border px-4 text-sm font-medium",
                    endKind === k
                      ? "border-brand-700 bg-brand-50 text-brand-800 dark:text-emerald-300"
                      : "border-slate-200 bg-white dark:bg-slate-100 text-slate-700",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {endKind === "COUNT" ? (
              <Field
                id="tx-end-months"
                label="Quantos meses no total"
                error={errors.end}
                hint="Contado desde o primeiro mês da recorrência."
              >
                <input
                  id="tx-end-months"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  className={inputClass}
                  value={endMonths}
                  onChange={(e) => onEndMonths(e.target.value)}
                  aria-invalid={errors.end ? true : undefined}
                />
              </Field>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
