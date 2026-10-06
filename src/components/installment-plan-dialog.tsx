"use client";

import { Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import {
  INSTALLMENT_SPLIT_NOTICE,
  showInstallmentNotice,
} from "@/modules/cartoes/installment-copy";
import {
  useDefaults,
  useInstallmentPlan,
  useInstallmentPlanState,
} from "@/modules/transacoes/hooks";
import type { InstallmentParcelDTO, InstallmentPlanDTO } from "@/modules/transacoes/schemas";

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function parcelChip(p: InstallmentParcelDTO): { label: string; tone: string } {
  if (p.state === "REMOVED")
    return { label: "Removida", tone: "bg-red-50 text-red-800 dark:text-red-300" };
  if (p.invoice.status === "PAID")
    return { label: "Paga", tone: "bg-emerald-100 text-emerald-800 dark:text-emerald-300" };
  if (p.invoice.status === "CLOSED")
    return { label: "Fechada", tone: "bg-amber-100 text-amber-900 dark:text-amber-200" };
  if (p.invoice.isFuture) return { label: "Futura", tone: "bg-violet-50 text-violet-800" };
  return { label: "Aberta", tone: "bg-slate-100 text-slate-700" };
}

/**
 * "Ver compra" (US-040b, SDD-014 §6): total, parcelas com a fatura de cada uma e a ação de excluir a
 * compra inteira (com confirmação e "Desfazer" por 8 s). `startConfirming` abre direto na confirmação
 * (atalho "Excluir compra parcelada" do detalhe da parcela).
 */
export function InstallmentPlanDialog({
  planId,
  onClose,
  onDeleted,
  startConfirming = false,
}: {
  planId: string | null;
  onClose: () => void;
  /** Depois de excluir a compra (o "Desfazer" fica no aviso): quem abriu também pode se fechar. */
  onDeleted?: () => void;
  startConfirming?: boolean;
}) {
  const query = useInstallmentPlan(planId);
  const defaults = useDefaults(planId !== null);
  const plan = query.data?.plan;
  const del = useInstallmentPlanState("delete");
  const restore = useInstallmentPlanState("restore");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());

  useEffect(() => {
    if (planId) {
      setConfirming(startConfirming);
      setError(null);
      key.current = newIdempotencyKey();
    }
  }, [planId, startConfirming]);

  function undo(after: InstallmentPlanDTO) {
    restore.mutate(
      { id: after.id, input: { version: after.version }, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: () => toast.success("Compra parcelada restaurada"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Não foi possível desfazer"),
      },
    );
  }

  function remove(current: InstallmentPlanDTO) {
    setError(null);
    del.mutate(
      { id: current.id, input: { version: current.version }, idempotencyKey: key.current },
      {
        onSuccess: (res) => {
          setConfirming(false);
          toast.success("Compra parcelada excluída", {
            duration: 8000, // SDD-014 §6: "Desfazer" visível por pelo menos 8 s
            action: { label: "Desfazer", onClick: () => undo(res.plan) },
          });
          onClose();
          onDeleted?.();
        },
        onError: (e) => {
          // o bloqueio (INSTALLMENT_PLAN_LOCKED) mostra a mensagem do servidor SEM fechar o diálogo
          setConfirming(false);
          key.current = newIdempotencyKey();
          if (e instanceof ApiClientError || e instanceof NetworkError) setError(e.message);
          else setError("Erro inesperado. Tente novamente.");
        },
      },
    );
  }

  return (
    <Drawer
      open={planId !== null}
      onOpenChange={(open) => !open && onClose()}
      title={confirming ? "Excluir compra parcelada?" : "Compra parcelada"}
    >
      <div className="flex flex-col gap-4">
        {query.isPending ? (
          <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando a compra">
            <Skeleton className="h-8" />
            <Skeleton className="h-24" />
          </div>
        ) : null}
        {query.isError ? (
          <div role="alert" className="flex flex-col items-start gap-3">
            <p className="text-sm text-red-800 dark:text-red-300">
              Não foi possível carregar a compra
            </p>
            <Button variant="secondary" onClick={() => query.refetch()}>
              Tentar de novo
            </Button>
          </div>
        ) : null}
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
          >
            {error}
          </p>
        ) : null}

        {plan && confirming ? (
          <>
            <p className="text-sm text-slate-700">
              Todas as {plan.activeCount} parcelas serão excluídas e o limite do cartão será
              devolvido.
            </p>
            <Button variant="danger" disabled={del.isPending} onClick={() => remove(plan)}>
              {del.isPending ? "Excluindo…" : "Excluir compra parcelada"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => (startConfirming ? onClose() : setConfirming(false))}
            >
              Cancelar
            </Button>
          </>
        ) : null}

        {plan && !confirming ? (
          <>
            <header className="flex flex-col gap-1">
              <h3 className="text-base font-semibold text-slate-900">{plan.description}</h3>
              <p className="text-sm text-slate-600">
                {plan.category.name} · {plan.card.name} · {plan.count}x
              </p>
              <p
                data-testid="plan-total"
                className="text-2xl font-bold tabular-nums text-slate-900"
              >
                <Money cents={plan.totalInCents} />
              </p>
              {plan.currentTotalInCents !== plan.totalInCents ? (
                <p className="text-sm text-slate-600">
                  Total atual <Money cents={plan.currentTotalInCents} />
                </p>
              ) : null}
              {showInstallmentNotice(defaults.data?.split.available ?? false) ? (
                <p data-testid="plan-outside" className="text-sm text-slate-600">
                  <span className="font-semibold">Fora do acerto.</span> {INSTALLMENT_SPLIT_NOTICE}
                </p>
              ) : null}
              <p className="text-sm text-slate-600">
                Comprado em {brDate(plan.purchaseOn)} · pago por {plan.payer.name.split(" ")[0]}
              </p>
            </header>
            <table className="w-full text-sm" aria-label="Parcelas">
              <thead>
                <tr className="text-left text-xs text-slate-500">
                  <th className="py-1 pr-2 font-medium">Parcela</th>
                  <th className="py-1 pr-2 font-medium">Fatura</th>
                  <th className="py-1 pr-2 text-right font-medium">Valor</th>
                  <th className="py-1 font-medium">Situação</th>
                </tr>
              </thead>
              <tbody>
                {plan.installments.map((p) => {
                  const chip = parcelChip(p);
                  return (
                    <tr
                      key={p.transactionId}
                      data-testid="plan-parcel"
                      className={cn(
                        "border-t border-slate-100",
                        p.state === "REMOVED" && "text-slate-400 line-through",
                      )}
                    >
                      <td className="py-2 pr-2">
                        {p.no}/{plan.count}
                      </td>
                      <td className="py-2 pr-2">{formatInvoiceLabel(p.invoice.ref)}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">
                        <Money cents={p.amountInCents} />
                      </td>
                      <td className="py-2">
                        <span
                          className={cn("rounded-full px-2 py-0.5 text-xs font-medium", chip.tone)}
                        >
                          {chip.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {plan.deleted ? (
              <p className="text-sm text-slate-600">Esta compra foi excluída.</p>
            ) : plan.deleteBlockedReason === "INVOICE_PAID" ? (
              <p className="text-sm text-slate-600">Fatura paga</p>
            ) : (
              <Button variant="secondary" onClick={() => setConfirming(true)}>
                <Trash2 size={16} aria-hidden="true" />
                Excluir compra parcelada
              </Button>
            )}
          </>
        ) : null}
      </div>
    </Drawer>
  );
}
