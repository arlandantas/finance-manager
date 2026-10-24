"use client";

import Link from "next/link";
import { useState } from "react";
import { Money, useFormatMoney } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActivityItemDTO, LimitField } from "@/modules/mcp/activity-schemas";
import { useAssistantActivity } from "@/modules/mcp/hooks";
import { brDate, brTime } from "./format";
import { RevokeDialog } from "./revoke-dialog";

type Range = "7d" | "30d" | "month";
const RANGES: Array<{ id: Range; label: string }> = [
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "month", label: "Este mês" },
];

const LIMIT_TEXT: Record<LimitField, { label: string; money: boolean }> = {
  maxAmountPerTxCents: { label: "o limite por lançamento", money: true },
  maxTxPerDay: { label: "o limite de lançamentos por dia", money: false },
  maxTxPerHour: { label: "o limite de lançamentos por hora", money: false },
};

function LimitChangeText({ c }: { c: NonNullable<ActivityItemDTO["limitChange"]> }) {
  const fmt = useFormatMoney();
  const meta = LIMIT_TEXT[c.field];
  const show = (v: number | null) => (v === null ? "sem limite" : meta.money ? fmt(v) : String(v));
  return (
    <>
      Você alterou {meta.label}: {show(c.from)} para {show(c.to)}
    </>
  );
}

function ItemBody({ it }: { it: ActivityItemDTO }) {
  if (it.limitChange) return <LimitChangeText c={it.limitChange} />;
  if (it.transaction) {
    const t = it.transaction;
    return (
      <>
        {it.toolLabel === "Lançou despesa" ? "Lançou" : it.toolLabel} {t.description}{" "}
        <Money cents={t.amountInCents} />
        {t.deleted ? " · excluído depois" : ""}
      </>
    );
  }
  return (
    <>
      {it.toolLabel}
      {it.scopeText ? ` · ${it.scopeText}` : ""}
    </>
  );
}

function ActivityItem({ it }: { it: ActivityItemDTO }) {
  const good = it.outcome === "OK";
  return (
    <li
      data-testid="activity-item"
      data-outcome={it.outcome}
      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
    >
      <p className="text-xs text-slate-600">
        {brTime(it.at)} · {it.assistant.label}
      </p>
      <p className="font-medium text-slate-900">
        <ItemBody it={it} />
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span
          data-testid="activity-outcome"
          className={`rounded-full px-2 py-0.5 text-xs font-medium ${good ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}
        >
          {it.outcomeLabel}
        </span>
        {it.transaction && !it.transaction.deleted ? (
          <Link
            href={`/extrato?period=${it.transaction.occurredOn.slice(0, 7)}&highlight=${it.transaction.id}`}
            className="min-h-6 text-sm font-medium text-brand-700 underline"
          >
            Ver no Extrato
          </Link>
        ) : null}
      </div>
    </li>
  );
}

/** Aba "Atividade" (SDD-027 §5.2, rev. 2: um evento = um item). Só os eventos do próprio membro. */
export function ActivityPanel() {
  const [grantId, setGrantId] = useState("");
  const [range, setRange] = useState<Range>("30d");
  const [revoking, setRevoking] = useState<{ id: string; label: string } | null>(null);
  const q = useAssistantActivity({ ...(grantId ? { grantId } : {}), range });
  const pages = q.data?.pages ?? [];
  const items = pages.flatMap((p) => p.items);
  const assistants = pages[0]?.assistants ?? [];
  const selected = assistants.find((a) => a.grantId === grantId);

  const groups: Array<{ day: string; items: ActivityItemDTO[] }> = [];
  for (const it of items) {
    const day = brDate(it.at);
    const g = groups[groups.length - 1];
    if (g && g.day === day) g.items.push(it);
    else groups.push({ day, items: [it] });
  }

  return (
    <div className="flex flex-col gap-4" data-testid="activity-panel">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
          Assistente
          <select
            value={grantId}
            onChange={(e) => setGrantId(e.target.value)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:bg-slate-100"
          >
            <option value="">Todos os assistentes</option>
            {assistants.map((a) => (
              <option key={a.grantId} value={a.grantId}>
                {a.label}
                {a.status === "ACTIVE"
                  ? ""
                  : a.status === "REVOKED"
                    ? " (revogado)"
                    : " (expirado)"}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm font-medium text-slate-800">
          Período
          <select
            value={range}
            onChange={(e) => setRange(e.target.value as Range)}
            className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-base text-slate-900 dark:bg-slate-100"
          >
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selected?.status === "ACTIVE" ? (
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setRevoking({ id: selected.grantId, label: selected.label })}
        >
          Revogar este assistente
        </Button>
      ) : null}

      {q.isPending ? (
        <div aria-busy="true" aria-label="Carregando atividade" className="flex flex-col gap-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : null}
      {q.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
      {q.data && items.length === 0 ? (
        <p
          data-testid="activity-empty"
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:bg-slate-100"
        >
          Nenhuma atividade no período
        </p>
      ) : null}

      {groups.map((g) => (
        <section key={g.day} aria-label={g.day} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-slate-700">{g.day}</h3>
          <ul className="flex flex-col gap-2">
            {g.items.map((it) => (
              <ActivityItem key={it.id} it={it} />
            ))}
          </ul>
        </section>
      ))}

      {q.hasNextPage ? (
        <Button
          variant="secondary"
          className="self-start"
          disabled={q.isFetchingNextPage}
          onClick={() => q.fetchNextPage()}
        >
          Carregar mais
        </Button>
      ) : null}

      <RevokeDialog target={revoking} onClose={() => setRevoking(null)} />
    </div>
  );
}
