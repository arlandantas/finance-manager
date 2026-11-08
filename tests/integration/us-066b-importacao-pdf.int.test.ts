import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/cards/[id]/invoice-imports/preview/route";
import { withClock } from "@/lib/clock";
import { logger } from "@/lib/logger";
import { getFakeAdapter } from "@/modules/ia/provider";
import { ORIGIN } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type CardFixture, type FamilyFixture, makeCard, makeFamily } from "../support/factories";
import { buildPdf } from "../support/pdf";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let card: CardFixture;

const DOC = [
  "Olá, Lucas Silva",
  "Titular Lucas Silva CPF 123.456.789-00",
  "Rua das Flores 123 CEP 01310-100 Tel (11) 91234-5678 lucas@exemplo.com",
  "Limite R$ 5.000,00 Cartão 5555 4444 3333 2222",
  "12/10 MERCADO BOM PRECO 1.234,56",
  "13 OUT LOJA DO LUCAS 03/10 R$ 50,00",
  "Total da fatura R$ 1.284,56",
  "Vencimento 05/11/2026",
];

async function send(file: Uint8Array, o: { as?: "Mariana" | "Lucas"; password?: string } = {}) {
  const form = new FormData();
  form.set("file", new File([file as BlobPart], "fatura.pdf"));
  form.set("invoiceRef", "2026-10");
  if (o.password !== undefined) form.set("password", o.password);
  const caller = fx.byName[o.as ?? "Mariana"]?.as;
  const req = new Request(`${ORIGIN}/api/v1/cards/${card.id}/invoice-imports/preview`, {
    method: "POST",
    headers: new Headers({ origin: ORIGIN, host: "localhost:3100", cookie: caller?.cookie ?? "" }),
    body: form,
  });
  const res = await withClock(NOW, () => POST(req, { params: Promise.resolve({ id: card.id }) }));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const counts = async () => ({
  tx: await db.transaction.count(),
  idem: await db.idempotencyRecord.count(),
  usage: await db.llmUsageEvent.count(),
});

beforeEach(async () => {
  vi.stubEnv("INVOICE_IMPORT_ENABLED", "true");
  await resetDb();
  fx = await makeFamily();
  card = await makeCard(fx, { name: "Nubank", owner: "Lucas", closingDay: 25, dueDay: 5 });
});
afterEach(() => vi.unstubAllEnvs());

describe("US-066b preview do PDF", () => {
  it("AC1/AC2/AC4: linhas redigidas L1..Ln, valores e datas intactos, hash estável", async () => {
    const pdf = buildPdf([DOC.slice(0, 5), DOC.slice(5)]);
    const a = await send(pdf);
    expect(a.status).toBe(200);
    expect(a.body.source).toBe("PDF");
    expect(a.body.lines.map((l: { ref: string }) => l.ref)).toEqual(["L1", "L2", "L3", "L4"]);
    const flat = JSON.stringify(a.body.lines);
    expect(flat).toContain("12/10 MERCADO BOM PRECO 1.234,56");
    expect(flat).toContain("13 OUT LOJA DO pessoa 03/10 R$ 50,00");
    for (const leak of [
      "Silva",
      "LUCAS",
      "123.456",
      "5555",
      "01310",
      "91234",
      "@",
      "Limite",
      "Flores",
    ]) {
      expect(flat.toLowerCase()).not.toContain(leak.toLowerCase());
    }
    expect(a.body.previewHash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.body.estimate.estimateInCents).toBeGreaterThan(0); // Mariana é ADMIN
    const b = await send(pdf);
    expect(b.body.previewHash).toBe(a.body.previewHash);
    const c = await send(buildPdf([DOC.slice(0, 5), [...DOC.slice(5), "14/10 FARMACIA 9,90"]]));
    expect(c.body.previewHash).not.toBe(a.body.previewHash);
  });

  it("estimativa só para ADMIN", async () => {
    const r = await send(buildPdf([DOC]), { as: "Lucas" });
    expect(r.status).toBe(200);
    expect(r.body.estimate).toBeUndefined();
  });

  it("AC3: sem texto = IMPORT_UNREADABLE; senha ausente/errada = PDF_PASSWORD_REQUIRED; certa extrai", async () => {
    const none = await send(buildPdf([["x"]], { withText: false }));
    expect([none.status, none.body.error.code]).toEqual([422, "IMPORT_UNREADABLE"]);
    const locked = buildPdf([DOC], { password: "segredo-abc" });
    const spies = (["info", "warn", "error", "debug"] as const).map((l) =>
      vi.spyOn(logger, l).mockImplementation(() => undefined),
    );
    const miss = await send(locked);
    const wrong = await send(locked, { password: "errada-xyz" });
    const ok = await send(locked, { password: "segredo-abc" });
    expect([miss.status, miss.body.error.code]).toEqual([422, "PDF_PASSWORD_REQUIRED"]);
    expect([wrong.status, wrong.body.error.code]).toEqual([422, "PDF_PASSWORD_REQUIRED"]);
    expect(ok.status).toBe(200);
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    const responses = JSON.stringify([miss.body, wrong.body, ok.body]);
    for (const s of ["segredo-abc", "errada-xyz"]) {
      expect(logged).not.toContain(s);
      expect(responses).not.toContain(s);
    }
    for (const s of spies) s.mockRestore();
  });

  it("limites: > 30 páginas = 413 IMPORT_TOO_LARGE; sem linhas candidatas = 422 NOT_AN_INVOICE", async () => {
    const big = await send(buildPdf(Array.from({ length: 31 }, () => ["12/10 ITEM 1,00"])));
    expect([big.status, big.body.error.code]).toEqual([413, "IMPORT_TOO_LARGE"]);
    const ok30 = await send(buildPdf(Array.from({ length: 30 }, () => ["12/10 ITEM 1,00"])));
    expect(ok30.status).toBe(200);
    const text = await send(buildPdf([["Apenas um texto qualquer sem valores nem datas aqui"]]));
    expect([text.status, text.body.error.code]).toEqual([422, "NOT_AN_INVOICE"]);
  });

  it("AC5: nenhuma chamada ao LLM e nada gravado", async () => {
    const fake = getFakeAdapter();
    const before = await counts();
    await send(buildPdf([DOC]));
    await send(buildPdf([DOC]), { as: "Lucas" });
    expect(fake?.calls.length ?? 0).toBe(0);
    expect(await counts()).toEqual(before);
  });
});
