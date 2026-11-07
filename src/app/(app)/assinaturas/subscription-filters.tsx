"use client";

import { SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/ui/cn";
import { useCards } from "@/modules/cartoes/hooks";
import { memberOptionLabel } from "@/modules/familia/display-name";
import { useFamily } from "@/modules/familia/hooks";

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "min-h-11 rounded-full border px-4 text-sm font-medium",
        on
          ? "border-brand-700 bg-brand-700 text-white"
          : "border-slate-300 bg-white dark:bg-slate-100 text-slate-800",
      )}
    >
      {children}
    </button>
  );
}

export type SubscriptionFilter = { cardId?: string | undefined; payerId?: string | undefined };

/** Filtros por cartão e "Quem gastou" (chips), fechados por padrão como no Extrato (US-098). */
export function SubscriptionFilters({
  value,
  onChange,
}: {
  value: SubscriptionFilter;
  onChange: (v: SubscriptionFilter) => void;
}) {
  const [open, setOpen] = useState(false);
  const cards = useCards();
  const family = useFamily();
  const count = (value.cardId ? 1 : 0) + (value.payerId ? 1 : 0);
  return (
    <section aria-label="Filtros" className="flex flex-col gap-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="subscription-filters"
        onClick={() => setOpen(!open)}
        className="inline-flex min-h-11 items-center gap-2 self-start rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-800"
      >
        <SlidersHorizontal size={18} aria-hidden="true" />
        Filtros{count > 0 ? ` (${count})` : ""}
      </button>
      {open ? (
        <div id="subscription-filters" className="flex flex-col gap-3">
          <div role="group" aria-label="Cartão" className="flex flex-wrap gap-2">
            {(cards.data?.items ?? []).map((c) => (
              <Chip
                key={c.id}
                on={value.cardId === c.id}
                onClick={() =>
                  onChange({ ...value, cardId: value.cardId === c.id ? undefined : c.id })
                }
              >
                {c.name}
              </Chip>
            ))}
          </div>
          <div role="group" aria-label="Quem gastou" className="flex flex-wrap gap-2">
            {(family.data?.members ?? []).map((m) => (
              <Chip
                key={m.memberId}
                on={value.payerId === m.memberId}
                onClick={() =>
                  onChange({
                    ...value,
                    payerId: value.payerId === m.memberId ? undefined : m.memberId,
                  })
                }
              >
                {memberOptionLabel(m)}
              </Chip>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
