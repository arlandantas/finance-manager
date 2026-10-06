"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Field, TextInput } from "@/components/ui/field";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { useRenameAccount } from "@/modules/contas/hooks";
import { type AccountDTO, RenameAccountSchema } from "@/modules/contas/schemas";
import { ReserveSwitch } from "./reserve-switch";

export function RenameAccountDialog({
  account,
  onClose,
}: {
  account: AccountDTO | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [reserve, setReserve] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [conflict, setConflict] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const qc = useQueryClient();
  const rename = useRenameAccount();

  useEffect(() => {
    if (account) {
      setName(account.name);
      setReserve(account.excludeFromAvailable);
      setError(undefined);
      setConflict(null);
      key.current = newIdempotencyKey();
    }
  }, [account]);

  function submit() {
    if (!account) return;
    const parsed = RenameAccountSchema.safeParse({
      name,
      excludeFromAvailable: reserve,
      version: account.version,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    rename.mutate(
      {
        id: account.id,
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        excludeFromAvailable: reserve,
        version: account.version,
        idempotencyKey: key.current,
      },
      {
        onSuccess: () => {
          toast.success("Conta atualizada");
          onClose();
        },
        onError: (e) => {
          if (e instanceof ApiClientError && e.code === "VERSION_CONFLICT") setConflict(e.message);
          else if (e instanceof ApiClientError && e.code === "DUPLICATE_ACCOUNT_NAME")
            setError(e.message);
          else if (e instanceof NetworkError) setError(e.message);
          else setError(e instanceof Error ? e.message : "Erro inesperado.");
        },
      },
    );
  }

  return (
    <Drawer open={account !== null} onOpenChange={(o) => !o && onClose()} title="Editar conta">
      {conflict ? (
        <div className="flex flex-col gap-4">
          <p role="alert" className="text-sm text-slate-800">
            {conflict}
          </p>
          <Button
            onClick={async () => {
              await qc.invalidateQueries({ queryKey: ["accounts"] });
              onClose();
            }}
          >
            Recarregar
          </Button>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <Field id="rename-name" label="Nome" error={error}>
            <TextInput
              id="rename-name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-invalid={error ? true : undefined}
            />
          </Field>
          <ReserveSwitch checked={reserve} onChange={setReserve} />
          <Button type="submit" disabled={rename.isPending}>
            {rename.isPending ? "Salvando…" : "Salvar"}
          </Button>
        </form>
      )}
    </Drawer>
  );
}
