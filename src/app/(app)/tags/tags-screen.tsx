"use client";

import { GitMerge, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Menu, MenuItem } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useTags } from "@/modules/tags/hooks";
import type { TagDTO } from "@/modules/tags/schemas";
import { TagDialog, type TagTarget } from "./tag-dialog";

export const usageLabel = (n: number) => (n === 1 ? "1 lançamento" : `${n} lançamentos`);

export function TagsScreen() {
  const list = useTags("", { limit: 500 });
  const [target, setTarget] = useState<TagTarget | null>(null);
  const items = list.data?.items ?? [];

  return (
    <main className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold text-slate-900">Tags</h1>
      </header>

      {list.isPending ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Carregando tags">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      ) : null}

      {list.isError ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => list.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}

      {list.data && items.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700 dark:bg-slate-100">
          Nenhuma tag ainda. Crie tags ao lançar uma despesa.
        </p>
      ) : null}

      {items.length > 0 ? (
        <ul className="flex flex-col gap-2" aria-label="Tags da família">
          {items.map((t: TagDTO) => (
            <li
              key={t.id}
              data-testid="tag-item"
              className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2 pl-4 dark:bg-slate-100"
            >
              <span className="min-w-0 flex-1 truncate font-medium text-slate-900">{t.name}</span>
              <span className="text-sm text-slate-600">{usageLabel(t.usageCount)}</span>
              <Menu
                label={`Ações da tag ${t.name}`}
                trigger={<MoreHorizontal size={20} aria-hidden="true" />}
              >
                {(close) => (
                  <>
                    <MenuItem
                      onClick={() => {
                        close();
                        setTarget({ mode: "rename", tag: t });
                      }}
                    >
                      <Pencil size={16} aria-hidden="true" />
                      Renomear
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        close();
                        setTarget({ mode: "merge", tag: t });
                      }}
                    >
                      <GitMerge size={16} aria-hidden="true" />
                      Mesclar
                    </MenuItem>
                    <MenuItem
                      onClick={() => {
                        close();
                        setTarget({ mode: "delete", tag: t });
                      }}
                    >
                      <Trash2 size={16} aria-hidden="true" />
                      Remover
                    </MenuItem>
                  </>
                )}
              </Menu>
            </li>
          ))}
        </ul>
      ) : null}

      <TagDialog
        target={target}
        tags={items}
        onClose={() => setTarget(null)}
        onSwitch={setTarget}
      />
    </main>
  );
}
