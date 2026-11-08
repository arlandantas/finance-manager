"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useUndoInvoicePayment } from "@/modules/cartoes/hooks";

/** Desfazer pagamento da fatura (chave de idempotência por abertura do diálogo). */
export function UndoPaymentDrawer({
  cardId,
  invoiceRef,
  paymentVersion,
  open,
  onOpenChange,
}: {
  cardId: string;
  invoiceRef: string;
  paymentVersion: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const undo = useUndoInvoicePayment();
  const wasOpen = useRef(false);
  if (open && !wasOpen.current) {
    key.current = newIdempotencyKey();
    if (error) setError(null);
  }
  wasOpen.current = open;

  function confirm() {
    if (paymentVersion === null) return;
    undo.mutate(
      { cardId, ref: invoiceRef, version: paymentVersion, idempotencyKey: key.current },
      {
        onSuccess: () => {
          toast.success("Pagamento desfeito");
          onOpenChange(false);
        },
        onError: (e) => {
          if (e instanceof ApiClientError || e instanceof NetworkError) setError(e.message);
          else setError("Erro inesperado. Tente novamente.");
        },
      },
    );
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Desfazer pagamento?">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-700">
          O valor volta para a conta, a fatura volta a ficar em aberto para pagamento e as compras
          voltam a consumir o limite.
        </p>
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <Button variant="danger" disabled={undo.isPending} onClick={confirm}>
          {undo.isPending ? "Desfazendo…" : "Desfazer pagamento"}
        </Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
      </div>
    </Drawer>
  );
}
