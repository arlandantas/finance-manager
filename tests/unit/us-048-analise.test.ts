import { describe, expect, it } from "vitest";
import { buildDrillUrl } from "@/modules/analise/drill";
import { AnalysisQuerySchema } from "@/modules/analise/schemas";
import { parseAnaliseUrl, toAnaliseSearch } from "@/modules/analise/url";

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

describe("US-049 buildDrillUrl e URL da Análise", () => {
  const id = (n: number) => `${String(n).repeat(8)}-1111-4111-8111-111111111111`;
  it("a linha troca o filtro plural da própria dimensão e mantém os demais", () => {
    const q = AnalysisQuerySchema.parse({ groupBy: "member", sourceIds: id(2), payerIds: id(3) });
    expect(buildDrillUrl(q, "2026-10", { payerId: id(4) })).toBe(
      `/extrato?period=2026-10&type=EXPENSE&payerIds=${id(4)}&sourceIds=${id(2)}`,
    );
    expect(buildDrillUrl(q, "2026-10", { untagged: true })).toContain("untagged=true");
  });
  it("tags e sem tag juntos são 400; mais de 20 ids também", () => {
    expect(parse({ untagged: "true", tagIds: id(1) }).success).toBe(false);
    expect(parse({ tagIds: Array.from({ length: 21 }, (_, i) => id(i % 9)) }).success).toBe(false);
  });
  it("parseAnaliseUrl/toAnaliseSearch fazem ida e volta e ignoram lixo", () => {
    const sp = new URLSearchParams(
      `period=2026-10&groupBy=tag&type=INCOME&payerIds=${id(1)}&payerIds=lixo&untagged=true`,
    );
    const u = parseAnaliseUrl(sp);
    expect(u).toEqual({
      period: "2026-10",
      groupBy: "tag",
      type: "INCOME",
      payerIds: [id(1)],
      untagged: true,
    });
    expect(parseAnaliseUrl(new URLSearchParams(toAnaliseSearch(u)))).toEqual(u);
    expect(parseAnaliseUrl(new URLSearchParams("groupBy=x")).groupBy).toBe("category");
  });
});
