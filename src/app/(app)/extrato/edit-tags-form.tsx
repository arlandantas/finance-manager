"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { TagInput } from "@/components/tag-input";
import { Button } from "@/components/ui/button";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useUpdateTransaction } from "@/modules/transacoes/hooks";
import type { TransactionDetailDTO } from "@/modules/transacoes/schemas";

/**
 * Edição SÓ das tags (US-045, D-PO-46, SDD-016 §1): não é financeira, então vale em mês acertado, fatura paga,
 * conta arquivada e parcela (em compra parcelada o servidor aplica a TODAS as parcelas).
 */
export function EditTagsForm({
  t,
  onDone,
  onConflict,
}: {
  t: TransactionDetailDTO;
  onDone: () => void;
  onConflict: (message: string) => void;
}) {
  const [tags, setTags] = useState<string[]>(t.tags.map((x) => x.name));
  const [error, setError] = useState<string | undefined>();
  const [banner, setBanner] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const submitting = useRef(false);
  const update = useUpdateTransaction();

  function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setBanner(null);
    update.mutate(
      { id: t.id, input: { version: t.version, tags }, idempotencyKey: key.current },
      {
        onSuccess: () => {
          toast.success("Tags atualizadas");
          onDone();
        },
        onError: (e) => {
          if (e instanceof NetworkError) setBanner(e.message);
          else if (e instanceof ApiClientError && e.code === "VERSION_CONFLICT")
            onConflict(e.message);
          else if (e instanceof ApiClientError && e.code === "VALIDATION_ERROR")
            setError(e.message);
          else setBanner(e instanceof Error ? e.message : "Erro inesperado. Tente novamente.");
        },
        onSettled: () => {
          submitting.current = false;
        },
      },
    );
  }

  return (
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
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:text-red-300"
        >
          {banner}
        </p>
      ) : null}
      {t.installment ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
          A alteração vale para todas as {t.installment.count} parcelas desta compra.
        </p>
      ) : null}
      <TagInput
        id="et-tags"
        defaultOpen
        value={tags}
        onChange={(next) => {
          setTags(next);
          setError(undefined);
          key.current = newIdempotencyKey();
        }}
        error={error}
      />
      <Button type="submit" className="w-full" disabled={update.isPending}>
        {update.isPending ? "Salvando…" : "Salvar tags"}
      </Button>
      <Button type="button" variant="ghost" onClick={onDone}>
        Cancelar
      </Button>
    </form>
  );
}
