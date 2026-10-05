"use client";

import type { ReactNode } from "react";
import { Money, useMoneyText } from "@/components/money";
import { Skeleton } from "@/components/ui/skeleton";
import { useHistory } from "@/modules/transacoes/hooks";
import type { RevisionDTO } from "@/modules/transacoes/schemas";

const ACTION_LABEL: Record<RevisionDTO["action"], string> = {
  CREATE: "Criado",
  UPDATE: "Editado",
  DELETE: "Excluído",
  RESTORE: "Restaurado",
  UNDO: "Desfeito",
};

function show(
  field: string,
  value: unknown,
  mask: (t: string) => string,
  label?: string,
): ReactNode {
  if (label) return mask(label);
  if (value === null || value === undefined || value === "") return "—";
  if (field === "amountInCents") return <Money cents={Number(value)} />;
  if (field === "occurredOn") return String(value).split("-").reverse().join("/");
  if (field === "deletionReason") return value === "DELETED" ? "Excluído" : String(value);
  return String(value);
}

function when(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  });
}

export function HistoryList({ id }: { id: string }) {
  const history = useHistory(id, true);
  const mask = useMoneyText();
  if (history.isPending) return <Skeleton className="h-20" />;
  if (history.isError)
    return (
      <p role="alert" className="text-sm text-red-800 dark:text-red-300">
        Não foi possível carregar
      </p>
    );
  return (
    <ol aria-label="Histórico do lançamento" className="flex flex-col gap-3" data-testid="history">
      {history.data.items.map((r) => (
        <li
          key={`${r.revision}-${r.action}`}
          data-testid="history-item"
          className="rounded-lg border border-slate-200 p-3 text-sm"
        >
          <p className="font-medium text-slate-900">
            {ACTION_LABEL[r.action]} por {r.actor.name.split(" ")[0]} em {when(r.at)}
          </p>
          {r.action !== "CREATE"
            ? r.changes.map((c) => (
                <p key={c.field} className="text-slate-700">
                  {c.label}: {show(c.field, c.from, mask, c.fromLabel)} →{" "}
                  {show(c.field, c.to, mask, c.toLabel)}
                </p>
              ))
            : null}
        </li>
      ))}
    </ol>
  );
}
