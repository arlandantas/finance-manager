"use client";

import { cn } from "@/components/ui/cn";
import { splitSwitchLabel } from "@/modules/split/shares-label";

/** Interruptor "Dividir com a família" da assinatura (US-099, spec 12 regra 14): mesmo rótulo da compra. */
export function SubscriptionShareSwitch({
  shared,
  onChange,
  ruleShares,
  notice,
}: {
  shared: boolean;
  onChange: (next: boolean) => void;
  ruleShares: Array<{ bps: number }> | null | undefined;
  notice?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-center justify-between gap-3">
        <span id="sub-shared-label" className="text-sm font-medium text-slate-800">
          Dividir com a família
          <span data-testid="split-label" className="block text-xs font-normal text-slate-500">
            {splitSwitchLabel(shared, ruleShares)}
          </span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={shared}
          aria-labelledby="sub-shared-label"
          onClick={() => onChange(!shared)}
          className={cn(
            "relative h-7 w-12 shrink-0 rounded-full transition-colors",
            shared ? "bg-brand-700" : "bg-slate-300",
          )}
        >
          <span
            className={cn(
              "absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all dark:bg-slate-100",
              shared ? "left-[22px]" : "left-0.5",
            )}
          />
        </button>
      </div>
      {notice ? <p className="text-xs text-slate-600">{notice}</p> : null}
    </div>
  );
}
