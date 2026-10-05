"use client";

import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Link from "next/link";
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import { TransactionDrawer } from "@/components/transaction-drawer";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { apiFetch } from "@/lib/http";
import { cardsKey } from "@/modules/cartoes/hooks";
import type { CardsResponse } from "@/modules/cartoes/schemas";
import { accountsKey } from "@/modules/contas/hooks";
import type { AccountsResponse } from "@/modules/contas/schemas";

type QuickAddApi = { open: (kind?: "EXPENSE" | "INCOME") => void };
const QuickAddContext = createContext<QuickAddApi>({ open: () => {} });
export const useQuickAdd = () => useContext(QuickAddContext);

/**
 * FAB "+" e drawer de lançamento rápido (FLUXO-001). Sem contas, orienta a cadastrar uma
 * (SDD-001 §5.1) e não abre o formulário.
 */
export function QuickAddProvider({
  children,
  hideFab = false,
}: {
  children: ReactNode;
  hideFab?: boolean;
}) {
  const qc = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [noAccounts, setNoAccounts] = useState(false);
  const [kind, setKind] = useState<"EXPENSE" | "INCOME">("EXPENSE");

  const open = useCallback(
    async (k: "EXPENSE" | "INCOME" = "EXPENSE") => {
      try {
        const data = await qc.fetchQuery({
          queryKey: accountsKey,
          queryFn: () => apiFetch<AccountsResponse>("/api/v1/accounts"),
          staleTime: 5_000,
        });
        if (data.items.length === 0) {
          // Sem contas, mas com cartão: a despesa no cartão ainda é possível.
          const cards = await qc.fetchQuery({
            queryKey: cardsKey,
            queryFn: () => apiFetch<CardsResponse>("/api/v1/cards"),
            staleTime: 0,
          });
          if (cards.items.length === 0) {
            setNoAccounts(true);
            return;
          }
        }
      } catch {
        // Sem conexão: abre o drawer mesmo assim; o envio informa o erro.
      }
      setKind(k);
      setDrawerOpen(true);
    },
    [qc],
  );

  const api = useMemo<QuickAddApi>(() => ({ open: (k) => void open(k) }), [open]);

  return (
    <QuickAddContext.Provider value={api}>
      {children}
      {hideFab ? null : (
        <button
          type="button"
          aria-label="Novo lançamento"
          onClick={() => void open()}
          className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-brand-700 text-white shadow-lg hover:bg-brand-800 lg:bottom-6 lg:right-[max(1rem,calc((100vw-960px)/2+1rem))]"
        >
          <Plus size={28} aria-hidden="true" />
        </button>
      )}
      <TransactionDrawer open={drawerOpen} onOpenChange={setDrawerOpen} initialKind={kind} />
      <Drawer open={noAccounts} onOpenChange={setNoAccounts} title="Cadastre uma conta primeiro">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">
            Todo lançamento pertence a uma conta. Cadastre a primeira para começar a registrar.
          </p>
          <Link
            href="/contas"
            onClick={() => setNoAccounts(false)}
            className="inline-flex min-h-11 items-center justify-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Ir para Contas
          </Link>
          <Button variant="ghost" onClick={() => setNoAccounts(false)}>
            Agora não
          </Button>
        </div>
      </Drawer>
    </QuickAddContext.Provider>
  );
}
