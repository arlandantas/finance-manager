import { cn } from "@/components/ui/cn";
import type { AccountColor } from "@/modules/contas/colors";

/**
 * US-050 (SDD-017 §4.2): marcador de origem = ponto de 10 px + NOME (o nome nunca some; o ponto é
 * decorativo e fica fora da árvore de acessibilidade). Cor por `data-color` + CSS, sem estilo inline.
 */
export function SourceBadge({
  color,
  name,
  className,
}: {
  color: AccountColor;
  name: string;
  className?: string;
}) {
  return (
    <span
      data-testid="source-badge"
      data-color={color}
      className={cn("inline-flex max-w-full min-w-0 items-center gap-1.5 align-middle", className)}
    >
      <span className="source-dot" data-color={color} aria-hidden="true" />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}
