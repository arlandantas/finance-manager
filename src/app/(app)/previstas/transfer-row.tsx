"use client";

import { ArrowRight, MoreHorizontal, Pencil, Repeat, Trash2 } from "lucide-react";
import Link from "next/link";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import type { PlannedTransferDTO } from "@/modules/previstas/transfer-schemas";

const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Chip({ children, tone }: { children: string; tone: "late" | "done" | "series" }) {
  return (
    <span
      className={
        tone === "late"
          ? "rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:text-red-300"
          : tone === "series"
            ? "inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800"
            : "rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800 dark:text-emerald-300"
      }
    >
      {children}
    </span>
  );
}

export function TransferRow({
  item,
  onRealize,
  onEdit,
  onDelete,
  onEditSeries,
  onEndSeries,
}: {
  item: PlannedTransferDTO;
  onRealize: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onEditSeries: () => void;
  onEndSeries: () => void;
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
                {item.seriesId ? (
                  <>
                    <MenuItem
                      onClick={() => {
                        close();
                        onEditSeries();
                      }}
                    >
                      <Repeat size={16} aria-hidden="true" />
                      Editar série
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        close();
                        onEndSeries();
                      }}
                    >
                      <Repeat size={16} aria-hidden="true" />
                      Encerrar série
                    </MenuItem>
                  </>
                ) : null}
              </>
            )}
          </Menu>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {item.seriesId ? <Chip tone="series">Todo mês</Chip> : null}
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
