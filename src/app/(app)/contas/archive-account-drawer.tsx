"use client";

import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import type { AccountDTO } from "@/modules/contas/schemas";

/** Impedimento mostrado no diálogo (pré-checagem ou 422): `balanceInCents` só em ACCOUNT_BALANCE_NOT_ZERO. */
export type ArchiveBlock = { code: string; message: string; balanceInCents?: number };

/** Diálogo "Arquivar conta" (US-032/054, US-100b): lista os impedimentos e desabilita a confirmação. */
export function ArchiveAccountDrawer({
  account,
  activeCount,
  blocks,
  banner,
  busy,
  pending,
  onClose,
  onTransfer,
  onConfirm,
}: {
  account: AccountDTO | null;
  activeCount: number;
  blocks: ArchiveBlock[];
  banner: string | null;
  busy: boolean;
  pending: boolean;
  onClose: () => void;
  onTransfer: (account: AccountDTO, balanceInCents: number) => void;
  onConfirm: (account: AccountDTO) => void;
}) {
  return (
    <Drawer
      open={account !== null}
      onOpenChange={(o) => !o && onClose()}
      title={account ? `Arquivar ${account.name}?` : "Arquivar conta"}
    >
      {account ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-slate-700">
            A conta some das listas e dos seletores; o histórico permanece e você pode reativá-la
            depois.
          </p>
          {account.payerForCards.length > 0 ? (
            <p role="note" className="text-sm text-slate-700" data-testid="archive-payer-note">
              Esta conta paga a fatura de {account.payerForCards.map((c) => c.name).join(", ")}.
              Depois de arquivar, esses cartões ficam sem conta pagadora (reativar a conta restaura
              a escolha).
            </p>
          ) : null}
          {activeCount === 1 ? (
            <p role="status" className="text-sm font-medium text-amber-900 dark:text-amber-200">
              Sem contas ativas você não poderá lançar despesas em conta nem pagar faturas.
            </p>
          ) : null}
          {blocks.map((b) => (
            <div
              key={b.code}
              role="alert"
              data-testid="archive-blocker"
              data-code={b.code}
              className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3"
            >
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{b.message}</p>
              {b.balanceInCents !== undefined ? (
                <Button
                  variant="secondary"
                  onClick={() => onTransfer(account, b.balanceInCents ?? 0)}
                >
                  {b.balanceInCents > 0 ? "Transferir o saldo" : "Transferir para esta conta"}
                </Button>
              ) : null}
            </div>
          ))}
          {banner ? (
            <p role="alert" className="text-sm text-red-800 dark:text-red-300">
              {banner}
            </p>
          ) : null}
          <Button disabled={busy || blocks.length > 0} onClick={() => onConfirm(account)}>
            {pending ? "Arquivando…" : "Arquivar"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      ) : null}
    </Drawer>
  );
}
