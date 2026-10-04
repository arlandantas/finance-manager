"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/components/ui/cn";

/**
 * Drawer inferior no celular e modal centralizado no desktop (SDD-000 §7):
 * `role="dialog"`, foco preso e `Esc` fecha (Radix Dialog).
 */
export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  initialFocusId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
  /** id do elemento que recebe o foco ao abrir (padrão do Radix: primeiro focável). */
  initialFocusId?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-slate-900/50" />
        <Dialog.Content
          onOpenAutoFocus={(e) => {
            if (!initialFocusId) return;
            e.preventDefault();
            document.getElementById(initialFocusId)?.focus();
          }}
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-xl outline-none",
            "md:inset-auto md:left-1/2 md:top-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-2xl",
            className,
          )}
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <Dialog.Title className="text-lg font-semibold text-slate-900">{title}</Dialog.Title>
            <Dialog.Close
              aria-label="Fechar"
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100"
            >
              <X size={20} aria-hidden="true" />
            </Dialog.Close>
          </div>
          {description ? (
            <Dialog.Description className="px-4 pt-3 text-sm text-slate-600">
              {description}
            </Dialog.Description>
          ) : (
            <Dialog.Description className="sr-only">{title}</Dialog.Description>
          )}
          <div className="overflow-y-auto px-4 py-4">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
