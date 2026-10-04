"use client";

import { Home, LogOut, Wallet } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";

export type ShellUser = { name: string; email: string; image: string | null };

const NAV_ITEMS: Array<{ href: string; label: string; icon: typeof Home }> = [
  { href: "/", label: "Início", icon: Home },
  { href: "/contas", label: "Contas", icon: Wallet },
];

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-label={`Menu do usuário ${user.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-full hover:bg-slate-100"
      >
        <Avatar name={user.name} image={user.image} size={36} />
        <span className="hidden text-sm font-medium text-slate-800 md:inline">{user.name}</span>
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <form action={signOutAction}>
            <button
              type="submit"
              role="menuitem"
              className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
            >
              <LogOut size={16} aria-hidden="true" />
              Sair
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  user,
  familyName,
  children,
}: {
  user: ShellUser;
  familyName: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-20 md:pb-0">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/"
              className="truncate text-base font-bold text-brand-800"
              data-testid="family-name"
            >
              {familyName}
            </Link>
            <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium",
                    isActive(item.href)
                      ? "bg-brand-50 text-brand-800"
                      : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <UserMenu user={user} />
        </div>
      </header>
      <div className="mx-auto w-full max-w-5xl flex-1 px-4 py-6">{children}</div>
      <nav
        aria-label="Principal (celular)"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white md:hidden"
      >
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                isActive(item.href) ? "text-brand-800" : "text-slate-600",
              )}
            >
              <Icon size={20} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
