"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useUndoTransfer } from "@/modules/contas/hooks";

/** "Desfazer acerto/transferência" com confirmação (SDD-001 §5.2, SDD-002 §6.1). */
export function UndoTransferDialog({
  groupId,
  version,
  isSettlement,
  onClose,
  onDone,
}: {
  groupId: string | null;
  version?: number;
  isSettlement: boolean;
  onClose: () => void;
  onDone?: () => void;
}) {
  const undo = useUndoTransfer();
  const [error, setError] = useState<string | null>(null);
  const noun = isSettlement ? "acerto" : "transferência";
  return (
    <Drawer
      open={groupId !== null}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onClose();
        }
      }}
      title={`Desfazer ${noun}?`}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-700">
          As duas pernas serão estornadas e os saldos voltam ao que eram antes. O histórico é
          mantido.
        </p>
        {error ? (
          <p
            role="alert"
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </p>
        ) : null}
        <Button
          variant="danger"
          disabled={undo.isPending}
          onClick={() =>
            groupId &&
            undo.mutate(
              {
                groupId,
                ...(version !== undefined ? { version } : {}),
                idempotencyKey: newIdempotencyKey(),
              },
              {
                onSuccess: () => {
                  toast.success(isSettlement ? "Acerto desfeito" : "Transferência desfeita");
                  onClose();
                  onDone?.();
                },
                onError: (e) => {
                  if (e instanceof NetworkError) setError(e.message);
                  else if (e instanceof ApiClientError) setError(e.message);
                  else setError("Erro inesperado. Tente novamente.");
                },
              },
            )
          }
        >
          {undo.isPending ? "Desfazendo…" : `Desfazer ${noun}`}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Drawer>
  );
}
