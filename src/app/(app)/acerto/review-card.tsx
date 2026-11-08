"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { ApiClientError, newIdempotencyKey } from "@/lib/http";
import { useFamily } from "@/modules/familia/hooks";
import { SPLIT_COPY } from "@/modules/split/copy";
import { useDismissSettlementReview, useSettlementReview } from "@/modules/split/hooks";
import { useUpdateTransaction } from "@/modules/transacoes/hooks";

/**
 * US-044: aviso do mês encerrado com despesas "Só meu" para revisar. Abrir não escreve nada; "Dividir" aplica a regra
 * da família na data do lançamento (PATCH `split: RULE`), com confirmação se o mês já foi acertado.
 */
export function ReviewCard({ period }: { period: string }) {
  const review = useSettlementReview(period);
  const dismiss = useDismissSettlementReview();
  const update = useUpdateTransaction();
  const me = useFamily().data?.currentMemberId;
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<string | null>(null);
  const r = review.data;
  if (!r || !r.eligible || r.dismissed || r.count === 0) return null;

  function divide(item: { id: string; version: number }, confirmSettledPeriod: boolean) {
    update.mutate(
      {
        id: item.id,
        input: {
          version: item.version,
          split: { mode: "RULE" },
          ...(confirmSettledPeriod ? { confirmSettledPeriod: true } : {}),
        },
        idempotencyKey: newIdempotencyKey(),
      },
      {
        onSuccess: () => {
          setConfirming(null);
          toast.success("Despesa dividida");
        },
        onError: (e) => {
          if (e instanceof ApiClientError && e.code === "SETTLED_PERIOD_CONFIRMATION_REQUIRED") {
            setConfirming(item.id);
          } else toast.error(e instanceof Error ? e.message : "Erro inesperado.");
        },
      },
    );
  }

  return (
    <section
      aria-label="Revisar despesas Só meu"
      data-testid="settlement-review"
      className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-4"
    >
      <p className="text-sm font-medium text-slate-900">{SPLIT_COPY.reviewPrompt(r.count)}</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          {open ? "Fechar" : "Revisar"}
        </Button>
        <Button
          variant="secondary"
          disabled={dismiss.isPending}
          onClick={() => dismiss.mutate({ period, idempotencyKey: newIdempotencyKey() })}
        >
          {SPLIT_COPY.reviewDismiss}
        </Button>
      </div>
      {open ? (
        <ul className="flex flex-col divide-y divide-slate-100">
          {r.items.map((x) => (
            <li key={x.id} data-testid="review-item" className="flex flex-col gap-2 py-2 text-sm">
              <span className="flex items-center justify-between gap-3">
                <span className="min-w-0 break-words font-medium text-slate-900">
                  {x.description}
                  <span className="block text-xs font-normal text-slate-500">
                    {x.occurredOn.split("-").reverse().slice(0, 2).join("/")} ·{" "}
                    {x.payer.name.split(" ")[0]}
                  </span>
                </span>
                <span className="font-semibold tabular-nums text-slate-900">
                  <Money cents={x.amountInCents} />
                </span>
              </span>
              {x.payer.id === me ? (
                confirming === x.id ? (
                  <span className="flex flex-col gap-2">
                    <span role="alert" className="text-xs text-slate-700">
                      {SPLIT_COPY.reviewSettled}
                    </span>
                    <Button disabled={update.isPending} onClick={() => divide(x, true)}>
                      Dividir mesmo assim
                    </Button>
                  </span>
                ) : (
                  <Button
                    variant="secondary"
                    disabled={update.isPending}
                    aria-label={`Dividir ${x.description}`}
                    onClick={() => divide(x, false)}
                  >
                    Dividir
                  </Button>
                )
              ) : (
                <span data-testid="review-item-readonly" className="text-xs text-slate-500">
                  Só quem lançou pode dividir
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
