import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { contrastRatio, resolveTheme, THEME_BOOTSTRAP_SCRIPT, THEME_KEY } from "@/lib/theme";

function run(opts: { stored?: string | null; dark: boolean; throwStorage?: boolean }) {
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.style.colorScheme = "";
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("dark") && opts.dark }));
  const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation((k: string) => {
    if (opts.throwStorage) throw new Error("negado");
    return k === THEME_KEY ? (opts.stored ?? null) : null;
  });
  new Function(THEME_BOOTSTRAP_SCRIPT)();
  get.mockRestore();
  return document.documentElement.getAttribute("data-theme");
}

beforeEach(() => vi.unstubAllGlobals());

describe("US-037 script de bootstrap do tema", () => {
  it("sem preferência segue o sistema (escuro e claro)", () => {
    expect(run({ dark: true })).toBe("dark");
    expect(run({ dark: false })).toBe("light");
  });
  it("preferência explícita vence o sistema; 'system' segue o sistema", () => {
    expect(run({ stored: "light", dark: true })).toBe("light");
    expect(run({ stored: "dark", dark: false })).toBe("dark");
    expect(run({ stored: "system", dark: true })).toBe("dark");
  });
  it("valor inválido ou storage indisponível => sistema (sem exceção)", () => {
    expect(run({ stored: "roxo", dark: true })).toBe("dark");
    expect(run({ dark: true, throwStorage: true })).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });
  it("resolveTheme", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });
});

// Pares semânticos texto/fundo × 2 temas (WCAG AA: 4,5:1 texto, 3:1 ícones/pontos)
const css = readFileSync("src/app/globals.css", "utf8");
const darkBlock = /:root\[data-theme="dark"\] \{([^}]*)\}/.exec(css)?.[1] ?? "";
const dark = (name: string) =>
  new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(darkBlock)?.[1] as string;
const LIGHT = {
  white: "#ffffff",
  "slate-50": "#f8fafc",
  "slate-100": "#f1f5f9",
  "slate-500": "#64748b",
  "slate-600": "#475569",
  "slate-700": "#334155",
  "slate-900": "#0f172a",
  "red-50": "#fef2f2",
  "red-100": "#fee2e2",
  "red-300": "#fca5a5",
  "red-800": "#991b1b",
  "amber-50": "#fffbeb",
  "amber-100": "#fef3c7",
  "amber-900": "#78350f",
  "emerald-100": "#d1fae5",
  "emerald-300": "#6ee7b7",
  "emerald-800": "#065f46",
  "brand-700": "#047857",
};
describe("US-037 contraste AA nos dois temas", () => {
  const surface = { light: LIGHT.white, dark: dark("slate-100") };
  const page = { light: LIGHT["slate-50"], dark: dark("slate-50") };
  const cases: Array<[string, { light: string; dark: string }, { light: string; dark: string }]> = [
    ["texto principal sobre card", { light: LIGHT["slate-900"], dark: dark("slate-900") }, surface],
    ["texto secundário sobre página", { light: LIGHT["slate-600"], dark: dark("slate-600") }, page],
    [
      "texto terciário (slate-500) sobre card",
      { light: LIGHT["slate-500"], dark: dark("slate-500") },
      surface,
    ],
    [
      "'Atrasada'/erro (red-800 → red-300 no escuro) sobre red-100",
      { light: LIGHT["red-800"], dark: "#fca5a5" },
      { light: LIGHT["red-100"], dark: dark("red-100") },
    ],
    [
      "erro sobre red-50",
      { light: LIGHT["red-800"], dark: "#fca5a5" },
      { light: LIGHT["red-50"], dark: dark("red-50") },
    ],
    [
      "atenção/'saldo insuficiente' (amber-900 → amber-200) sobre amber-50",
      { light: LIGHT["amber-900"], dark: "#fde68a" },
      { light: LIGHT["amber-50"], dark: dark("amber-50") },
    ],
    [
      "positivo (emerald-800 → emerald-300) sobre emerald-100",
      { light: LIGHT["emerald-800"], dark: "#6ee7b7" },
      { light: LIGHT["emerald-100"], dark: dark("emerald-100") },
    ],
    [
      "link de marca (brand-800 → emerald-300) sobre card",
      { light: "#065f46", dark: "#6ee7b7" },
      surface,
    ],
    [
      "texto branco sobre botão de marca (inalterado)",
      { light: "#ffffff", dark: "#ffffff" },
      { light: LIGHT["brand-700"], dark: LIGHT["brand-700"] },
    ],
  ];
  for (const [name, fg, bg] of cases) {
    for (const theme of ["light", "dark"] as const) {
      it(`${name} — ${theme} >= 4,5:1`, () => {
        expect(contrastRatio(fg[theme], bg[theme])).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it("borda de foco (brand-700) >= 3:1 no tema claro; contrastRatio básico", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#047857", "#ffffff")).toBeGreaterThanOrEqual(3);
  });
});
