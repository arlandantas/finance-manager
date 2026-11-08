"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiClientError, NetworkError, newIdempotencyKey } from "@/lib/http";
import { formatInvoiceLabel } from "@/modules/cartoes/cycle";
import {
  type ImportBatchItem,
  useInvoiceImports,
  useRevertImport,
} from "@/modules/importacao/batch-hooks";
import { brDayMonth } from "./importar/import-errors";

type EditedItem = { id: string; description: string; date: string };
type Asking = { edited: EditedItem[]; settled: boolean };

const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function revertMessage(e: unknown): string {
  if (e instanceof NetworkError) return e.message;
  if (!(e instanceof ApiClientError)) return "Erro inesperado. Tente novamente.";
  if (e.code === "INVOICE_PAID_LOCKED")
    return "Uma fatura deste lote já foi paga. Desfaça o pagamento para desfazer a importação.";
  if (e.code === "IMPORT_REVERT_FORBIDDEN") return e.message;
  if (e.code === "VERSION_CONFLICT") return "Esta importação mudou. Recarregue e tente de novo.";
  return "Não foi possível desfazer a importação. Tente novamente.";
}

function RevertDrawer({ batch, onClose }: { batch: ImportBatchItem | null; onClose: () => void }) {
  const revert = useRevertImport();
  const [asking, setAsking] = useState<Asking>({ edited: [], settled: false });
  const [error, setError] = useState<string | null>(null);
  const key = useRef(newIdempotencyKey());
  const last = useRef<string | null>(null);
  if (batch?.id !== last.current) {
    last.current = batch?.id ?? null;
    key.current = newIdempotencyKey();
    if (asking.edited.length > 0 || asking.settled) setAsking({ edited: [], settled: false });
    if (error) setError(null);
  }

  function submit(next: Asking) {
    if (!batch) return;
    revert.mutate(
      {
        batchId: batch.id,
        version: batch.version,
        confirmEditedItems: next.edited.length > 0,
        confirmSettledPeriod: next.settled,
        idempotencyKey: key.current,
      },
      {
        onSuccess: () => {
          toast.success("Importação desfeita");
          onClose();
        },
        onError: (e) => {
          if (e instanceof ApiClientError && e.code === "IMPORT_EDITED_ITEMS") {
            const items = (e.details as { items?: EditedItem[] } | undefined)?.items ?? [];
            key.current = newIdempotencyKey(); // corpo novo = chave nova
            setAsking({ ...next, edited: items });
            setError(null);
          } else if (
            e instanceof ApiClientError &&
            e.code === "SETTLED_PERIOD_CONFIRMATION_REQUIRED"
          ) {
            key.current = newIdempotencyKey();
            setAsking({ ...next, settled: true });
            setError(null);
          } else setError(revertMessage(e));
        },
      },
    );
  }

  const confirming = asking.edited.length > 0 || asking.settled;
  return (
    <Drawer
      open={batch !== null}
      onOpenChange={(o) => !o && onClose()}
      title="Desfazer importação?"
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate-700">
          Todos os itens e parcelas futuras desta importação serão excluídos. O limite do cartão e o
          total da fatura voltam ao que eram antes. Depois você pode importar o arquivo de novo.
        </p>
        {asking.edited.length > 0 ? (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            <p className="font-semibold text-amber-900">
              Estes itens foram editados depois da importação:
            </p>
            <ul data-testid="edited-items" className="mt-1 list-disc pl-5 text-amber-900">
              {asking.edited.map((i) => (
                <li key={i.id}>
                  {i.description} · {dm(i.date)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {asking.settled ? (
          <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
            Algum item está em um mês que já foi acertado. O acerto será recalculado.
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
        <Button
          variant="danger"
          data-testid="confirm-revert"
          disabled={revert.isPending}
          onClick={() => submit(asking)}
        >
          {revert.isPending
            ? "Desfazendo…"
            : confirming
              ? "Desfazer mesmo assim"
              : "Desfazer importação"}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </Drawer>
  );
}

/** Seção "Importações" da tela do cartão (US-069): lotes com situação e "Desfazer importação". */
export function ImportsSection({ cardId }: { cardId: string }) {
  const q = useInvoiceImports(cardId, true);
  const [target, setTarget] = useState<ImportBatchItem | null>(null);
  const batches = q.data?.batches ?? [];
  if (q.isSuccess && batches.length === 0) return null;
  return (
    <section
      aria-label="Importações"
      className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-4"
    >
      <h2 className="text-lg font-semibold text-slate-900">Importações</h2>
      {q.isPending ? <Skeleton className="h-16" /> : null}
      {q.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2">
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button variant="secondary" onClick={() => void q.refetch()}>
            Tentar de novo
          </Button>
        </div>
      ) : null}
      <ul className="flex flex-col gap-2">
        {batches.map((b) => (
          <li
            key={b.id}
            data-testid="import-batch"
            className="flex flex-col gap-1 rounded-lg border border-slate-200 p-3 text-sm md:flex-row md:items-center md:justify-between"
          >
            <span className="flex flex-col text-slate-700">
              <span className="font-medium text-slate-900">
                {b.source} · fatura {formatInvoiceLabel(b.invoiceRef)}
              </span>
              <span>
                {brDayMonth(b.importedAt)} · {b.importedBy.split(" ")[0]} · {b.itemCount}{" "}
                {b.itemCount === 1 ? "item" : "itens"} · <Money cents={b.totalInCents} />
              </span>
              {b.revertedAt ? (
                <span data-testid="batch-reverted" className="font-semibold text-slate-600">
                  Revertida em {brDayMonth(b.revertedAt)}
                </span>
              ) : null}
              {b.revertBlockedReason === "INVOICE_PAID" ? (
                <span className="text-slate-600">Fatura paga: não dá para desfazer.</span>
              ) : null}
            </span>
            {b.canRevert ? (
              <Button variant="secondary" data-testid="revert-batch" onClick={() => setTarget(b)}>
                Desfazer importação
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <RevertDrawer batch={target} onClose={() => setTarget(null)} />
    </section>
  );
}
