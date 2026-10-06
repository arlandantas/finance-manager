"use client";

import {
  Archive,
  ArrowLeftRight,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useAccountAction, useAccounts, useArchivedAccounts } from "@/modules/contas/hooks";
import { ACCOUNT_TYPE_LABELS, type AccountDTO } from "@/modules/contas/schemas";
import { useFamily } from "@/modules/familia/hooks";
import { NewAccountDrawer } from "./new-account-drawer";
import { RenameAccountDialog } from "./rename-account-dialog";
import { TransferDrawer, type TransferPrefill } from "./transfer-drawer";

function Balance({ cents, className }: { cents: number; className?: string }) {
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        cents < 0 ? "text-red-700 dark:text-red-300" : "text-slate-900",
        className,
      )}
    >
      <Money cents={cents} />
    </span>
  );
}

function AccountCard({
  account,
  isAdmin,
  onRename,
  onArchive,
  onDelete,
}: {
  account: AccountDTO;
  isAdmin: boolean;
  onRename: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <li
      data-testid="account-card"
      className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-4 sm:grid-cols-[auto_1fr_auto_auto]"
    >
      <Avatar name={account.owner.name} image={account.owner.image} size={40} />
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-semibold text-slate-900">
          <span className="truncate">{account.name}</span>
          {account.excludeFromAvailable ? (
            <span
              data-testid="reserve-badge"
              className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:text-amber-200"
            >
              Reserva
            </span>
          ) : null}
        </p>
        <p className="truncate text-sm text-slate-500">
          {account.institution} · {ACCOUNT_TYPE_LABELS[account.type]} ·{" "}
          {account.owner.name.split(" ")[0]}
        </p>
      </div>
      <Balance
        cents={account.balanceInCents}
        className="col-start-2 row-start-2 text-lg sm:col-start-3 sm:row-start-1"
      />
      <Menu
        label={`Ações da conta ${account.name}`}
        trigger={<MoreHorizontal size={20} aria-hidden="true" />}
      >
        {(close) => (
          <>
            <MenuItem
              onClick={() => {
                close();
                onRename();
              }}
            >
              <Pencil size={16} aria-hidden="true" />
              Editar
            </MenuItem>
            <MenuItem
              onClick={() => {
                close();
                onArchive();
              }}
            >
              <Archive size={16} aria-hidden="true" />
              Arquivar
            </MenuItem>
            {isAdmin && account.neverUsed ? (
              <MenuItem
                onClick={() => {
                  close();
                  onDelete();
                }}
              >
                <Trash2 size={16} aria-hidden="true" />
                Excluir
              </MenuItem>
            ) : null}
          </>
        )}
      </Menu>
    </li>
  );
}

