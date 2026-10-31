import type { ComponentProps } from "react";
import { cn } from "@/components/ui/cn";
import { inputClass } from "@/components/ui/field";
import type { AccountColor } from "@/modules/contas/colors";

/**
 * US-050: `<select>` nativo de conta/cartão com o ponto de cor da opção ESCOLHIDA ao lado do texto.
 * (Uma `<option>` nativa só aceita texto: o ponto não cabe dentro da lista aberta; o nome continua
 * sempre no texto da opção. Ver DEV-US050-1 no estado.)
 */
export function SourceSelect({
  color,
  className,
  children,
  ...rest
}: { color: AccountColor | null | undefined } & ComponentProps<"select">) {
  return (
    <div className="relative">
      {color ? (
        <span
          className="source-dot pointer-events-none absolute top-1/2 left-3 -translate-y-1/2"
          data-color={color}
          data-testid="select-source-dot"
          aria-hidden="true"
        />
      ) : null}
      <select className={cn(inputClass, color && "pl-8", className)} {...rest}>
        {children}
      </select>
    </div>
  );
}
