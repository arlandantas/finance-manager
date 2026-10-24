"use client";

import { type ReactNode, useEffect, useState } from "react";

export type TabDef = { id: string; label: string; content: ReactNode };

/** Abas simples (WAI-ARIA tabs). O `#id` da URL escolhe a aba inicial (ex.: `#limites`). */
export function Tabs({ tabs }: { tabs: TabDef[] }) {
  const [active, setActive] = useState(tabs[0]?.id ?? "");
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash && tabs.some((t) => t.id === hash)) setActive(hash);
  }, [tabs]);

  if (tabs.length === 1) return <>{tabs[0]?.content}</>;
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label="Assistente de IA"
        className="flex gap-1 overflow-x-auto border-b border-slate-200"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setActive(t.id)}
            className={`min-h-11 shrink-0 border-b-2 px-3 text-sm font-semibold ${active === t.id ? "border-brand-700 text-brand-800 dark:text-emerald-300" : "border-transparent text-slate-600"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div
          key={t.id}
          role="tabpanel"
          id={`panel-${t.id}`}
          aria-labelledby={`tab-${t.id}`}
          hidden={active !== t.id}
        >
          {active === t.id ? t.content : null}
        </div>
      ))}
    </div>
  );
}
