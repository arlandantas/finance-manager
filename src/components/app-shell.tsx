"use client";

import {
  CalendarClock,
  CreditCard,
  Eye,
  EyeOff,
  Home,
  ListOrdered,
  LogOut,
  Scale,
  Tags,
  Users,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense, useEffect, useRef, useState } from "react";
import { signOutAction } from "@/app/actions";
import { JoinedNotice } from "@/components/joined-notice";
import { HIDE_VALUES_HINT, useHideValues } from "@/components/money";
import { QuickAddProvider } from "@/components/quick-add";
import { Avatar } from "@/components/ui/avatar";
import { cn } from "@/components/ui/cn";
import { useTheme } from "@/lib/use-theme";

export type ShellUser = { name: string; email: string; image: string | null };

/** Telas de formulário de página inteira: o "+" não pode cobrir "Salvar" (SDD-010 §6.4). */
const HIDE_FAB_ROUTES = ["/acerto/regra"];

const NAV_ITEMS: Array<{ href: string; label: string; icon: typeof Home }> = [
  { href: "/", label: "Início", icon: Home },
  { href: "/extrato", label: "Extrato", icon: ListOrdered },
  { href: "/contas", label: "Contas", icon: Wallet },
  { href: "/cartoes", label: "Cartões", icon: CreditCard },
  { href: "/previstas", label: "A pagar", icon: CalendarClock },
  { href: "/acerto", label: "Acerto", icon: Scale },
  { href: "/familia", label: "Família", icon: Users },
];

function UserMenu({ user }: { user: ShellUser }) {
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useTheme();
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
          className="absolute right-0 z-30 mt-2 w-64 rounded-xl border border-slate-200 bg-white dark:bg-slate-100 p-2 shadow-lg"
        >
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-xs text-slate-500">{user.email}</p>
          </div>
          <div role="group" aria-label="Aparência" className="px-3 py-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Aparência
            </p>
            <div className="mt-1 flex flex-col">
              {(
                [
                  ["system", "Sistema"],
                  ["light", "Claro"],
                  ["dark", "Escuro"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  role="menuitemradio"
                  aria-checked={theme === v}
                  onClick={() => setTheme(v)}
                  className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-left text-sm font-medium text-slate-800 hover:bg-slate-100"
                >
                  <span className="w-4">{theme === v ? "✓" : ""}</span>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Link
            href="/categorias"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-sm font-medium text-slate-800 hover:bg-slate-100"
          >
            <Tags size={16} aria-hidden="true" />
            Categorias
          </Link>
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

function EyeToggle() {
  const { hidden, toggle } = useHideValues();
  const Icon = hidden ? EyeOff : Eye;
  return (
    <button
      type="button"
      data-testid="hide-values-toggle"
      aria-pressed={hidden}
      aria-label={hidden ? "Valores ocultos" : "Valores visíveis"}
      title={HIDE_VALUES_HINT}
      onClick={toggle}
      className="flex min-h-11 min-w-11 items-center justify-center rounded-full text-slate-700 hover:bg-slate-100"
    >
      <Icon size={20} aria-hidden="true" />
    </button>
  );
}

function OfflineBanner() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  if (online) return null;
  return (
    <p
      role="status"
      className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900 dark:text-amber-200"
    >
      Sem conexão.
    </p>
  );
}

export function AppShell({
  user,
  familyName,
  settlementEnabled = true,
  children,
}: {
  user: ShellUser;
  familyName: string;
  settlementEnabled?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const navItems = settlementEnabled ? NAV_ITEMS : NAV_ITEMS.filter((i) => i.href !== "/acerto");
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 pb-20 lg:pb-0">
      <OfflineBanner />
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white dark:bg-slate-100">
        <div className="mx-auto flex h-14 w-full max-w-[960px] items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-6">
            <Link
              href="/"
              className="truncate text-base font-bold text-brand-800 dark:text-emerald-300"
              data-testid="family-name"
            >
              {familyName}
            </Link>
            <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center rounded-lg px-3 text-sm font-medium",
                    isActive(item.href)
                      ? "bg-brand-50 text-brand-800 dark:text-emerald-300"
                      : "text-slate-700 hover:bg-slate-100",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <EyeToggle />
            <UserMenu user={user} />
          </div>
        </div>
      </header>
      <QuickAddProvider hideFab={HIDE_FAB_ROUTES.includes(pathname)}>
        <div className="mx-auto w-full max-w-[960px] flex-1 px-4 py-6">
          <Suspense fallback={null}>
            <JoinedNotice familyName={familyName} />
          </Suspense>
          {children}
        </div>
      </QuickAddProvider>
      <nav
        aria-label="Principal (celular)"
        className="fixed inset-x-0 bottom-0 z-20 flex border-t border-slate-200 bg-white dark:bg-slate-100 lg:hidden"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(item.href) ? "page" : undefined}
              className={cn(
                "flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium",
                isActive(item.href) ? "text-brand-800 dark:text-emerald-300" : "text-slate-600",
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
