import { cn } from "@/components/ui/cn";
import { UNLINKED_BADGE } from "@/modules/familia/display-name";

/** Selo "Sem acesso ao app" (US-092b/093a, SDD-034 §3.1): texto visível, não só cor. */
export function UnlinkedBadge({ className, id }: { className?: string; id?: string }) {
  return (
    <span
      id={id}
      data-testid="member-unlinked"
      className={cn(
        "shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
        className,
      )}
    >
      {UNLINKED_BADGE}
    </span>
  );
}
