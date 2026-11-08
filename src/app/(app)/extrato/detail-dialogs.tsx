"use client";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";

/** Confirmação de exclusão, conflito de versão e mês acertado do detalhe do lançamento. */
export function DetailDialogs({
  confirmingDelete,
  onConfirmingDelete,
  deleting,
  isParcel,
  onDelete,
  conflictMsg,
  onCloseConflict,
  onReload,
  settled,
  onCloseSettled,
}: {
  confirmingDelete: boolean;
  onConfirmingDelete: (open: boolean) => void;
  deleting: boolean;
  isParcel: boolean;
  onDelete: () => void;
  conflictMsg: string | null;
  onCloseConflict: () => void;
  onReload: () => void;
  settled: { message: string; resend: () => void } | null;
  onCloseSettled: () => void;
}) {
  return (
    <>
      <Drawer
        open={confirmingDelete}
        onOpenChange={onConfirmingDelete}
        title={isParcel ? "Excluir parcela?" : "Excluir lançamento?"}
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            {isParcel
              ? "A parcela sai da fatura, do total da compra e do limite do cartão, mas continua em Ver compra e pode ser restaurada."
              : "O lançamento sai dos saldos e totais, mas continua no histórico e pode ser restaurado."}
          </p>
          <Button variant="danger" disabled={deleting} onClick={onDelete}>
            {deleting ? "Excluindo…" : "Excluir"}
          </Button>
          <Button variant="ghost" onClick={() => onConfirmingDelete(false)}>
            Cancelar
          </Button>
        </div>
      </Drawer>

      <Drawer
        open={conflictMsg !== null}
        onOpenChange={(o) => !o && onCloseConflict()}
        title="Lançamento alterado"
      >
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm text-slate-800">
            {conflictMsg}
          </p>
          <Button onClick={onReload}>Recarregar</Button>
        </div>
      </Drawer>

      <Drawer
        open={settled !== null}
        onOpenChange={(o) => !o && onCloseSettled()}
        title="Mês já acertado"
      >
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm text-slate-800">
            {settled?.message}
          </p>
          <Button
            onClick={() => {
              const go = settled?.resend;
              onCloseSettled();
              go?.();
            }}
          >
            Confirmar mesmo assim
          </Button>
          <Button variant="ghost" onClick={onCloseSettled}>
            Cancelar
          </Button>
        </div>
      </Drawer>
    </>
  );
}
