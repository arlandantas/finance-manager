"use client";

import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useDismissals, useRestoreDismissal } from "@/modules/analise-ia/hooks";

/** "Sugestões descartadas" (US-071): da família; "Voltar a sugerir" reverte. */
export function DismissedList() {
  const q = useDismissals();
  const restore = useRestoreDismissal();
  const items = q.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="dismissed-title" className="flex flex-col gap-3">
      <h2 id="dismissed-title" className="text-lg font-semibold text-slate-900">
        Sugestões descartadas
      </h2>
      <ul className="flex flex-col gap-2">
        {items.map((d) => (
          <li
            key={d.id}
            data-testid="dismissed-item"
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
          >
            <div className="min-w-0">
              <p className="font-medium text-slate-900">{d.displayName}</p>
              <p className="text-xs text-slate-600">
                {d.categoryName} · descartada por {d.by.name.split(" ")[0]}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={restore.isPending}
              onClick={() =>
                restore.mutate(
                  { id: d.id, idempotencyKey: newIdempotencyKey() },
                  {
                    onSuccess: () => toast.success("Vamos voltar a sugerir"),
                    onError: (e) =>
                      toast.error(
                        e instanceof ApiClientError || e instanceof NetworkError
                          ? e.message
                          : "Não foi possível agora",
                      ),
                  },
                )
              }
            >
              Voltar a sugerir
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
