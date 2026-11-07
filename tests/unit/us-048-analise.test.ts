import { describe, expect, it } from "vitest";
import { buildDrillUrl } from "@/modules/analise/drill";
import { AnalysisQuerySchema } from "@/modules/analise/schemas";

const parse = (o: Record<string, unknown>) => AnalysisQuerySchema.safeParse(o);

describe("US-048 AnalysisQuerySchema", () => {
  it("aplica padrões e é estrito", () => {
    const r = parse({});
    expect(r.success && r.data).toMatchObject({ groupBy: "category", type: "EXPENSE" });
    expect(parse({ extra: 1 }).success).toBe(false);
  });
  it("limita o intervalo a 24 meses", () => {
    expect(parse({ from: "2025-01-01", to: "2026-12-31" }).success).toBe(true);
    expect(parse({ from: "2025-01-01", to: "2027-01-01" }).success).toBe(false);
    expect(parse({ from: "2026-02-01", to: "2026-01-01" }).success).toBe(false);
    expect(parse({ period: "2026-10", from: "2026-10-01", to: "2026-10-31" }).success).toBe(false);
  });
});

describe("US-048 buildDrillUrl", () => {
  const q = AnalysisQuerySchema.parse({
    type: "INCOME",
    tagIds: "11111111-1111-4111-8111-111111111111",
  });
  it("mantém período, tipo, filtros e a categoria da linha", () => {
    const u = buildDrillUrl(q, "2026-10", { categoryId: "c1" });
    expect(u).toBe(
      "/extrato?period=2026-10&type=INCOME&categoryId=c1&tagIds=11111111-1111-4111-8111-111111111111",
    );
  });
  it("usa from/to quando o intervalo é livre", () => {
    const r = AnalysisQuerySchema.parse({ from: "2026-01-01", to: "2026-03-31" });
    expect(buildDrillUrl(r, "x..y", {})).toBe(
      "/extrato?from=2026-01-01&to=2026-03-31&type=EXPENSE",
    );
  });
});