function ArchivedSection({
  onReactivate,
  busyId,
}: {
  onReactivate: (a: AccountDTO) => void;
  busyId: string | null;
}) {
  const archived = useArchivedAccounts();
  const items = archived.data?.items ?? [];
  if (items.length === 0) return null;
  return (
    <details
      data-testid="archived-accounts"
      className="rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-3"
    >
      <summary className="min-h-11 cursor-pointer py-2 text-sm font-semibold text-slate-800">
        Contas arquivadas ({items.length})
      </summary>
      <ul className="flex flex-col divide-y divide-slate-100">
        {items.map((a) => (
          <li
            key={a.id}
            data-testid="archived-account"
            className="flex items-center justify-between gap-3 py-2 text-sm"
          >
            <span className="min-w-0 truncate text-slate-800">{a.name}</span>
            <Button variant="secondary" disabled={busyId === a.id} onClick={() => onReactivate(a)}>
              <RotateCcw size={16} aria-hidden="true" />
              Reativar
            </Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function AccountsSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando contas">
      <Skeleton className="h-20" />
      <Skeleton className="h-[76px]" />
      <Skeleton className="h-[76px]" />
    </div>
  );
}

export function ContasScreen() {
  const accounts = useAccounts();
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<AccountDTO | null>(null);
  const [transferring, setTransferring] = useState(false);
  const [needsAnother, setNeedsAnother] = useState(false);
  const [prefill, setPrefill] = useState<TransferPrefill | null>(null);
  const [archiving, setArchiving] = useState<AccountDTO | null>(null);
  const [deleting, setDeleting] = useState<AccountDTO | null>(null);
  const [blocked, setBlocked] = useState<{ message: string; balanceInCents: number } | null>(null);
  const [banner, setBanner] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const family = useFamily();
  const isAdmin = family.data?.currentRole === "ADMIN";
  const action = useAccountAction();
  const keyRef = useRef(newIdempotencyKey());
  const data = accounts.data;

  function run(a: AccountDTO, kind: "archive" | "unarchive" | "delete", ok: string) {
    if (action.isPending) return;
    setBanner(null);
    setBusyId(a.id);
    action.mutate(
      { id: a.id, action: kind, version: a.version, idempotencyKey: keyRef.current },
      {
        onSuccess: () => {
          keyRef.current = newIdempotencyKey();
          setArchiving(null);
          setDeleting(null);
          setBlocked(null);
          toast.success(ok);
        },
        onError: (e) => {
          keyRef.current = newIdempotencyKey();
          if (e instanceof ApiClientError && e.code === "ACCOUNT_BALANCE_NOT_ZERO") {
            setBlocked({
              message: e.message,
              balanceInCents: (e.details as { balanceInCents: number }).balanceInCents,
            });
          } else if (e instanceof NetworkError) setBanner(e.message);
          else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
        onSettled: () => setBusyId(null),
      },
    );
  }

  function transferBalance(a: AccountDTO, balance: number) {
    setArchiving(null);
    setBlocked(null);
    setPrefill(
      balance > 0
        ? { fromId: a.id, amountInCents: balance }
        : { toId: a.id, amountInCents: Math.abs(balance) },
    );
    setTransferring(true);
  }

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Contas</h1>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <Button
            variant="secondary"
            onClick={() =>
              data && data.items.length < 2 ? setNeedsAnother(true) : setTransferring(true)
            }
          >
            <ArrowLeftRight size={18} aria-hidden="true" />
            Transferir
          </Button>
          <Button onClick={() => setCreating(true)}>
            <Plus size={18} aria-hidden="true" />
            Nova conta
          </Button>
        </div>
      </header>

      {accounts.isPending ? <AccountsSkeleton /> : null}

      {accounts.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => accounts.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {data && data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white dark:bg-slate-100 p-8 text-center">
          <p className="text-slate-700">Cadastre sua primeira conta para começar</p>
          <Button onClick={() => setCreating(true)}>Nova conta</Button>
        </div>
      ) : null}

      {data && data.items.length > 0 ? (
        <>
          <section
            aria-label="Saldo consolidado"
            className="rounded-xl bg-brand-800 p-4 text-white"
            data-testid="total-balance"
          >
            <p className="text-sm text-brand-100">Saldo consolidado</p>
            <p className="text-3xl font-bold tabular-nums">
              <Money cents={data.totalBalanceInCents} />
            </p>
            {data.reservesInCents !== 0 ? (
              <p className="mt-1 text-sm text-brand-100" data-testid="reserves-total">
                Reservas (fora do saldo disponível): <Money cents={data.reservesInCents} />
              </p>
            ) : null}
          </section>
          <ul className="flex flex-col gap-3">
            {data.items.map((a) => (
              <AccountCard
                key={a.id}
                account={a}
                isAdmin={isAdmin}
                onRename={() => setRenaming(a)}
                onArchive={() => {
                  setBlocked(null);
                  setBanner(null);
                  setArchiving(a);
                }}
                onDelete={() => {
                  setBanner(null);
                  setDeleting(a);
                }}
              />
            ))}
          </ul>
        </>
      ) : null}

      {data ? (
        <ArchivedSection
          busyId={busyId}
          onReactivate={(a) => run(a, "unarchive", "Conta reativada")}
        />
      ) : null}

      <Drawer
        open={archiving !== null}
        onOpenChange={(o) => !o && setArchiving(null)}
        title={archiving ? `Arquivar ${archiving.name}?` : "Arquivar conta"}
      >
        {archiving ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              A conta some das listas e dos seletores; o histórico permanece e você pode reativá-la
              depois.
            </p>
            {data && data.items.length === 1 ? (
              <p role="status" className="text-sm font-medium text-amber-900 dark:text-amber-200">
                Sem contas ativas você não poderá lançar despesas em conta nem pagar faturas.
              </p>
            ) : null}
            {blocked ? (
              <div
                role="alert"
                className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3"
              >
                <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
                  {blocked.message}
                </p>
                <Button
                  variant="secondary"
                  onClick={() => transferBalance(archiving, blocked.balanceInCents)}
                >
                  {blocked.balanceInCents > 0 ? "Transferir o saldo" : "Transferir para esta conta"}
                </Button>
              </div>
            ) : null}
            {banner ? (
              <p role="alert" className="text-sm text-red-800 dark:text-red-300">
                {banner}
              </p>
            ) : null}
            <Button
              disabled={action.isPending}
              onClick={() => run(archiving, "archive", "Conta arquivada")}
            >
              {action.isPending ? "Arquivando…" : "Arquivar"}
            </Button>
            <Button variant="ghost" onClick={() => setArchiving(null)}>
              Cancelar
            </Button>
          </div>
        ) : null}
      </Drawer>

      <Drawer
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={deleting ? `Excluir ${deleting.name}?` : "Excluir conta"}
      >
        {deleting ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              A conta nunca teve movimentação. Ela some de todas as telas e o nome fica livre; isso
              não pode ser desfeito.
            </p>
            {banner ? (
              <p role="alert" className="text-sm text-red-800 dark:text-red-300">
                {banner}
              </p>
            ) : null}
            <Button
              variant="danger"
              disabled={action.isPending}
              onClick={() => run(deleting, "delete", "Conta excluída")}
            >
              Excluir definitivamente
            </Button>
            <Button variant="ghost" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
          </div>
        ) : null}
      </Drawer>

      <NewAccountDrawer open={creating} onOpenChange={setCreating} />
      <TransferDrawer
        open={transferring}
        onOpenChange={(o) => {
          setTransferring(o);
          if (!o) setPrefill(null);
        }}
        prefill={prefill}
      />
      <Drawer
        open={needsAnother}
        onOpenChange={setNeedsAnother}
        title="Cadastre outra conta para transferir"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            Uma transferência precisa de duas contas da família. Cadastre outra conta para
            continuar.
          </p>
          <Button
            onClick={() => {
              setNeedsAnother(false);
              setCreating(true);
            }}
          >
            Nova conta
          </Button>
          <Button variant="ghost" onClick={() => setNeedsAnother(false)}>
            Agora não
          </Button>
        </div>
      </Drawer>
      <RenameAccountDialog account={renaming} onClose={() => setRenaming(null)} />
    </main>
  );
}
