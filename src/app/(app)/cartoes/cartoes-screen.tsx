"use client";

import { MoreHorizontal, Pencil, Plus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/lib/money";
import { cycleSentence, formatInvoiceLabel } from "@/modules/cartoes/cycle";
import { useCards } from "@/modules/cartoes/hooks";
import type { CardDTO } from "@/modules/cartoes/schemas";
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
          Limite <span data-testid="card-limit">{formatBRL(card.limitInCents)}</span>
        </span>
        <span className="text-slate-600">
          Usado <span data-testid="card-used">{formatBRL(card.usedInCents)}</span>
        </span>
        <span className={over ? "font-semibold text-red-700" : "font-semibold text-slate-900"}>
          Disponível <span data-testid="card-available">{formatBRL(card.availableInCents)}</span>
        </span>
      </div>
    </div>
  );
}

function CardItem({ card, onEdit }: { card: CardDTO; onEdit: () => void }) {
  return (
    <li
      data-testid="card-item"
      className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-4"
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
          <MenuItem
            onClick={() => {
              close();
              onEdit();
            }}
          >
            <Pencil size={16} aria-hidden="true" />
            Editar
          </MenuItem>
        )}
      </Menu>
      <p data-testid="card-cycle" className="col-span-full text-sm text-slate-700">
        {cycleSentence(card.closingDay, card.dueDay)}
      </p>
      <UsageBar card={card} />
      <p data-testid="card-open-invoice" className="col-span-full text-sm text-slate-700">
        Fatura aberta{" "}
        <span className="font-semibold tabular-nums">
          {formatBRL(card.openInvoice.totalInCents)}
        </span>{" "}
        ({formatInvoiceLabel(card.openInvoice.ref)}) ·{" "}
        <Link
          href={`/cartoes/${card.id}?ref=${card.openInvoice.ref}`}
          className="font-medium text-brand-800 underline"
        >
          Ver fatura
        </Link>
      </p>
      {card.payableInvoices.map((p) => (
        <p
          key={p.ref}
          data-testid="card-payable-invoice"
          className="col-span-full flex flex-wrap items-center gap-x-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          <span className="font-semibold">
            {p.isOverdue ? "Vencida" : "A pagar"} · Fatura {formatInvoiceLabel(p.ref)}
          </span>
          <span className="tabular-nums">{formatBRL(p.totalInCents)}</span>
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

export function CartoesScreen() {
  const cards = useCards();
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
          <p className="text-sm text-red-800">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => cards.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {data && data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
          <p className="text-slate-700">Cadastre seu primeiro cartão</p>
          <Button onClick={() => setDrawer({ open: true, card: null })}>Novo cartão</Button>
        </div>
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {data.items.map((c) => (
            <CardItem key={c.id} card={c} onEdit={() => setDrawer({ open: true, card: c })} />
          ))}
        </ul>
      ) : null}

      <CardDrawer
        open={drawer.open}
        card={drawer.card}
        onClose={() => setDrawer({ open: false, card: null })}
      />
    </main>
  );
}
