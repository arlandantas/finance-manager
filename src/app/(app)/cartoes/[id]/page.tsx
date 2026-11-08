import { Suspense } from "react";
import { invoiceImportEnabled } from "@/modules/importacao/config";
import { InvoiceScreen } from "./invoice-screen";

export const metadata = { title: "Fatura do cartão · Finance Manager" };

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense fallback={null}>
      <InvoiceScreen cardId={id} importEnabled={invoiceImportEnabled()} />
    </Suspense>
  );
}
