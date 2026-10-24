import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Piso de versões corrigidas dos avisos do levantamento de segurança (pnpm audit).
function installed(pkg: string): string {
  const file = path.resolve(import.meta.dirname, "../../../node_modules", pkg, "package.json");
  return JSON.parse(readFileSync(file, "utf8")).version as string;
}

function atLeast(version: string, min: string): boolean {
  const a = version.split(/[.-]/).slice(0, 3).map(Number);
  const b = min.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x > y;
  }
  return true;
}

describe("SEC-002/007/014/019 versões mínimas de dependências", () => {
  it.each([
    ["next", "16.4.1"], // GHSA-2464-fhr4-w9xw, GHSA-673q-mjm6-r5xr, GHSA-p3m5-59mp-jv5r
    ["zod", "4.6.6"], // GHSA-mrhx-c7xc-m3w5
  ])("%s >= %s", (pkg, min) => {
    expect(atLeast(installed(pkg), min), `${pkg} instalado: ${installed(pkg)}`).toBe(true);
  });
});
