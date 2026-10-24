"use client";

import Link from "next/link";
import { useRef } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useAssistantReview, useMarkAssistantReviewed } from "@/modules/mcp/hooks";
import { useTransactionState } from "@/modules/transacoes/hooks";

const TIME = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  hour: "2-digit",
  minute: "2-digit",
});

function errorText(e: unknown): string {
  return e instanceof ApiClientError || e instanceof NetworkError
    ? e.message
    : "Erro inesperado. Tente novamente.";
}

/**
 * Cartão de conferência (SDD-027 §R2.5): lançamentos do próprio membro feitos pelo assistente desde a última
 * conferência. "Excluir" usa a exclusão de sempre, com "Desfazer"; "Marcar como conferidos" some com o cartão.
 */
export function AssistantReviewCard() {
  const review = useAssistantReview();
  const mark = useMarkAssistantReviewed();
  const del = useTransactionState("delete");
  const restore = useTransactionState("restore");
  const markKey = useRef(newIdempotencyKey());
  const data = review.data;
  if (!data || data.count === 0) return null;

  function remove(item: { id: string; version: number; description: string }) {
    del.mutate(
      { id: item.id, input: { version: item.version }, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: (res) => {
          const after = res.transaction;
          toast.success("Despesa excluída", {
            duration: 8000,
            action: {
              label: "Desfazer",
              onClick: () =>
                restore.mutate(
                  {
                    id: after.id,
                    input: { version: after.version },
                    idempotencyKey: newIdempotencyKey(),
                  },
                  {
                    onSuccess: () => toast.success("Lançamento restaurado"),
                    onError: (e) => toast.error(errorText(e)),
                  },
                ),
            },
          });
        },
        onError: (e) => toast.error(errorText(e)),
      },
    );
  }

  return (
    <section
      aria-label="Lançamentos via assistente para conferir"
      data-testid="assistant-review"
      className="flex flex-col gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-slate-100"
    >
      <h2 className="text-base font-semibold text-slate-900" data-testid="assistant-review-title">
        {data.count} {data.count === 1 ? "lançamento via assistente" : "lançamentos via assistente"}{" "}
        para conferir
      </h2>
      <ul className="flex flex-col gap-2">
        {data.items.map((it) => (
          <li
            key={it.id}
            data-testid="assistant-review-item"
            className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 dark:bg-slate-200"
          >
            <div className="min-w-0">
              <p className="break-words font-medium text-slate-900">
                {it.description} <Money cents={it.amountInCents} />
              </p>
              <p className="text-xs text-slate-600">
                {it.source} · {TIME.format(new Date(it.createdAt))}
              </p>
            </div>
            <Button
              variant="secondary"
              disabled={del.isPending}
              aria-label={`Excluir ${it.description}`}
              onClick={() => remove(it)}
            >
              Excluir
            </Button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/extrato?origin=ASSISTANT"
          className="inline-flex min-h-11 items-center text-sm font-semibold text-brand-800 underline dark:text-emerald-300"
        >
          Ver todos
        </Link>
        <Button
          variant="ghost"
          disabled={mark.isPending}
          onClick={() =>
            mark.mutate(markKey.current, {
              onSuccess: () => {
                markKey.current = newIdempotencyKey();
              },
              onError: (e) => toast.error(errorText(e)),
            })
          }
        >
          Marcar como conferidos
        </Button>
      </div>
    </section>
  );
}
