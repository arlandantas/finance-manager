"use client";

import { Plus } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import {
  useDeletePlannedTransfer,
  useOpenPlannedTransfers,
  usePlannedTransfers,
} from "@/modules/previstas/transfer-hooks";
import type { PlannedTransferDTO } from "@/modules/previstas/transfer-schemas";
import { useDefaults } from "@/modules/transacoes/hooks";
import { PlannedTransferDrawer } from "./planned-transfer-drawer";
import { RealizeTransferDrawer } from "./realize-transfer-drawer";
import { TransferRow } from "./transfer-row";
import { TransferSeriesEditDrawer } from "./transfer-series-edit";
import { TransferSeriesEndDrawer } from "./transfer-series-end";

/** US-100b: aba "Transferências" da tela Previstas (lista, cadastro, edição, exclusão, efetivação). */
export function TransfersTab({
  period,
  range,
}: {
  period: string | undefined;
  range: { start: string; end: string } | undefined;
}) {
  const monthly = usePlannedTransfers(period);
  const today = useDefaults(true).data?.today;
  const isCurrent = Boolean(range && today && range.start <= today && today <= range.end);
  const open = useOpenPlannedTransfers(isCurrent);
  // período corrente: atrasadas de meses anteriores primeiro (mesma regra do "A pagar")
  const earlier = isCurrent
    ? (open.data?.items ?? []).filter((i) => range && i.isOverdue && i.dueOn < range.start)
    : [];
  const list = {
    isPending: monthly.isPending || (isCurrent && open.isPending),
    isError: monthly.isError || (isCurrent && open.isError),
    refetch: () => Promise.all([monthly.refetch(), open.refetch()]),
    data: monthly.data ? { items: [...earlier, ...monthly.data.items] } : undefined,
  };
  const del = useDeletePlannedTransfer();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<PlannedTransferDTO | null>(null);
  const [realizing, setRealizing] = useState<PlannedTransferDTO | null>(null);
  const [deleting, setDeleting] = useState<PlannedTransferDTO | null>(null);
  const [editingSeries, setEditingSeries] = useState<string | null>(null);
  const [endingSeries, setEndingSeries] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteKey = useRef(newIdempotencyKey());

  function confirmDelete() {
    if (!deleting) return;
    del.mutate(
      { id: deleting.id, version: deleting.version, idempotencyKey: deleteKey.current },
      {
        onSuccess: () => {
          toast.success("Transferência prevista excluída");
          setDeleting(null);
        },
        onError: (e) =>
          setDeleteError(
            e instanceof ApiClientError || e instanceof NetworkError
              ? e.message
              : "Erro inesperado. Tente novamente.",
          ),
      },
    );
  }

  return (
    <>
      <div className="flex justify-end">
        <Button onClick={() => setCreating(true)}>
          <Plus size={18} aria-hidden="true" />
          Nova transferência prevista
        </Button>
      </div>

      {list.isPending ? (
        <div
          className="flex flex-col gap-2"
          aria-busy="true"
          aria-label="Carregando transferências"
        >
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      ) : null}

      {list.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => list.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {list.data && list.data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center dark:bg-slate-100">
          <p className="text-slate-700">
            Nenhuma transferência prevista neste mês. Ela só muda os saldos quando você efetiva.
          </p>
        </div>
      ) : null}

      {list.data && list.data.items.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Transferências previstas">
          {list.data.items.map((item) => (
            <TransferRow
              key={item.id}
              item={item}
              onRealize={() => setRealizing(item)}
              onEdit={() => setEditing(item)}
              onEditSeries={() => setEditingSeries(item.seriesId)}
              onEndSeries={() => setEndingSeries(item.seriesId)}
              onDelete={() => {
                deleteKey.current = newIdempotencyKey();
                setDeleteError(null);
                setDeleting(item);
              }}
            />
          ))}
        </ul>
      ) : null}

      <PlannedTransferDrawer open={creating} transfer={null} onClose={() => setCreating(false)} />
      <PlannedTransferDrawer
        open={editing !== null}
        transfer={editing}
        onClose={() => setEditing(null)}
      />
      <RealizeTransferDrawer transfer={realizing} onClose={() => setRealizing(null)} />
      <TransferSeriesEditDrawer seriesId={editingSeries} onClose={() => setEditingSeries(null)} />
      <TransferSeriesEndDrawer seriesId={endingSeries} onClose={() => setEndingSeries(null)} />

      <Drawer
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Excluir transferência prevista?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            A previsão deixa de aparecer. Nenhum saldo ou lançamento é alterado.
          </p>
          {deleteError ? (
            <p role="alert" className="text-sm text-red-700 dark:text-red-300">
              {deleteError}
            </p>
          ) : null}
          <Button variant="danger" disabled={del.isPending} onClick={confirmDelete}>
            {del.isPending ? "Excluindo…" : "Excluir"}
          </Button>
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancelar
          </Button>
        </div>
      </Drawer>
    </>
  );
}
