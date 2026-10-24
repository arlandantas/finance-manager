"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { shiftMonthKey } from "@/app/(app)/extrato/filters";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useAnalysisPreview, useRequestAnalysis } from "@/modules/analise-ia/hooks";
import { useAiSettings } from "@/modules/ia/hooks";
import { SentPreview } from "./sent-preview";

function messageOf(e: unknown): string {
  if (e instanceof ApiClientError || e instanceof NetworkError) return e.message;
  return "Não foi possível analisar agora. Tente novamente em instantes";
}

/** Tela de pedido (FLUXO-017): mês, "O que será enviado" e "Enviar para análise". */
export function RequestPanel() {
  const router = useRouter();
  const [period, setPeriod] = useState<string | undefined>(undefined);
  const [reviewing, setReviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const preview = useAnalysisPreview(period);
  const settings = useAiSettings();
  const request = useRequestAnalysis();
  const keyRef = useRef(newIdempotencyKey());
  const abortRef = useRef<AbortController | null>(null);
  const data = preview.data;

  const shift = (delta: number) => {
    if (!data) return;
    setPeriod(shiftMonthKey(data.period.key, delta));
    setReviewing(false);
    setError(null);
  };

  function send() {
    if (!data || request.isPending) return;
    setError(null);
    const controller = new AbortController();
    abortRef.current = controller;
    request.mutate(
      {
        period: data.period.key,
        previewHash: data.previewHash,
        idempotencyKey: keyRef.current,
        signal: controller.signal,
      },
      {
        onSuccess: (dto) => {
          keyRef.current = newIdempotencyKey();
          router.push(`/analise/gastos-evitaveis/${dto.id}`);
        },
        onError: (e) => {
          keyRef.current = newIdempotencyKey(); // erro de negócio não fica gravado: o reenvio usa chave nova
          if (e instanceof DOMException && e.name === "AbortError") return; // cancelado: nada salvo
          if (e instanceof ApiClientError && e.code === "PREVIEW_STALE") {
            toast.message(e.message);
            void preview.refetch();
            return;
          }
          setError(messageOf(e));
        },
      },
    );
  }

  function cancel() {
    abortRef.current?.abort();
    keyRef.current = newIdempotencyKey();
    request.reset();
  }

  if (preview.isPending) {
    return (
      <div aria-busy="true" aria-label="Carregando" className="flex flex-col gap-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-24" />
      </div>
    );
  }
  if (preview.isError || !data) {
    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
      >
        <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
        <Button variant="secondary" onClick={() => preview.refetch()}>
          Tentar de novo
        </Button>
      </div>
    );
  }

  const state = data.feature.state;
  const canEdit = settings.data?.canEdit ?? false;
  const selector = (
    <div className="flex items-center justify-between gap-2" data-testid="period-selector">
      <Button variant="secondary" aria-label="Mês anterior" onClick={() => shift(-1)}>
        ‹
      </Button>
      <p className="text-center font-medium text-slate-900" aria-live="polite">
        <span data-testid="period-label">{data.period.label}</span>
        {data.period.partial ? (
          <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
            parcial
          </span>
        ) : null}
      </p>
      <Button
        variant="secondary"
        aria-label="Próximo mês"
        disabled={data.period.partial}
        onClick={() => shift(1)}
      >
        ›
      </Button>
    </div>
  );

  if (state === "UNAVAILABLE") {
    return <Notice testId="ai-unavailable">A IA ainda não está disponível neste app</Notice>;
  }
  if (state === "OFF" || state === "NEEDS_RECONSENT") {
    return (
      <div className="flex flex-col gap-3">
        <Notice testId="ai-off">
          {state === "OFF"
            ? "A análise por IA está desligada nesta família"
            : "O texto de consentimento mudou. Peça ao Administrador para confirmar de novo"}
        </Notice>
        {canEdit ? (
          <Link href="/familia/ia" className="text-sm font-medium text-brand-700 underline">
            Ligar em IA e privacidade
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {selector}
      {!data.eligible ? <Notice testId="not-enough">{data.ineligibleMessage}</Notice> : null}
      {data.limitReached ? <Notice testId="limit-reached">{data.limitMessage}</Notice> : null}

      {!reviewing ? (
        <Button disabled={!data.eligible || data.limitReached} onClick={() => setReviewing(true)}>
          Analisar
        </Button>
      ) : null}

      {reviewing && data.eligible ? (
        <div className="flex flex-col gap-3">
          <SentPreview
            summary={`O que será enviado: ${data.sentSummary}`}
            readable={data.readable}
            payload={data.payload}
          />
          {data.estimateInCents !== null ? (
            <p data-testid="usage-estimate" className="text-sm text-slate-700">
              Uso estimado: até <Money cents={data.estimateInCents} />
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-800 dark:text-red-300">
              {error}
            </p>
          ) : null}
          {request.isPending ? (
            <div role="status" aria-live="polite" className="flex flex-col gap-2">
              <Skeleton className="h-16" />
              <p className="text-sm text-slate-700">Analisando…</p>
              <Button variant="secondary" onClick={cancel}>
                Cancelar
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Button disabled={data.limitReached} onClick={send}>
                Enviar para análise
              </Button>
              <Button variant="ghost" onClick={() => setReviewing(false)}>
                Voltar
              </Button>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function Notice({ children, testId }: { children: React.ReactNode; testId: string }) {
  return (
    <p
      data-testid={testId}
      className="rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 dark:bg-slate-100"
    >
      {children}
    </p>
  );
}
