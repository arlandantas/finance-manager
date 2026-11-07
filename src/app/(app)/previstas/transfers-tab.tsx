"use client";

import { ArrowRight, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Menu, MenuItem } from "@/components/ui/menu";
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

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Chip({ children, tone }: { children: string; tone: "late" | "done" }) {
  return (
    <span
      className={
        tone === "late"
          ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:text-red-300"
          : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300"
      }
    >
      {children}
    </span>
  );
}

function TransferRow({
  item,
  onRealize,
  onEdit,
  onDelete,
}: {
  item: PlannedTransferDTO;
  onRealize: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const label = item.description ?? `${item.from.name} para ${item.to.name}`;
  const done = item.status === "EFETIVADA";
  return (
    <li
      id={item.id}
      data-testid="planned-transfer-item"
      data-overdue={item.isOverdue ? "true" : undefined}
      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
    >
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-1 font-semibold text-slate-900">
          <span className="break-words">{item.from.name}</span>
          <ArrowRight size={14} aria-hidden="true" className="shrink-0" />
          <span className="break-words">{item.to.name}</span>
        </p>
        <p className="text-sm text-slate-600">
          Vence {brDate(item.dueOn)}
          {item.description ? ` · ${item.description}` : ""}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="mr-auto font-semibold tabular-nums text-slate-900">
          <Money cents={item.amountInCents} />
        </span>
        {done ? null : (
          <Button variant="secondary" aria-label={`Efetivar ${label}`} onClick={onRealize}>
            Efetivar
          </Button>
        )}
        {done ? null : (
          <Menu
            label={`Ações de ${label}`}
            trigger={<MoreHorizontal size={20} aria-hidden="true" />}
          >
            {(close) => (
              <>
                <MenuItem
                  onClick={() => {
                    close();
                    onEdit();
                  }}
                >
                  <Pencil size={16} aria-hidden="true" />
                  Editar
                </MenuItem>
                <MenuItem
                  onClick={() => {
                    close();
                    onDelete();
                  }}
                >
                  <Trash2 size={16} aria-hidden="true" />
                  Excluir
                </MenuItem>
              </>
            )}
          </Menu>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {item.isOverdue ? <Chip tone="late">Atrasada</Chip> : null}
        {done ? <Chip tone="done">Efetivada</Chip> : null}
        {done ? (
          <Link
            href="/extrato"
            className="inline-flex min-h-11 items-center text-sm font-medium text-brand-700 underline"
          >
            Ver transferência
          </Link>
        ) : null}
      </div>
    </li>
  );
}

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
