"use client";

import { Archive, MoreHorizontal, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { cycleSentence, formatInvoiceLabel } from "@/modules/cartoes/cycle";
import { useArchivedCards, useCardAction, useCards } from "@/modules/cartoes/hooks";
import type { CardDTO } from "@/modules/cartoes/schemas";
import { useFamily } from "@/modules/familia/hooks";
import { CardDrawer } from "./card-drawer";

function UsageBar({ card }: { card: CardDTO }) {
  const pct =
    card.limitInCents > 0
      ? Math.min(100, Math.max(0, Math.round((card.usedInCents / card.limitInCents) * 100)))
      : 0;
  const over = card.availableInCents < 0;
  return (
    <div className="col-span-full flex flex-col gap-1.5">
      <div
        role="progressbar"
        aria-label={`Uso do limite de ${card.name}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="h-2 overflow-hidden rounded-full bg-slate-200"
      >
        <div
          className={over ? "h-full bg-red-600" : "h-full bg-brand-700"}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-x-3 text-sm">
        <span className="text-slate-600">
          Limite{" "}
          <span data-testid="card-limit">
            <Money cents={card.limitInCents} />
          </span>
        </span>
        <span className="text-slate-600">
          Usado{" "}
          <span data-testid="card-used">
            <Money cents={card.usedInCents} />
          </span>
        </span>
        <span
          className={
            over ? "font-semibold text-red-700 dark:text-red-300" : "font-semibold text-slate-900"
          }
        >
          Disponível{" "}
          <span data-testid="card-available">
            <Money cents={card.availableInCents} />
          </span>
        </span>
      </div>
    </div>
  );
}

function CardItem({
  card,
  isAdmin,
  onEdit,
  onArchive,
  onDelete,
}: {
  card: CardDTO;
  isAdmin: boolean;
  onEdit: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      data-testid="card-item"
      className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-4"
    >
      <Avatar name={card.owner.name} image={card.owner.image} size={40} />
      <div className="min-w-0">
        <Link
          href={`/cartoes/${card.id}`}
          className="block truncate font-semibold text-slate-900 hover:underline"
        >
          {card.name}
        </Link>
        <p className="truncate text-sm text-slate-500">
          {card.institution} · {card.owner.name.split(" ")[0]}
        </p>
      </div>
      <Menu
        label={`Ações do cartão ${card.name}`}
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
                onArchive();
              }}
            >
              <Archive size={16} aria-hidden="true" />
              Arquivar
            </MenuItem>
            {isAdmin && card.neverUsed ? (
              <MenuItem
                onClick={() => {
                  close();
                  onDelete();
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
                Excluir
              </MenuItem>
            ) : null}
          </>
        )}
      </Menu>
      <p data-testid="card-cycle" className="col-span-full text-sm text-slate-700">
        {cycleSentence(card.closingDay, card.dueDay)}
      </p>
      <UsageBar card={card} />
      <p data-testid="card-open-invoice" className="col-span-full text-sm text-slate-700">
        Fatura aberta{" "}
        <span className="font-semibold tabular-nums">
          <Money cents={card.openInvoice.totalInCents} />
        </span>{" "}
        ({formatInvoiceLabel(card.openInvoice.ref)}) ·{" "}
        <Link
          href={`/cartoes/${card.id}?ref=${card.openInvoice.ref}`}
          className="font-medium text-brand-800 dark:text-emerald-300 underline"
        >
          Ver fatura
        </Link>
      </p>
      {card.payableInvoices.map((p) => (
        <p
          key={p.ref}
          data-testid="card-payable-invoice"
          className="col-span-full flex flex-wrap items-center gap-x-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:text-amber-200"
        >
          <span className="font-semibold">
            {p.isOverdue ? "Vencida" : "A pagar"} · Fatura {formatInvoiceLabel(p.ref)}
          </span>
          <span className="tabular-nums">
            <Money cents={p.totalInCents} />
          </span>
          <span>
            vence {p.dueDate.slice(8, 10)}/{p.dueDate.slice(5, 7)}
          </span>
          <Link href={`/cartoes/${card.id}?ref=${p.ref}`} className="font-medium underline">
            Ver fatura
          </Link>
        </p>
      ))}
    </li>
  );
}

function ArchivedCards({
  onReactivate,
  busyId,
}: {
  onReactivate: (c: CardDTO) => void;
  busyId: string | null;
}) {
  const archived = useArchivedCards();
  const items = archived.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <details
      data-testid="archived-cards"
      className="rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-3"
    >
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-800">
        Cartões arquivados ({items.length})
      </summary>
      <ul className="flex flex-col divide-y divide-slate-100">
        {items.map((c) => (
          <li
            key={c.id}
            data-testid="archived-card"
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate text-slate-800">{c.name}</span>
            <Button variant="secondary" disabled={busyId === c.id} onClick={() => onReactivate(c)}>
              <RotateCcw size={16} aria-hidden="true" />
              Reativar
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function CartoesScreen() {
  const cards = useCards();
  const family = useFamily();
  const isAdmin = family.data?.currentRole === "ADMIN";
  const action = useCardAction();
  const keyRef = useRef(newIdempotencyKey());
  const [archiving, setArchiving] = useState<CardDTO | null>(null);
  const [deleting, setDeleting] = useState<CardDTO | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function run(c: CardDTO, kind: "archive" | "unarchive" | "delete", ok: string) {
    if (action.isPending) return;
    setBanner(null);
    setBusyId(c.id);
    action.mutate(
      { id: c.id, action: kind, version: c.version, idempotencyKey: keyRef.current },
      {
        onSuccess: () => {
          keyRef.current = newIdempotencyKey();
          setArchiving(null);
          setDeleting(null);
          setBlocked(null);
          toast.success(ok);
        },
        onError: (e) => {
          keyRef.current = newIdempotencyKey();
          if (
            e instanceof ApiClientError &&
            (e.code === "CARD_HAS_UNPAID_INVOICE" || e.code === "CARD_HAS_OPEN_PURCHASES")
          ) {
            setBlocked(e.message);
          } else if (e instanceof NetworkError) setBanner(e.message);
          else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
        onSettled: () => setBusyId(null),
      },
    );
  }

  const [drawer, setDrawer] = useState<{ open: boolean; card: CardDTO | null }>({
    open: false,
    card: null,
  });
  const data = cards.data;

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Cartões</h1>
        <Button onClick={() => setDrawer({ open: true, card: null })}>
          <Plus size={18} aria-hidden="true" />
          Novo cartão
        </Button>
      </header>

      {cards.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando cartões">
          <Skeleton className="h-36" />
          <Skeleton className="h-36" />
        </div>
      ) : null}

      {cards.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => cards.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {data && data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white dark:bg-slate-100 p-8 text-center">
          <p className="text-slate-700">Cadastre seu primeiro cartão</p>
          <Button onClick={() => setDrawer({ open: true, card: null })}>Novo cartão</Button>
        </div>
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {data.items.map((c) => (
            <CardItem
              key={c.id}
              card={c}
              isAdmin={isAdmin}
              onEdit={() => setDrawer({ open: true, card: c })}
              onArchive={() => {
                setBlocked(null);
                setBanner(null);
                setArchiving(c);
              }}
              onDelete={() => {
                setBanner(null);
                setDeleting(c);
              }}
            />
          ))}
        </ul>
      ) : null}

      {data ? (
        <ArchivedCards
          busyId={busyId}
          onReactivate={(c) => run(c, "unarchive", "Cartão reativado")}
        />
      ) : null}

      <Drawer
        open={archiving !== null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={archiving ? `Arquivar ${archiving.name}?` : "Arquivar cartão"}
      >
        {archiving ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              O cartão some das listas e do "Pagar com"; compras e faturas pagas permanecem e você
              pode reativá-lo depois.
            </p>
            {blocked ? (
              <p
                role="alert"
                className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm font-medium text-amber-900 dark:text-amber-200"
              >
                {blocked}
              </p>
            ) : null}
            {banner ? (
              <p role="alert" className="text-sm text-red-800 dark:text-red-300">
                {banner}
              </p>
            ) : null}
            <Button
              disabled={action.isPending}
              onClick={() => run(archiving, "archive", "Cartão arquivado")}
            >
              {action.isPending ? "Arquivando…" : "Arquivar"}
            </Button>
            <Button variant="ghost" onClick={() => setArchiving(null)}>
              Cancelar
            </Button>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Excluir ${deleting.name}?` : "Excluir cartão"}
      >
        {deleting ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              O cartão nunca teve compras. Ele some de todas as telas e o nome fica livre; isso não
              pode ser desfeito.
            </p>
            {banner ? (
              <p role="alert" className="text-sm text-red-800 dark:text-red-300">
                {banner}
              </p>
            ) : null}
            <Button
              variant="danger"
              disabled={action.isPending}
              onClick={() => run(deleting, "delete", "Cartão excluído")}
            >
              Excluir definitivamente
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
          </div>
        ) : null}
      </Drawer>

      <CardDrawer
        open={drawer.open}
        card={drawer.card}
        onClose={() => setDrawer({ open: false, card: null })}
      />
    </main>
  );
}
