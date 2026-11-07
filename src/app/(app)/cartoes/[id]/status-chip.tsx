import { cn } from "@/components/ui/cn";
import type { InvoiceDTO } from "@/modules/cartoes/schemas";

export function StatusChip({ invoice }: { invoice: InvoiceDTO }) {
  const label = invoice.isOverdue
    ? "Vencida"
    : invoice.isFuture
      ? "Futura"
      : invoice.status === "OPEN"
        ? "Aberta"
        : invoice.status === "PAID"
          ? "Paga"
          : "Fechada";
  const tone = invoice.isFuture
    ? "bg-violet-50 text-violet-800"
    : invoice.isOverdue
      ? "bg-red-100 text-red-800 dark:text-red-300"
      : invoice.status === "PAID"
        ? "bg-emerald-100 text-emerald-800 dark:text-emerald-300"
        : invoice.status === "CLOSED"
          ? "bg-amber-100 text-amber-900 dark:text-amber-200"
          : "bg-slate-100 text-slate-700";
  return (
    <span
      data-testid="invoice-status"
      className={cn("rounded-full px-3 py-1 text-sm font-semibold", tone)}
    >
      {label}
    </span>
  );
}
