"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, inputClass, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useDeleteTag, useMergeTag, useRenameTag } from "@/modules/tags/hooks";
import { RenameTagSchema, type TagDTO } from "@/modules/tags/schemas";

export type TagTarget = { mode: "rename" | "merge" | "delete"; tag: TagDTO; intoId?: string };

const TITLES = { rename: "Renomear tag", merge: "Mesclar tag", delete: "Remover tag" } as const;

/** Renomear, mesclar e remover tag (US-046). Mensagens de erro vêm do servidor. */
export function TagDialog({
  target,
  tags,
  onClose,
  onSwitch,
}: {
  target: TagTarget | null;
  tags: TagDTO[];
  onClose: () => void;
  onSwitch: (t: TagTarget) => void;
}) {
  const [name, setName] = useState("");
  const [intoId, setIntoId] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const [conflict, setConflict] = useState<string | null>(null);
  const [mergeOffer, setMergeOffer] = useState<{ id: string; name: string } | null>(null);
  const [key, setKey] = useState(newIdempotencyKey);
  const submitting = useRef(false);
  const qc = useQueryClient();
  const rename = useRenameTag();
  const merge = useMergeTag();
  const remove = useDeleteTag();

  useEffect(() => {
    if (!target) return;
    setName(target.tag.name);
    setIntoId(target.intoId ?? "");
    setError(undefined);
    setBanner(null);
    setConflict(null);
    setMergeOffer(null);
    setKey(newIdempotencyKey());
  }, [target]);

  function fail(e: unknown) {
    if (e instanceof NetworkError) setBanner(e.message);
    else if (e instanceof ApiClientError && e.code === "VERSION_CONFLICT") setConflict(e.message);
    else if (e instanceof ApiClientError && e.code === "TAG_NAME_EXISTS") {
      const d = e.details as { mergeIntoId?: string; mergeIntoName?: string } | undefined;
      if (d?.mergeIntoId && d.mergeIntoName && target) {
        setMergeOffer({ id: d.mergeIntoId, name: d.mergeIntoName });
        setError(undefined);
      } else setError(e.message);
    } else if (e instanceof ApiClientError && e.code === "VALIDATION_ERROR") setError(e.message);
    else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
  }

  function run(start: (settle: () => void) => void) {
    if (submitting.current) return;
    submitting.current = true;
    setBanner(null);
    start(() => {
      submitting.current = false;
    });
  }

  function submit() {
    if (!target) return;
    const { tag } = target;
    const done = (msg: string) => () => {
      toast.success(msg);
      onClose();
    };
    if (target.mode === "rename") {
      const parsed = RenameTagSchema.safeParse({ version: tag.version, name });
      if (!parsed.success) return setError(parsed.error.issues[0]?.message);
      setError(undefined);
      run((settle) =>
        rename.mutate(
          { id: tag.id, version: tag.version, name: parsed.data.name, idempotencyKey: key },
          { onSuccess: done("Tag renomeada"), onError: fail, onSettled: settle },
        ),
      );
    } else if (target.mode === "merge") {
      if (!intoId) return setError("Escolha a tag de destino");
      setError(undefined);
      run((settle) =>
        merge.mutate(
          { id: tag.id, version: tag.version, intoId, idempotencyKey: key },
          { onSuccess: done("Tags mescladas"), onError: fail, onSettled: settle },
        ),
      );
    } else {
      run((settle) =>
        remove.mutate(
          { id: tag.id, version: tag.version, idempotencyKey: key },
          { onSuccess: done("Tag removida"), onError: fail, onSettled: settle },
        ),
      );
    }
  }

  const mode = target?.mode ?? "rename";
  const pending = rename.isPending || merge.isPending || remove.isPending;
  const others = tags.filter((t) => t.id !== target?.tag.id);

  return (
    <Drawer open={target !== null} onOpenChange={(o) => !o && onClose()} title={TITLES[mode]}>
      {conflict ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm text-slate-800">
            {conflict}
          </p>
          <Button
            onClick={async () => {
              await qc.invalidateQueries({ queryKey: ["tags"] });
              onClose();
            }}
          >
            Recarregar
          </Button>
        </div>
      ) : (
        <form
          noValidate
          className="form-stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {banner ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
            >
              {banner}
            </p>
          ) : null}
          {mode === "rename" ? (
            <Field id="tag-name" label="Nome" error={error}>
              <TextInput
                id="tag-name"
                autoFocus
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? "tag-name-error" : undefined}
              />
            </Field>
          ) : null}
          {mergeOffer && target ? (
            <div className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3">
              <p role="alert" className="text-sm text-slate-800">
                Já existe a tag {mergeOffer.name}. Mesclar {target.tag.name} nela?
              </p>
              <Button
                variant="secondary"
                onClick={() => onSwitch({ mode: "merge", tag: target.tag, intoId: mergeOffer.id })}
              >
                Mesclar
              </Button>
            </div>
          ) : null}
          {mode === "merge" ? (
            <Field id="tag-into" label="Mesclar em" error={error}>
              <select
                id="tag-into"
                className={inputClass}
                value={intoId}
                onChange={(e) => setIntoId(e.target.value)}
              >
                <option value="">Escolha a tag de destino</option>
                {others.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {mode === "delete" && target ? (
            <p className="text-sm text-slate-800">
              Remover {target.tag.name}? Os {target.tag.usageCount} lançamentos continuam, sem essa
              tag. Valores e acerto não mudam.
            </p>
          ) : null}
          <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-slate-200 bg-white p-4 dark:bg-slate-100">
            <Button type="submit" className="w-full" disabled={pending}>
              {pending
                ? "Salvando…"
                : mode === "delete"
                  ? "Remover"
                  : mode === "merge"
                    ? "Mesclar"
                    : "Salvar"}
            </Button>
          </div>
        </form>
      )}
    </Drawer>
  );
}
