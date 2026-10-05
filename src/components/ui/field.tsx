import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "@/components/ui/cn";

export const inputClass =
  "min-h-11 w-full rounded-lg border border-slate-300 bg-white dark:bg-slate-100 px-3 text-base text-slate-900 placeholder:text-slate-400 aria-[invalid=true]:border-red-600 disabled:bg-slate-100";

export function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-slate-800">
        {label}
      </label>
      {children}
      {/* altura reservada: a mensagem entra e sai sem empurrar o formulário (US-039) */}
      <div className="min-h-5">
        {hint && !error ? <p className="text-xs text-slate-500">{hint}</p> : null}
        {error ? (
          <p id={`${id}-error`} role="alert" className="text-sm text-red-700 dark:text-red-300">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(inputClass, className)} {...props} />;
}
