"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { Skeleton } from "@/components/ui/skeleton";
import { useCard } from "@/modules/cartoes/hooks";
import { useCategories } from "@/modules/categorias/hooks";
import { useFamily } from "@/modules/familia/hooks";
import { useAiSettings } from "@/modules/ia/hooks";
import type { ConfirmImportBody } from "@/modules/importacao/confirm-schema";
import { useConfirmImport } from "@/modules/importacao/hooks";
import type { ImportDraft } from "@/modules/importacao/schemas";
import { importErrorMessage } from "./import-errors";
import { ImportReviewStep } from "./import-review-step";
import { ImportUploadStep } from "./import-upload-step";

type Loaded = { draft: ImportDraft; file: File };

export function ImportScreen({ cardId }: { cardId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const card = useCard(cardId);
  const family = useFamily();
  const categories = useCategories("EXPENSE");
  const settings = useAiSettings();
  const confirm = useConfirmImport();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const back = `/cartoes/${cardId}${params.get("ref") ? `?ref=${params.get("ref")}` : ""}`;

  // Rascunho só na memória: fechar/recarregar perde, então avisa o navegador.
  useEffect(() => {
    if (!loaded) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [loaded]);

  const c = card.data?.card;
  const failed = card.isError || family.isError || categories.isError;
  const ready = c && family.data && categories.data;

  function submit(body: ConfirmImportBody, idempotencyKey: string) {
    setError(null);
    confirm.mutate(
      { cardId, body, idempotencyKey },
      {
        onSuccess: (r) => {
          const n = r.batch.itemCount;
          toast.success(n === 1 ? "1 item importado" : `${n} itens importados`);
          router.push(`/cartoes/${cardId}?ref=${body.invoiceRef}`);
        },
        onError: (e) => setError(importErrorMessage(e)),
      },
    );
  }

  const refs = c ? [c.openInvoice, ...c.payableInvoices] : [];
  const sorted = [...new Map(refs.map((r) => [r.ref, { ref: r.ref }])).values()].sort((a, b) =>
    b.ref.localeCompare(a.ref),
  );
  const wanted = params.get("ref");
  const initialRef =
    wanted && sorted.some((r) => r.ref === wanted) ? wanted : (c?.openInvoice.ref ?? "");
  const feature = settings.data?.features.find((f) => f.purpose === "INVOICE_IMPORT");

  return (
    <main className="flex flex-col gap-4">
      {loaded ? (
        <Button variant="ghost" className="self-start" onClick={() => setLeaving(true)}>
          <ArrowLeft size={16} aria-hidden="true" />
          Fatura
        </Button>
      ) : (
        <Link
          href={back}
          className="flex min-h-11 items-center gap-1 self-start text-sm font-medium text-brand-800 dark:text-emerald-300"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          Fatura
        </Link>
      )}
      <h1 className="text-2xl font-semibold text-slate-900">Importar fatura</h1>
      {c?.archived ? (
        <p role="alert" className="text-sm text-slate-700">
          Cartão arquivado: não é possível importar.
        </p>
      ) : null}
      {failed ? (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-800 dark:text-red-300">Não foi possível carregar</p>
          <Button
            variant="secondary"
            onClick={() => {
              void card.refetch();
              void family.refetch();
              void categories.refetch();
            }}
          >
            Tentar de novo
          </Button>
        </div>
      ) : null}
      {!failed && !ready ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : null}
      {ready && c && !c.archived && !loaded ? (
        <ImportUploadStep
          cardId={cardId}
          refs={sorted}
          initialRef={initialRef}
          feature={feature}
          isAdmin={family.data?.currentRole === "ADMIN"}
          onDraft={(draft, file) => setLoaded({ draft, file })}
        />
      ) : null}
      {ready && loaded ? (
        <ImportReviewStep
          draft={loaded.draft}
          categories={categories.data.items.map((x) => ({ id: x.id, name: x.name }))}
          members={family.data.members.map((m) => ({ id: m.memberId, name: m.name }))}
          pending={confirm.isPending}
          error={error}
          onConfirm={submit}
          onCancel={() => setLeaving(true)}
        />
      ) : null}
      <Drawer open={leaving} onOpenChange={setLeaving} title="Sair da revisão?">
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-700">A revisão será perdida. Nada foi importado.</p>
          <Button variant="danger" onClick={() => router.push(back)}>
            Sair sem importar
          </Button>
          <Button variant="ghost" onClick={() => setLeaving(false)}>
            Continuar revisando
          </Button>
        </div>
      </Drawer>
    </main>
  );
}
