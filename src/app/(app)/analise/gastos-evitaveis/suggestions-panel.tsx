"use client";

import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import type { CategorySuggestionDTO } from "@/modules/analise-ia/dto";
import {
  useAcceptSuggestion,
  useCategorySuggestions,
  useDismissSuggestion,
} from "@/modules/analise-ia/hooks";

const errorText = (e: unknown) =>
  e instanceof ApiClientError || e instanceof NetworkError
    ? e.message
    : "Erro inesperado. Tente novamente.";

const BR_DATE = (iso: string) => iso.split("-").reverse().join("/");

/**
 * Sugestões de categoria (US-072): regra LOCAL (sem IA). Cada sugestão é aceita ou recusada
 * individualmente; não existe "aceitar todas". Aceitar muda só a categoria e oferece "Desfazer" por 8 s.
 */
export function SuggestionsPanel() {
  const q = useCategorySuggestions();
  const accept = useAcceptSuggestion();
  const dismiss = useDismissSuggestion();
  const busy = accept.isPending || dismiss.isPending;

  function onAccept(s: CategorySuggestionDTO) {
    if (busy) return;
    accept.mutate(
      {
        transactionId: s.transactionId,
        version: s.version,
        fromCategoryId: s.from.id,
        toCategoryId: s.to.id,
        idempotencyKey: newIdempotencyKey(),
      },
      {
        onSuccess: (r) => {
          toast("Categoria alterada", {
            duration: 8000,
            action: {
              label: "Desfazer",
              onClick: () =>
                accept.mutate(
                  {
                    transactionId: s.transactionId,
                    version: r.transaction.version,
                    fromCategoryId: s.to.id,
                    toCategoryId: s.from.id,
                    undo: true,
                    idempotencyKey: newIdempotencyKey(),
                  },
                  { onError: (e) => toast.error(errorText(e)) },
                ),
            },
          });
        },
        onError: (e) => {
          toast.error(errorText(e));
          void q.refetch();
        },
      },
    );
  }

  function onDismiss(s: CategorySuggestionDTO) {
    if (busy) return;
    dismiss.mutate(
      {
        descriptionKey: s.descriptionKey,
        toCategoryId: s.to.id,
        idempotencyKey: newIdempotencyKey(),
      },
      { onError: (e) => toast.error(errorText(e)) },
    );
  }

  if (q.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando sugestões" className="flex flex-col gap-3">
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    );
  }
  if (q.isError) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
      >
        <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
        <Button variant="secondary" onClick={() => q.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }
  const items = q.data.items;
  return (
    <section aria-labelledby="sug-title" className="flex flex-col gap-3">
      <h2 id="sug-title" className="text-lg font-semibold text-slate-900">
        Sugestões de categoria
      </h2>
      <p className="text-sm text-slate-700">
        Lançamentos que parecem estar em uma categoria diferente das outras com a mesma descrição.
        Nada muda sem o seu aceite, um a um.
      </p>
      {items.length === 0 ? (
        <p
          data-testid="suggestions-empty"
          className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 dark:bg-slate-100"
        >
          Nenhuma sugestão de categoria por enquanto.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((s) => (
            <li
              key={s.transactionId}
              data-testid="category-suggestion"
              className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
            >
              <p className="font-semibold text-slate-900">
                {s.description}: de {s.from.name} para {s.to.name}
              </p>
              <p className="text-sm text-slate-700">
                {BR_DATE(s.occurredOn)} · <Money cents={s.amountInCents} />
              </p>
              <p className="text-sm text-slate-700">{s.why}</p>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy} onClick={() => onAccept(s)}>
                  Aceitar
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => onDismiss(s)}>
                  Recusar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
