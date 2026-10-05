import type { LedgerUiFilters } from "@/modules/transacoes/optimistic";

const TYPES = ["EXPENSE", "INCOME", "TRANSFER", "INVOICE_PAYMENT"] as const;

/** Filtros da URL (mesmos nomes da API, SDD-005 §4.1). Valores desconhecidos são ignorados. */
export function parseFilters(sp: { get(name: string): string | null }): LedgerUiFilters {
  const f: LedgerUiFilters = {};
  const period = sp.get("period");
  if (period && /^\d{4}-(0[1-9]|1[0-2])$/.test(period)) f.period = period;
  const from = sp.get("from");
  const to = sp.get("to");
  if (from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) {
    f.from = from;
    f.to = to;
    delete f.period; // `period` e `from/to` não convivem
  }
  for (const key of ["accountId", "cardId", "memberId", "categoryId"] as const) {
    const v = sp.get(key);
    if (v) f[key] = v;
  }
  const type = sp.get("type");
  if (type && (TYPES as readonly string[]).includes(type)) f.type = type as (typeof TYPES)[number];
  const shared = sp.get("shared");
  if (shared === "true" || shared === "false") f.shared = shared === "true";
  const q = sp.get("q")?.trim();
  if (q && q.length >= 2 && q.length <= 50) f.q = q;
  if (sp.get("includeDeleted") === "true") f.includeDeleted = true;
  return f;
}

export function filtersToSearch(f: LedgerUiFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f))
    if (v !== undefined && v !== false && v !== "") p.set(k, String(v));
  return p.toString();
}

/** Quantos filtros além do período estão ativos. */
export function activeFilterCount(f: LedgerUiFilters): number {
  const { period: _period, from: _from, to: _to, ...rest } = f;
  return Object.values(rest).filter((v) => v !== undefined && v !== false).length;
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const label = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number) as [number, number];
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** "nov/2026 a ago/2027" para o cabeçalho do Extrato por intervalo. */
export function intervalLabel(from: string, to: string): string {
  const MONTHS = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  const fmt = (d: string) => `${MONTHS[Number(d.slice(5, 7)) - 1]}/${d.slice(0, 4)}`;
  return `${fmt(from)} a ${fmt(to)}`;
}
