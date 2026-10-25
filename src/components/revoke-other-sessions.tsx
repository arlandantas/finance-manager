"use client";

import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ApiClientError, apiFetch, NetworkError, newIdempotencyKey } from "@/lib/http";

/** SEC-018 (SDD-028 §6.2): confirmação e aviso "N sessão(ões) encerrada(s)". */
export function RevokeOtherSessions({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const key = useRef(newIdempotencyKey());
  const revoke = useMutation({
    mutationFn: () =>
      apiFetch<{ revoked: number }>("/api/v1/me/sessions/revoke-others", {
        method: "POST",
        body: {},
        idempotencyKey: key.current,
      }),
    onSuccess: (r) => {
      key.current = newIdempotencyKey();
      onOpenChange(false);
      toast.success(`${r.revoked} ${r.revoked === 1 ? "sessão encerrada" : "sessões encerradas"}`, {
        id: "sessions-revoked",
      });
    },
    onError: (e) =>
      toast.error(
        e instanceof ApiClientError || e instanceof NetworkError
          ? e.message
          : "Erro inesperado. Tente novamente.",
      ),
  });
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title="Encerrar as outras sessões?">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-700">Você continuará conectado só neste aparelho.</p>
        <Button variant="danger" disabled={revoke.isPending} onClick={() => revoke.mutate()}>
          {revoke.isPending ? "Encerrando…" : "Encerrar"}
        </Button>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancelar
        </Button>
      </div>
    </Drawer>
  );
}
