"use client";

import { useState } from "react";
import { monthOptionsFor, RepeatFields } from "@/components/door-parts";
import type { DoorRepeat } from "@/modules/lancamento/door";
import type { TransferSeriesField } from "@/modules/previstas/transfer-series-form";

/** US-101b: estado de "Repetir: Não | Todo mês" do cadastro de transferência (Dia, Começa em, Termina). */
export function useTransferRepeat(today: string | undefined) {
  const [repeat, setRepeatState] = useState<DoorRepeat>("NONE");
  const [day, setDay] = useState<string | null>(null);
  const [startMonth, setStartMonth] = useState<string | null>(null);
  const [endKind, setEndKind] = useState<"NONE" | "COUNT">("NONE");
  const [endMonths, setEndMonths] = useState("");
  const dayValue = day ?? (today ? String(Number(today.slice(8, 10))) : "");
  const startValue = startMonth ?? (today ? today.slice(0, 7) : "");
  return {
    repeat,
    setRepeat: setRepeatState,
    dayValue,
    startValue,
    endKind,
    endMonths,
    form: { day: dayValue, startMonth: startValue, endKind, endMonths },
    monthOptions: monthOptionsFor(today ?? "", startValue),
    setDay,
    setStartMonth,
    setEndKind,
    setEndMonths,
    reset() {
      setRepeatState("NONE");
      setDay(null);
      setStartMonth(null);
      setEndKind("NONE");
      setEndMonths("");
    },
  };
}
export type TransferRepeatState = ReturnType<typeof useTransferRepeat>;

export function TransferRepeatFields({
  state,
  errors,
  onToggle,
}: {
  state: TransferRepeatState;
  errors: Partial<Record<TransferSeriesField, string>>;
  onToggle: (r: DoorRepeat) => void;
}) {
  return (
    <RepeatFields
      repeat={state.repeat}
      onRepeat={onToggle}
      locked={false}
      day={state.dayValue}
      onDay={state.setDay}
      startMonth={state.startValue}
      onStartMonth={state.setStartMonth}
      monthOptions={state.monthOptions}
      endKind={state.endKind}
      onEndKind={state.setEndKind}
      endMonths={state.endMonths}
      onEndMonths={state.setEndMonths}
      errors={{
        ...(errors.day ? { day: errors.day } : {}),
        ...(errors.startMonth ? { startMonth: errors.startMonth } : {}),
        ...(errors.end ? { end: errors.end } : {}),
      }}
    />
  );
}
