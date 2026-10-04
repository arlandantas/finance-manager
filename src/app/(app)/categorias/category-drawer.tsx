"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { cn } from "@/components/ui/cn";
import { Drawer } from "@/components/ui/drawer";
import { Field, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useCreateCategory, useUpdateCategory } from "@/modules/categorias/hooks";
import {
  CATEGORY_ICON_KEYS,
  CATEGORY_ICON_LABELS,
  type CategoryDTO,
  type CategoryIconKey,
  CreateCategorySchema,
  UpdateCategorySchema,
} from "@/modules/categorias/schemas";

export type DrawerTarget =
  | { mode: "create"; kind: "EXPENSE" | "INCOME" }
  | { mode: "rename" | "icon"; category: CategoryDTO };

const TITLES = {
  create: "Nova categoria",
  rename: "Renomear categoria",
  icon: "Mudar ícone",
} as const;

/** Drawer de criação e edição (renomear / mudar ícone). SDD-007 §6. */
export function CategoryDrawer({
  target,
  archived,
  onClose,
  onReactivate,
}: {
  target: DrawerTarget | null;
  /** Categorias arquivadas do tipo, para oferecer "Reativar" quando o nome colide. */
  archived: CategoryDTO[];
  onClose: () => void;
  onReactivate: (c: CategoryDTO) => void;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<CategoryIconKey>(CATEGORY_ICON_KEYS[0]);
  const [error, setError] = useState<string | undefined>();
  const [iconError, setIconError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [archivedHit, setArchivedHit] = useState<string | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const qc = useQueryClient();
  const create = useCreateCategory(key);
  const update = useUpdateCategory();

  const open = target !== null;
  useEffect(() => {
    if (!target) return;
    setName(target.mode === "create" ? "" : target.category.name);
    setIcon(
      target.mode === "create"
        ? CATEGORY_ICON_KEYS[0]
        : (((CATEGORY_ICON_KEYS as readonly string[]).includes(target.category.icon)
            ? target.category.icon
            : "package") as CategoryIconKey),
    );
    setError(undefined);
    setIconError(undefined);
    setBanner(null);
    setConflict(null);
    setArchivedHit(null);
    setKey(newIdempotencyKey());
  }, [target]);

  function fail(e: unknown) {
    if (e instanceof NetworkError) setBanner(e.message);
    else if (e instanceof ApiClientError && e.code === "VERSION_CONFLICT") setConflict(e.message);
    else if (e instanceof ApiClientError && e.code === "DUPLICATE_CATEGORY_NAME") {
      setError(e.message);
      const d = e.details as { archived?: boolean; categoryId?: string } | undefined;
      setArchivedHit(d?.archived ? (d.categoryId ?? null) : null);
    } else if (e instanceof ApiClientError && e.code === "VALIDATION_ERROR") {
      setError(e.message);
    } else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
  }

  function submit() {
    if (!target || submitting.current) return;
    setBanner(null);
    setArchivedHit(null);
    if (target.mode === "create") {
      const parsed = CreateCategorySchema.safeParse({ kind: target.kind, name, icon });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message);
        return;
      }
      setError(undefined);
      submitting.current = true;
      create.mutate(parsed.data, {
        onSuccess: () => {
          toast.success("Categoria criada");
          onClose();
        },
        onError: fail,
        onSettled: () => {
          submitting.current = false;
        },
      });
      return;
    }
    const c = target.category;
    const parsed = UpdateCategorySchema.safeParse({
      version: c.version,
      ...(target.mode === "rename" ? { name } : { icon }),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    submitting.current = true;
    update.mutate(
      { id: c.id, input: parsed.data, idempotencyKey: key },
      {
        onSuccess: () => {
          toast.success("Categoria atualizada");
          onClose();
        },
        onError: fail,
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  const pending = create.isPending || update.isPending;
  const mode = target?.mode ?? "create";
  const hitCategory = archivedHit ? archived.find((a) => a.id === archivedHit) : undefined;

  return (
    <Drawer open={open} onOpenChange={(o) => !o && onClose()} title={TITLES[mode]}>
      {conflict ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm text-slate-800">
            {conflict}
          </p>
          <Button
            onClick={async () => {
              await qc.invalidateQueries({ queryKey: ["categories"] });
              onClose();
            }}
          >
            Recarregar
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {banner ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {banner}
            </p>
          ) : null}
          {mode !== "icon" ? (
            <Field id="category-name" label="Nome" error={error}>
              <TextInput
                id="category-name"
                autoFocus
                autoComplete="off"
                placeholder="Ex.: Pet"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "category-name-error" : undefined}
              />
            </Field>
          ) : null}
          {hitCategory ? (
            <Button
              variant="secondary"
              onClick={() => {
                onReactivate(hitCategory);
                onClose();
              }}
            >
              Reativar
            </Button>
          ) : null}
          {mode !== "rename" ? (
            <div className="flex flex-col gap-1.5">
              <span id="category-icon-label" className="text-sm font-medium text-slate-800">
                Ícone
              </span>
              <div
                role="radiogroup"
                aria-labelledby="category-icon-label"
                className="grid grid-cols-5 gap-2"
              >
                {CATEGORY_ICON_KEYS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={icon === k}
                    aria-label={CATEGORY_ICON_LABELS[k]}
                    onClick={() => {
                      setIcon(k);
                      setIconError(undefined);
                    }}
                    className={cn(
                      "flex min-h-11 min-w-11 items-center justify-center rounded-xl border focus-visible:outline-2 focus-visible:outline-brand-700",
                      icon === k
                        ? "border-brand-700 bg-brand-50 text-brand-800"
                        : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                    )}
                  >
                    <CategoryIcon icon={k} />
                  </button>
                ))}
              </div>
              {iconError ? (
                <p role="alert" className="text-sm text-red-700">
                  {iconError}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white p-4">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
