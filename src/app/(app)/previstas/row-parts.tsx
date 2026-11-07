import { Repeat } from "lucide-react";

export const brDate = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const first = (n: string) => n.split(" ")[0] ?? n;

export function RecurringChip() {
  return (
    <span
      data-testid="recurring-chip"
      className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700"
    >
      <Repeat size={12} aria-hidden="true" />
      Recorrente
    </span>
  );
}
