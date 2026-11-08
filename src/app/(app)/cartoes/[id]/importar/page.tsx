import { notFound } from "next/navigation";
import { Suspense } from "react";
import { invoiceImportEnabled } from "@/modules/importacao/config";
import { ImportScreen } from "./import-screen";

export const metadata = { title: "Importar fatura · Finance Manager" };
export const dynamic = "force-dynamic";

// ADR-042 §8: flag desligada = a tela some (404), como as rotas da API.
export default async function ImportPage({ params }: { params: Promise<{ id: string }> }) {
  if (!invoiceImportEnabled()) notFound();
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <ImportScreen cardId={id} />
    </Suspense>
  );
}
