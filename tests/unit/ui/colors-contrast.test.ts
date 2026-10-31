import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio } from "@/lib/contrast";
import { ACCOUNT_COLORS } from "@/modules/contas/colors";

const css = readFileSync("src/app/globals.css", "utf8");

/** Variáveis `#rrggbb` declaradas em todos os blocos com este cabeçalho. */
function block(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  let from = 0;
  for (;;) {
    const i = css.indexOf(`\n${header} {`, from);
    if (i < 0) break;
    const end = css.indexOf("}", i);
    for (const d of css.slice(i, end).matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
      out[d[1] as string] = (d[2] as string).toLowerCase();
    }
    from = end;
  }
  return out;
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-theme="dark"]') };
// Fundos reais: body (slate-50), cartões (branco no claro, slate-100 no escuro) e hover/painéis (slate-100/200).
const backgrounds = {
  claro: ["#ffffff", "#f8fafc", "#f1f5f9"],
  escuro: [
    dark["--color-slate-50"] as string,
    dark["--color-slate-100"] as string,
    dark["--color-slate-200"] as string,
  ],
};

describe("US-050 contraste da cor de origem (tokens do globals.css)", () => {
  it("contrastRatio: preto/branco = 21 e é simétrico", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });

  for (const [theme, tokens] of [
    ["claro", light],
    ["escuro", dark],
  ] as const) {
    it(`as 10 cores têm >= 3:1 contra os fundos do tema ${theme}`, () => {
      for (const c of ACCOUNT_COLORS) {
        const color = tokens[`--source-${c.toLowerCase()}`];
        expect(color, `token --source-${c.toLowerCase()} (${theme})`).toMatch(/^#[0-9a-f]{6}$/);
        for (const bg of backgrounds[theme]) {
          expect(
            contrastRatio(color as string, bg),
            `${c} em ${bg} (${theme})`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    });
  }
});
