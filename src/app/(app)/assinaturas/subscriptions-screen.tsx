"use client";

import { Plus } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { SegmentedChoice } from "@/components/ui/segmented-choice";
import { Skeleton } from "@/components/ui/skeleton";
import { useSubscriptions } from "@/modules/assinaturas/hooks";
import type { SubscriptionDTO } from "@/modules/assinaturas/schemas";
import { useCards } from "@/modules/cartoes/hooks";
import { SubscriptionDrawer } from "../cartoes/[id]/subscription-drawer";
import { SubscriptionEditDrawer } from "../cartoes/[id]/subscription-edit-drawer";
import { SubscriptionFilters } from "./subscription-filters";

type Tab = "ativas" | "encerradas";
const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function Row({ s, onOpen }: { s: SubscriptionDTO; onOpen: (s: SubscriptionDTO) => void }) {
  const body = (
    <>
      <span className="flex min-w-0 flex-col">
        <span className="break-words font-medium text-slate-900">
          {s.description}
          {s.amendedThisMonth ? (
            <span
              data-testid="subscription-amended-badge"
              className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900"
            >
              alterada
            </span>
          ) : null}
        </span>
        <span className="break-words text-sm text-slate-600">
          {s.card.name}
          {s.card.archived ? " (arquivado)" : ""} · {s.payer.name.split(" ")[0]} · todo dia{" "}
          {s.dayOfMonth}
        </span>
        {s.endedOn ? (
          <span data-testid="subscription-ended-on" className="text-sm text-slate-600">
            Encerrada em {brDate(s.endedOn)}
          </span>
        ) : null}
      </span>
      <span className="whitespace-nowrap font-semibold tabular-nums text-slate-900">
        <Money cents={s.currentAmountInCents} />
      </span>
    </>
  );
  const cls = "flex min-h-11 w-full items-baseline justify-between gap-3 p-3 text-left";
  return (
    <li
      data-testid="subscription-row"
      className="rounded-lg border border-slate-200 bg-white dark:bg-slate-100"
    >
      {s.canEdit ? (
        <button
          type="button"
          data-testid="subscription-open"
          aria-label={`Editar assinatura ${s.description}`}
          onClick={() => onOpen(s)}
          className={cls}
        >
          {body}
        </button>
      ) : (
        <div className={cls}>{body}</div>
      )}
    </li>
  );
}

/** Lista de assinaturas, total mensal e por cartão (US-098, spec 12). Informativo: não soma fatura nem Resumo. */
export function SubscriptionsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const tab: Tab = useSearchParams().get("tab") === "encerradas" ? "encerradas" : "ativas";
  const [filter, setFilter] = useState<{
    cardId?: string | undefined;
    payerId?: string | undefined;
  }>({});
  const subs = useSubscriptions({ status: tab === "ativas" ? "active" : "ended", ...filter });
  const cards = useCards();
  const [editing, setEditing] = useState<SubscriptionDTO | null>(null);
  const [picking, setPicking] = useState(false);
  const [newCard, setNewCard] = useState<{ id: string; name: string; closingDay: number } | null>(
    null,
  );
  const data = subs.data;
  const filtered = filter.cardId !== undefined || filter.payerId !== undefined;

  return (
    <main className="flex flex-col gap-4 pb-24 lg:pb-0">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Assinaturas</h1>
          <Link href="/cartoes" className="text-sm font-medium text-slate-800 underline">
            Voltar a Cartões
          </Link>
        </div>
        <Button onClick={() => setPicking(true)}>
          <Plus size={18} aria-hidden="true" />
          Nova assinatura
        </Button>
      </header>

      <SegmentedChoice
        variant="tabs"
        label="Situação"
        value={tab}
        onChange={(v) => router.replace(v === "ativas" ? pathname : `${pathname}?tab=${v}`)}
        options={[
          { value: "ativas", label: "Ativas" },
          { value: "encerradas", label: "Encerradas" },
        ]}
      />
      <SubscriptionFilters value={filter} onChange={setFilter} />

      {subs.isPending ? (
        <div aria-busy="true" aria-label="Carregando assinaturas" className="flex flex-col gap-2">
          <Skeleton className="h-20" />
          <Skeleton className="h-16" />
        </div>
      ) : null}

      {subs.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-red-800 dark:text-red-300">
            Não foi possível carregar as assinaturas
          </p>
          <Button variant="secondary" onClick={() => void subs.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {data && tab === "ativas" && data.items.length > 0 ? (
        <section
          aria-label="Total por mês"
          className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-4"
        >
          <p className="text-sm font-medium text-slate-700">Total por mês</p>
          <p data-testid="subscriptions-total" className="text-3xl font-semibold text-slate-900">
            <Money cents={data.totalInCents} />
          </p>
          <ul className="flex flex-col gap-1">
            {data.byCard.map((c) => (
              <li
                key={c.cardId}
                data-testid="subscriptions-by-card"
                className="flex justify-between gap-3 text-sm text-slate-700"
              >
                <span className="min-w-0 break-words">{c.cardName}</span>
                <span className="whitespace-nowrap font-semibold tabular-nums">
                  <Money cents={c.totalInCents} />
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-600">Informativo: não entra na fatura nem no Resumo.</p>
        </section>
      ) : null}

      {data && data.items.length === 0 ? (
        <div
          data-testid="subscriptions-empty"
          className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white dark:bg-slate-100 p-8 text-center"
        >
          <p className="text-slate-700">
            {tab === "encerradas"
              ? "Nenhuma assinatura encerrada"
              : filtered
                ? "Nenhuma assinatura neste filtro"
                : "Nenhuma assinatura. Cadastre a primeira"}
          </p>
          {tab === "ativas" && !filtered ? (
            <Button onClick={() => setPicking(true)}>Cadastrar assinatura</Button>
          ) : null}
        </div>
      ) : null}

      {data && data.items.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {data.items.map((s) => (
            <Row key={s.id} s={s} onOpen={setEditing} />
          ))}
        </ul>
      ) : null}

      <Drawer open={picking} onOpenChange={setPicking} title="Escolha o cartão">
        <div className="flex flex-col gap-2">
          {(cards.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-slate-700">Cadastre um cartão antes de criar assinaturas.</p>
          ) : null}
          {(cards.data?.items ?? []).map((c) => (
            <Button
              key={c.id}
              variant="secondary"
              onClick={() => {
                setPicking(false);
                setNewCard({ id: c.id, name: c.name, closingDay: c.closingDay });
              }}
            >
              {c.name}
            </Button>
          ))}
        </div>
      </Drawer>
      {newCard ? <SubscriptionDrawer open card={newCard} onClose={() => setNewCard(null)} /> : null}
      <SubscriptionEditDrawer sub={editing} onClose={() => setEditing(null)} />
    </main>
  );
}
