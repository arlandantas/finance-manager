"use client";

import { Archive, MoreHorizontal, Palette, Pencil, Plus, Undo2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCategories, useCategoryState } from "@/modules/categorias/hooks";
import type { CategoryDTO } from "@/modules/categorias/schemas";
import { CategoryDrawer, type DrawerTarget } from "./category-drawer";

type Kind = "EXPENSE" | "INCOME";
const TABS: Array<{ kind: Kind; label: string }> = [
  { kind: "EXPENSE", label: "Despesa" },
  { kind: "INCOME", label: "Receita" },
];

export function CategoriasScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const kind: Kind = params.get("kind") === "INCOME" ? "INCOME" : "EXPENSE";
  const list = useCategories(kind, true);
  const archive = useCategoryState("archive");
  const unarchive = useCategoryState("unarchive");
  const [target, setTarget] = useState<DrawerTarget | null>(null);
  const busy = useRef(false);

  const items = list.data?.items ?? [];
  const active = items.filter((c) => !c.archived);
  const archived = items.filter((c) => c.archived);

  function reactivate(c: CategoryDTO) {
    if (busy.current) return;
    busy.current = true;
    unarchive.mutate(
      { id: c.id, version: c.version, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: () => toast.success("Categoria reativada"),
        onError: (e) => toast.error(e instanceof Error ? e.message : "Erro inesperado."),
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  }

  function doArchive(c: CategoryDTO) {
    if (busy.current) return;
    busy.current = true;
    archive.mutate(
      { id: c.id, version: c.version, idempotencyKey: newIdempotencyKey() },
      {
        onSuccess: ({ category }) =>
          toast.success("Categoria arquivada", {
            duration: 5000,
            action: {
              label: "Desfazer",
              onClick: () =>
                unarchive.mutate(
                  {
                    id: category.id,
                    version: category.version,
                    idempotencyKey: newIdempotencyKey(),
                  },
                  { onSuccess: () => toast.success("Categoria reativada") },
                ),
            },
          }),
        onError: (e) => {
          if (e instanceof ApiClientError || e instanceof NetworkError) toast.error(e.message);
          else toast.error("Erro inesperado. Tente novamente.");
        },
        onSettled: () => {
          busy.current = false;
        },
      },
    );
  }

  return (
    <main className="flex flex-col gap-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-slate-900">Categorias</h1>
        <Button onClick={() => setTarget({ mode: "create", kind })}>
          <Plus size={18} aria-hidden="true" />
          Nova categoria
        </Button>
      </header>

      <div
        role="tablist"
        aria-label="Tipo de categoria"
        className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1"
      >
        {TABS.map((t) => (
          <button
            key={t.kind}
            type="button"
            role="tab"
            aria-selected={kind === t.kind}
            onClick={() => router.replace(`/categorias?kind=${t.kind}`)}
            className={cn(
              "min-h-11 rounded-lg text-sm font-semibold",
              kind === t.kind ? "bg-white text-slate-900 shadow-sm" : "text-slate-600",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {list.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando categorias">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : null}

      {list.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => list.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {list.data ? (
        <ul className="flex flex-col gap-2" aria-label="Categorias ativas">
          {active.map((c) => (
            <li
              key={c.id}
              data-testid="category-item"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 pl-4"
            >
              <span className="text-slate-700">
                <CategoryIcon icon={c.icon} />
              </span>
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{c.name}</span>
              <Menu
                label={`Ações da categoria ${c.name}`}
                trigger={<MoreHorizontal size={20} aria-hidden="true" />}
              >
                {(close) => (
                  <>
                    <MenuItem
                      onClick={() => {
                        close();
                        setTarget({ mode: "rename", category: c });
                      }}
                    >
                      <Pencil size={16} aria-hidden="true" />
                      Renomear
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        close();
                        setTarget({ mode: "icon", category: c });
                      }}
                    >
                      <Palette size={16} aria-hidden="true" />
                      Mudar ícone
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        close();
                        doArchive(c);
                      }}
                    >
                      <Archive size={16} aria-hidden="true" />
                      Arquivar
                    </MenuItem>
                  </>
                )}
              </Menu>
            </li>
          ))}
        </ul>
      ) : null}

      {archived.length > 0 ? (
        <details className="rounded-xl border border-slate-200 bg-white p-3">
          <summary className="min-h-6 cursor-pointer text-sm font-medium text-slate-700">
            Arquivadas ({archived.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {archived.map((c) => (
              <li
                key={c.id}
                data-testid="archived-category-item"
                className="flex items-center gap-3 rounded-lg bg-slate-50 p-2 pl-3"
              >
                <span className="text-slate-500">
                  <CategoryIcon icon={c.icon} />
                </span>
                <span className="min-w-0 flex-1 truncate text-slate-700">{c.name}</span>
                <Button variant="secondary" onClick={() => reactivate(c)}>
                  <Undo2 size={16} aria-hidden="true" />
                  Reativar
                  <span className="sr-only"> {c.name}</span>
                </Button>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <CategoryDrawer
        target={target}
        archived={archived}
        onClose={() => setTarget(null)}
        onReactivate={reactivate}
      />
    </main>
  );
}
