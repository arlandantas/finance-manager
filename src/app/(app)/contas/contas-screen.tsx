"use client";

import { ArrowLeftRight, MoreHorizontal, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { Money } from "@/components/money";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useAccounts } from "@/modules/contas/hooks";
import { ACCOUNT_TYPE_LABELS, type AccountDTO } from "@/modules/contas/schemas";
import { NewAccountDrawer } from "./new-account-drawer";
import { RenameAccountDialog } from "./rename-account-dialog";
import { TransferDrawer } from "./transfer-drawer";

function Balance({ cents, className }: { cents: number; className?: string }) {
  return (
    <span
      className={cn(
        "font-semibold tabular-nums",
        cents < 0 ? "text-red-700" : "text-slate-900",
        className,
      )}
    >
      <Money cents={cents} />
    </span>
  );
}

function AccountCard({ account, onRename }: { account: AccountDTO; onRename: () => void }) {
  return (
    <li
      data-testid="account-card"
      className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-[auto_1fr_auto_auto]"
    >
      <Avatar name={account.owner.name} image={account.owner.image} size={40} />
      <div className="min-w-0">
        <p className="truncate font-semibold text-slate-900">{account.name}</p>
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
          <MenuItem
            onClick={() => {
              close();
              onRename();
            }}
          >
            <Pencil size={16} aria-hidden="true" />
            Renomear
          </MenuItem>
        )}
      </Menu>
    </li>
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
  const data = accounts.data;

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
          <p className="text-sm text-red-800">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => accounts.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {data && data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
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
          </section>
          <ul className="flex flex-col gap-3">
            {data.items.map((a) => (
              <AccountCard key={a.id} account={a} onRename={() => setRenaming(a)} />
            ))}
          </ul>
        </>
      ) : null}

      <NewAccountDrawer open={creating} onOpenChange={setCreating} />
      <TransferDrawer open={transferring} onOpenChange={setTransferring} />
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
