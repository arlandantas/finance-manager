"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import type { AssistantSettingsDTO } from "@/modules/mcp/connections-schemas";
import { useSetPatEnabled } from "@/modules/mcp/hooks";

/** US-074c: chave "Permitir token pessoal" (só o Administrador; desligar revoga os tokens pessoais da família). */
export function PatSwitch({ data }: { data: AssistantSettingsDTO }) {
  const set = useSetPatEnabled();
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());
  const on = data.patEnabled.family;

  function apply(patEnabled: boolean) {
    setError(null);
    set.mutate(
      { patEnabled, familyVersion: data.familyVersion, idempotencyKey: keyRef.current },
      {
        onSuccess: () => {
          keyRef.current = newIdempotencyKey();
          setAsking(false);
          toast.success(patEnabled ? "Token pessoal permitido" : "Token pessoal desligado");
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
    <section
      aria-labelledby="pat-switch-label"
      data-testid="pat-switch"
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:bg-slate-100"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p id="pat-switch-label" className="font-medium text-slate-900">
            Permitir token pessoal
          </p>
          <p className="text-xs text-slate-600">
            Membros poderão gerar tokens para IDEs e terminais. Desligado por padrão.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-labelledby="pat-switch-label"
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
      </div>
      {error && !asking ? (
        <p role="alert" className="text-sm text-red-800 dark:text-red-300">
          {error}
        </p>
      ) : null}
      <Drawer
        open={asking}
        onOpenChange={(o) => !o && setAsking(false)}
        title="Desligar o token pessoal?"
      >
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-800">
            Os tokens pessoais de todos os membros deixam de funcionar agora. As conexões por login
            (OAuth) continuam. Continuar?
          </p>
          {error ? (
            <p role="alert" className="text-sm text-red-800 dark:text-red-300">
              {error}
            </p>
          ) : null}
          <Button variant="danger" disabled={set.isPending} onClick={() => apply(false)}>
            Desligar token pessoal
          </Button>
          <Button variant="ghost" onClick={() => setAsking(false)}>
            Cancelar
          </Button>
        </div>
      </Drawer>
    </section>
  );
}
