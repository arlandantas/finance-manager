"use client";

import Link from "next/link";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import type { SpendingAnalysisDTO } from "@/modules/analise-ia/dto";
import { useCreateDismissal, useRestoreDismissal } from "@/modules/analise-ia/hooks";

type Item = SpendingAnalysisDTO["avoidable"][number];

/** Cartão de possível gasto evitável: valor mensal e anual calculados pelo app (nunca pela IA). */
export function AvoidableCard({ item, analysisId }: { item: Item; analysisId: string }) {
  const create = useCreateDismissal();
  const restore = useRestoreDismissal();

  function dismiss() {
    if (create.isPending) return;
    create.mutate(
      { analysisId, key: item.key, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: (d) => {
          // "Desfazer" por 8 s = voltar a sugerir (US-071)
          toast("Combinado. Não vamos sugerir de novo.", {
            duration: 8000,
            action: {
              label: "Desfazer",
              onClick: () => restore.mutate({ id: d.id, idempotencyKey: newIdempotencyKey() }),
            },
          });
        },
        onError: (e) =>
          toast.error(
            e instanceof ApiClientError || e instanceof NetworkError
              ? e.message
              : "Não foi possível descartar agora",
          ),
      },
    );
  }

  return (
    <article
      data-testid="avoidable-card"
      data-key={item.key}
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
    >
      <h3 className="font-semibold text-slate-900">{item.displayName}</h3>
      <p className="text-sm font-medium text-slate-900" data-testid="avoidable-values">
        <Money cents={item.monthlyInCents} /> por mês · <Money cents={item.annualInCents} /> por ano
      </p>
      <p className="text-sm text-slate-700">{item.reason}</p>
      <div className="flex flex-wrap gap-3">
        <Link
          href={item.drillUrl}
          className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline"
        >
          Ver lançamentos
        </Link>
        <Button variant="secondary" disabled={create.isPending} onClick={dismiss}>
          Importante para nós
        </Button>
      </div>
    </article>
  );
}
