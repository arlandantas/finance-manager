"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import {
  newConnectionsKey,
  useDismissNewConnection,
  useNewConnectionNotices,
  useRevokeConnection,
} from "@/modules/mcp/hooks";

const WHEN = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const errorText = (e: unknown) =>
  e instanceof ApiClientError || e instanceof NetworkError
    ? e.message
    : "Erro inesperado. Tente novamente.";

/**
 * SEC-011 / U4 (SDD-028 §4.4a): "Nova conexão: Claude, em 24/10 14:32. Não foi você? Revogar", até ser
 * dispensado. Só as conexões do próprio membro.
 */
export function NewConnectionCard() {
  const qc = useQueryClient();
  const notices = useNewConnectionNotices();
  const dismiss = useDismissNewConnection();
  const revoke = useRevokeConnection();
  const items = notices.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <section
      aria-label="Nova conexão de assistente"
      data-testid="new-connection"
      className="flex flex-col gap-2 rounded-2xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-700 dark:bg-slate-100"
    >
      {items.map((n) => (
        <div key={n.id} data-testid="new-connection-item" className="flex flex-col gap-2">
          <p className="break-words text-sm font-medium text-slate-900">
            Nova conexão: {n.label}, em {WHEN.format(new Date(n.createdAt)).replace(",", "")}. Não
            foi você?
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="danger"
              disabled={revoke.isPending}
              onClick={() =>
                revoke.mutate(
                  { id: n.id, idempotencyKey: newIdempotencyKey() },
                  {
                    onSuccess: () => {
                      void qc.invalidateQueries({ queryKey: newConnectionsKey });
                      toast.success("Conexão revogada");
                    },
                    onError: (e) => toast.error(errorText(e)),
                  },
                )
              }
            >
              Revogar
            </Button>
            <Button
              variant="ghost"
              disabled={dismiss.isPending}
              onClick={() =>
                dismiss.mutate(
                  { id: n.id, idempotencyKey: newIdempotencyKey() },
                  { onError: (e) => toast.error(errorText(e)) },
                )
              }
            >
              Fui eu
            </Button>
          </div>
        </div>
      ))}
    </section>
  );
}
