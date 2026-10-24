// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// SDD-021 §7: após `next build`, nada do LLM pode estar no bundle do navegador (.next/static).
// Sem build presente, o teste é ignorado (o gate roda `pnpm build` antes, ver tasks-board).
const STATIC = path.join(process.cwd(), ".next", "static");

function walk(dir: string, acc: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const f = path.join(dir, n);
    if (statSync(f).isDirectory()) walk(f, acc);
    else if (/\.(js|css|map)$/.test(n)) acc.push(f);
  }
  return acc;
}

describe.skipIf(!existsSync(STATIC))("EN-004 bundle do cliente sem segredo nem SDK", () => {
  it("zero ocorrências de ANTHROPIC, sk-ant e @anthropic-ai em .next/static", () => {
    const hits = walk(STATIC).filter((f) =>
      /ANTHROPIC|sk-ant|@anthropic-ai|api\.anthropic\.com/.test(readFileSync(f, "utf8")),
    );
    expect(hits).toEqual([]);
  });
});
