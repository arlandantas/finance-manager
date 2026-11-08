"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import type { ConnectionDTO } from "@/modules/mcp/connections-schemas";
import { useSetConfirmation } from "@/modules/mcp/proposal-hooks";
import { brDate, brWhen } from "./format";

const REASON_LABEL: Record<NonNullable<ConnectionDTO["revokedReason"]>, string> = {
  MEMBER: "Revogado",
  CLIENT: "Revogado",
  FAMILY_BLOCKED: "Revogado pelo bloqueio da família",
  MEMBER_REMOVED: "Revogado pela saída da família",
  REFRESH_REUSE: "Revogado por segurança",
  CODE_REUSE: "Revogado por segurança",
};

function StatusLine({ c }: { c: ConnectionDTO }) {
  if (c.status === "REVOKED") {
    const label = c.revokedReason ? REASON_LABEL[c.revokedReason] : "Revogado";
    const simple = label === "Revogado";
    return (
      <p
        data-testid="connection-status"
        className="text-xs font-medium text-red-800 dark:text-red-300"
      >
        {simple && c.revokedAt ? `Revogado em ${brDate(c.revokedAt)}` : label}
      </p>
    );
  }
  if (c.status === "EXPIRED") {
    return (
      <p
        data-testid="connection-status"
        className="text-xs font-medium text-amber-800 dark:text-amber-300"
      >
        Expirado em {brDate(c.expiresAt)}
      </p>
    );
  }
  return null;
}

export function ConnectionCard({
  c,
  onRevoke,
}: {
  c: ConnectionDTO;
  onRevoke: (c: ConnectionDTO) => void;
}) {
  const active = c.status === "ACTIVE";
  return (
    <li
      data-testid="connection"
      data-status={c.status}
      className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
    >
      <p className="font-medium text-slate-900">
        {c.label} · {c.scopeLabel}
        {active ? ` · expira em ${brDate(c.expiresAt)}` : ""}
      </p>
      <StatusLine c={c} />
      {c.kind === "PAT" ? (
        <p data-testid="connection-kind" className="text-sm text-slate-600">
          Token pessoal
        </p>
      ) : null}
      {c.redirectHost ? (
        <p className="text-sm text-slate-600">Conectado a {c.redirectHost}</p>
      ) : null}
      <p className="text-sm text-slate-600">
        {c.lastUsedAt ? `Último uso: ${brWhen(c.lastUsedAt)}` : "Nunca usado"}
      </p>
      {active && c.scopes.includes("write") ? <ConfirmationToggle c={c} /> : null}
      {active ? (
        <div className="mt-1 flex gap-2">
          <Button variant="secondary" onClick={() => onRevoke(c)}>
            Revogar
          </Button>
        </div>
      ) : null}
    </li>
  );
}

/** US-076c: por conexão, desligado por padrão. Ligado, o assistente só propõe e o membro confirma no app. */
function ConfirmationToggle({ c }: { c: ConnectionDTO }) {
  const set = useSetConfirmation();
  const keyRef = useRef(newIdempotencyKey());
  const [error, setError] = useState<string | null>(null);
  const [warn, setWarn] = useState(false);
  const on = c.requireConfirmation;
  const labelId = `confirm-${c.id}`;

  function toggle(confirmed = false) {
    setError(null);
    // US-074c (ADR-043 §9): desligar a confirmação de um token pessoal aumenta o risco: pede ciência antes
    if (on && c.kind === "PAT" && !confirmed) {
      setWarn(true);
      return;
    }
    setWarn(false);
    set.mutate(
      {
        id: c.id,
        requireConfirmation: !on,
        ...(confirmed ? { riskAcknowledged: true as const } : {}),
        idempotencyKey: keyRef.current,
      },
      {
        onSuccess: () => {
          keyRef.current = newIdempotencyKey();
          toast.success(on ? "Lançamento direto ativado" : "Confirmação no app ativada");
        },
        onError: (e) => {
          keyRef.current = newIdempotencyKey();
          setError(
            e instanceof ApiClientError || e instanceof NetworkError
              ? e.message
              : "Erro inesperado. Tente novamente.",
          );
        },
      },
    );
  }

  return (
    <div data-testid="confirmation-toggle" className="mt-1 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p id={labelId} className="text-sm font-medium text-slate-900">
            Exigir confirmação no app
          </p>
          <p className="text-xs text-slate-600">
            {on
              ? "O assistente só propõe; você confirma cada lançamento."
              : "O assistente lança direto, dentro dos seus limites."}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby={labelId}
          disabled={set.isPending}
          onClick={() => toggle()}
          className="flex min-h-11 min-w-12 shrink-0 items-center justify-center disabled:opacity-60"
        >
          <span
            aria-hidden="true"
            className={`relative block h-7 w-12 rounded-full transition-colors ${on ? "bg-brand-700" : "bg-slate-300"}`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all dark:bg-slate-100 ${on ? "left-[22px]" : "left-0.5"}`}
            />
          </span>
        </button>
      </div>
      {warn ? (
        <div
          role="alert"
          data-testid="confirmation-risk"
          className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:text-amber-200"
        >
          <p>
            Sem a confirmação, quem tiver este token lança despesas direto, dentro dos seus limites.
            O token fica em texto claro na máquina onde foi colado. Desligar mesmo assim?
          </p>
          <div className="flex gap-2">
            <Button variant="danger" disabled={set.isPending} onClick={() => toggle(true)}>
              Desligar mesmo assim
            </Button>
            <Button variant="ghost" onClick={() => setWarn(false)}>
              Manter
            </Button>
          </div>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-800 dark:text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
