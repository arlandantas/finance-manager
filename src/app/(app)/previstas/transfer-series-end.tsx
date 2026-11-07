"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import {
  useEndTransferSeries,
  useTransferSeries,
  useTransferSeriesImpact,
} from "@/modules/previstas/transfer-hooks";
import { useDefaults } from "@/modules/transacoes/hooks";
import { SERIES_ENDED_MSG } from "./transfer-series-edit";

/** US-101b: "Encerrar série" com confirmação; as futuras pendentes saem, atrasadas e efetivadas ficam. */
export function TransferSeriesEndDrawer({
  seriesId,
  onClose,
}: {
  seriesId: string | null;
  onClose: () => void;
}) {
  const open = seriesId !== null;
  const today = useDefaults(open).data?.today;
  const series = useTransferSeries(seriesId);
  const impact = useTransferSeriesImpact(seriesId, today?.slice(0, 7));
  const end = useEndTransferSeries();
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const s = series.data?.series;
  const n = impact.data?.impact.endCount;

  function confirm() {
    if (!s) return;
    end.mutate(
      { id: s.id, version: s.version, idempotencyKey: key.current },
      {
        onSuccess: () => {
          toast.success("Transferência mensal encerrada");
          key.current = newIdempotencyKey();
          onClose();
        },
        onError: (e) =>
          setError(
            e instanceof ApiClientError || e instanceof NetworkError
              ? e.message
              : "Erro inesperado. Tente novamente.",
          ),
      },
    );
  }

  return (
    <Drawer
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setError(null);
          onClose();
        }
      }}
      title="Encerrar transferência mensal?"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-700" data-testid="end-transfer-series-impact">
          {s?.endedAt
            ? SERIES_ENDED_MSG
            : n === undefined
              ? "Calculando o impacto…"
              : `${n} ${n === 1 ? "previsão futura pendente será removida" : "previsões futuras pendentes serão removidas"}. As efetivadas e as atrasadas ficam. Nenhum saldo muda.`}
        </p>
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <Button
          variant="danger"
          disabled={end.isPending || !s || Boolean(s.endedAt)}
          onClick={confirm}
        >
          {end.isPending ? "Encerrando…" : "Encerrar série"}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Drawer>
  );
}
