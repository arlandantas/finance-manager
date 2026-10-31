"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { newIdempotencyKey } from "@/lib/http";
import { useCreatePlanned } from "@/modules/previstas/hooks";
import { useCreateSeries } from "@/modules/previstas/recurring-hooks";
import { useCreateTransaction } from "@/modules/transacoes/hooks";
import type { DoorService, DoorSubmission } from "./door";

/** Textos de sucesso por serviço (SDD-031 §5.3); a série informa quantas previstas nasceram. */
export function successText(service: DoorService, kind: "EXPENSE" | "INCOME", generated?: number) {
  if (service === "PLANNED") return "Previsão cadastrada!";
  if (service === "SERIES")
    return `Despesa recorrente cadastrada: ${generated ?? 12} previstas criadas`;
  return kind === "INCOME" ? "Receita registrada com sucesso!" : "Despesa registrada com sucesso!";
}

/**
 * Chave de idempotência da porta (ADR-009 + SDD-031 §5.1): uma por abertura E por serviço. Regera ao mudar de
 * serviço, salvo depois de falha de rede com resultado desconhecido (aí o seletor fica travado e a chave é
 * preservada para o reenvio). `renew()` é chamado a cada nova abertura do drawer.
 */
export function useDoorKey(service: DoorService | null, unknownOutcome: boolean) {
  const [key, setKey] = useState(newIdempotencyKey);
  const last = useRef(service);
  useEffect(() => {
    if (last.current === service) return;
    last.current = service;
    if (!unknownOutcome) setKey(newIdempotencyKey());
  }, [service, unknownOutcome]);
  const renew = useCallback(() => setKey(newIdempotencyKey()), []);
  return { key, renew };
}

/**
 * Escolhe a mutação do serviço da porta (SDD-031 §5.3). A invalidação de cache é a de cada hook
 * existente: TRANSACTION (extrato, contas, cartões...), PLANNED (planned, payables, home) e SERIES (+ recurring).
 * Todas com a mesma `Idempotency-Key`, que o formulário regera ao mudar de serviço (§5.1).
 */
export function useDoorSubmit(key: string) {
  const tx = useCreateTransaction(key);
  const planned = useCreatePlanned(key);
  const series = useCreateSeries(key);
  return {
    isPending: tx.isPending || planned.isPending || series.isPending,
    submit(
      sub: DoorSubmission,
      cb: {
        onSuccess: (generatedCount?: number) => void;
        onError: (e: unknown) => void;
        onSettled: () => void;
      },
    ) {
      const done = { onError: cb.onError, onSettled: cb.onSettled };
      if (sub.service === "TRANSACTION")
        tx.mutate(sub.input, { ...done, onSuccess: () => cb.onSuccess() });
      else if (sub.service === "PLANNED")
        planned.mutate(sub.input, { ...done, onSuccess: () => cb.onSuccess() });
      else series.mutate(sub.input, { ...done, onSuccess: (r) => cb.onSuccess(r.generatedCount) });
    },
  };
}
