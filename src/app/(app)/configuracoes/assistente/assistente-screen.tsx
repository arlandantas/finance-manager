"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import type { AssistantSettingsDTO, ConnectionDTO } from "@/modules/mcp/connections-schemas";
import { useAssistantSettings, useSetAssistantAccess } from "@/modules/mcp/hooks";
import { ActivityPanel } from "./activity-panel";
import { ConnectDialog } from "./connect-dialog";
import { brDate, brWhen } from "./format";
import { RevokeDialog } from "./revoke-dialog";
import { Tabs } from "./tabs";

function errorText(e: unknown): string {
  if (e instanceof ApiClientError || e instanceof NetworkError) return e.message;
  return "Erro inesperado. Tente novamente.";
}

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

function ConnectionCard({
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
      {c.redirectHost ? (
        <p className="text-sm text-slate-600">Conectado a {c.redirectHost}</p>
      ) : null}
      <p className="text-sm text-slate-600">
        {c.lastUsedAt ? `Último uso: ${brWhen(c.lastUsedAt)}` : "Nunca usado"}
      </p>
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

function FamilySwitch({ data }: { data: AssistantSettingsDTO }) {
  const set = useSetAssistantAccess();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const on = data.familyAllows;

  function apply(enabled: boolean) {
    setError(null);
    set.mutate(
      { enabled, familyVersion: data.familyVersion, idempotencyKey: keyRef.current },
      {
        onSuccess: () => {
          keyRef.current = newIdempotencyKey();
          setAsking(false);
          toast.success(
            enabled ? "Acesso por assistente permitido" : "Acesso por assistente bloqueado",
          );
        },
        onError: (e) => {
          keyRef.current = newIdempotencyKey();
          setError(errorText(e));
        },
      },
    );
  }

  return (
    <section
      aria-labelledby="family-switch-label"
      data-testid="family-switch"
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p id="family-switch-label" className="font-medium text-slate-900">
            Permitir acesso por assistente
          </p>
          {!data.canEditFamilySwitch ? (
            <p className="text-xs text-slate-600">
              {on ? "Permitido pela família" : "Bloqueado pelo Administrador"}
            </p>
          ) : null}
        </div>
        {data.canEditFamilySwitch ? (
          <button
            type="button"
            role="switch"
            aria-checked={on}
            aria-labelledby="family-switch-label"
            disabled={set.isPending}
            onClick={() => (on ? setAsking(true) : apply(true))}
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
        ) : null}
      </div>
      {error && !asking ? (
        <p role="alert" className="text-sm text-red-800 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <Drawer
        open={asking}
        onOpenChange={(o) => !o && setAsking(false)}
        title="Bloquear o acesso por assistente?"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-800">
            Desligar desconecta os assistentes de todos os membros. Continuar?
          </p>
          {error ? (
            <p role="alert" className="text-sm text-red-800 dark:text-red-300">
              {error}
            </p>
          ) : null}
          <Button variant="danger" disabled={set.isPending} onClick={() => apply(false)}>
            Desligar
          </Button>
          <Button variant="ghost" onClick={() => setAsking(false)}>
            Cancelar
          </Button>
        </div>
      </Drawer>
    </section>
  );
}

function ConnectionsPanel({ data }: { data: AssistantSettingsDTO }) {
  const [connecting, setConnecting] = useState(false);
  const [target, setTarget] = useState<ConnectionDTO | null>(null);
  const active = data.items.filter((c) => c.status === "ACTIVE");

  return (
    <div className="flex flex-col gap-3">
      {data.items.length === 0 ? (
        <p
          data-testid="no-connections"
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:bg-slate-100"
        >
          Nenhum assistente conectado
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {data.items.map((c) => (
            <ConnectionCard key={c.id} c={c} onRevoke={setTarget} />
          ))}
        </ul>
      )}
      {data.familyAllows ? (
        <Button className="self-start" onClick={() => setConnecting(true)}>
          {active.length === 0 ? "Conectar um assistente" : "Conectar outro assistente"}
        </Button>
      ) : null}

      <ConnectDialog open={connecting} onOpenChange={setConnecting} mcpUrl={data.mcpUrl} />
      <RevokeDialog target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

/** Configurações ▸ Assistente de IA (SDD-025 §4.2). */
export function AssistenteScreen() {
  const settings = useAssistantSettings();
  const data = settings.data;

  return (
    <main className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href="/familia" className="text-sm text-brand-700 underline">
          Voltar para Família
        </Link>
        <h1 className="text-2xl font-semibold text-slate-900">Assistente de IA</h1>
      </header>

      {settings.isPending ? (
        <div
          aria-busy="true"
          aria-label="Carregando assistente de IA"
          className="flex flex-col gap-3"
        >
          <Skeleton className="h-16" />
          <Skeleton className="h-24" />
        </div>
      ) : null}

      {settings.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => settings.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {data && !data.enabled ? (
        <p
          data-testid="assistant-unavailable"
          className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:bg-slate-100"
        >
          O acesso por assistente ainda não está disponível.
        </p>
      ) : null}

      {data?.enabled ? (
        <>
          <FamilySwitch data={data} />
          {data.blockedNotice ? (
            <p
              role="status"
              data-testid="blocked-notice"
              className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
            >
              {data.blockedNotice}
            </p>
          ) : null}
          <Tabs
            tabs={[
              { id: "conexoes", label: "Conexões", content: <ConnectionsPanel data={data} /> },
              { id: "atividade", label: "Atividade", content: <ActivityPanel /> },
            ]}
          />
        </>
      ) : null}
    </main>
  );
}
