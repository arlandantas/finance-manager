"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useRevokeConnection } from "@/modules/mcp/hooks";

/** Confirmação de revogação (SDD-025 §4.2), usada na lista de conexões e na Atividade (US-077). */
export function RevokeDialog({
  target,
  onClose,
}: {
  target: { id: string; label: string } | null;
  onClose: () => void;
}) {
  const revoke = useRevokeConnection();
  const [error, setError] = useState<string | null>(null);
  const keyRef = useRef(newIdempotencyKey());

  function confirm() {
    if (!target) return;
    setError(null);
    revoke.mutate(
      { id: target.id, idempotencyKey: keyRef.current },
      {
        onSuccess: () => {
          keyRef.current = newIdempotencyKey();
          toast.success(`${target.label} revogado`);
          onClose();
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
    <Drawer
      open={target !== null}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onClose();
        }
      }}
      title={`Revogar ${target?.label ?? ""}?`}
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-slate-800">
          Revogar {target?.label}? O assistente deixa de acessar seus dados na hora.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-red-800 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <Button variant="danger" disabled={revoke.isPending} onClick={confirm}>
          Revogar
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Drawer>
  );
}
