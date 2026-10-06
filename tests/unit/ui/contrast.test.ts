import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync("src/app/globals.css", "utf8");

function block(header: string): Record<string, string> {
  const out: Record<string, string> = {};
  let from = 0;
  for (;;) {
    const i = css.indexOf(`\n${header} {`, from);
    if (i < 0) break;
    const end = css.indexOf("}", i);
    const body = css.slice(i, end);
    for (const d of body.matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
      out[d[1] as string] = (d[2] as string).toLowerCase();
    }
    from = end;
  }
  return out;
}

function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * (c[0] as number) + 0.7152 * (c[1] as number) + 0.0722 * (c[2] as number);
}
function ratio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return ((x as number) + 0.05) / ((y as number) + 0.05);
}

const light = block(":root");
const dark = { ...light, ...block(':root[data-theme="dark"]') };
const pageBg = { light: "#ffffff", dark: "#131c2e" };

describe("US-056 contraste dos estados (tokens)", () => {
  for (const [name, t] of [
    ["claro", light],
    ["escuro", dark],
  ] as const) {
    const bg = name === "claro" ? pageBg.light : pageBg.dark;
    it(`hover legível no tema ${name}`, () => {
      expect(
        ratio(t["--text-on-hover"] as string, t["--surface-hover"] as string),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        ratio(t["--text-on-hover"] as string, t["--surface-hover-brand"] as string),
      ).toBeGreaterThanOrEqual(4.5);
    });
    it(`ativo e desabilitado legíveis no tema ${name}`, () => {
      expect(
        ratio(t["--text-on-active"] as string, t["--surface-active"] as string),
      ).toBeGreaterThanOrEqual(4.5);
      expect(
        ratio(t["--text-disabled"] as string, t["--surface-disabled"] as string),
      ).toBeGreaterThanOrEqual(4.5);
    });
    it(`anel de foco visível no tema ${name}`, () => {
      expect(ratio(t["--focus-ring"] as string, bg)).toBeGreaterThanOrEqual(3);
    });
  }
});

function walk(dir: string, out: string[] = []): string[] {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

describe("US-056 camada de diálogos e cores soltas", () => {
  const files = walk("src");
  it("z-index fixo só fora de diálogos (Drawer usa dialog-layer)", () => {
    const drawer = readFileSync("src/components/ui/drawer.tsx", "utf8");
    expect(drawer).not.toMatch(/\bz-\d+\b|z-\[/);
    expect(drawer).toContain("useDialogDepth");
  });
  it("nenhum hover com fundo/texto branco fixo", () => {
    const bad = files.filter((f) => /hover:(bg|text)-white\b/.test(readFileSync(f, "utf8")));
    expect(bad).toEqual([]);
  });
});
