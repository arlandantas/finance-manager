import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/v1/cards/[id]/invoice-imports/preview/route";
import { withClock } from "@/lib/clock";
import { logger } from "@/lib/logger";
import { MAX_FILE_BYTES } from "@/modules/importacao/file-format";
import { verifyImportToken } from "@/modules/importacao/token";
import { ORIGIN } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
} from "../support/factories";
import { FIXTURES } from "../unit/importacao/fixtures";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z"; // fechamento dia 25: fatura aberta = 2026-10
let fx: FamilyFixture;
let acc: AccountFixture;
let card: CardFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;

type Opts = {
  file?: Uint8Array | null;
  ref?: string;
  extra?: Record<string, string>;
  as?: ReturnType<typeof mariana>;
  cardId?: string;
  contentType?: string;
};
async function send(o: Opts = {}) {
  const form = new FormData();
  const bytes = o.file === undefined ? (FIXTURES.itau as { bytes: Uint8Array }).bytes : o.file;
  if (bytes) form.set("file", new File([bytes as BlobPart], "fatura.csv"));
  form.set("invoiceRef", o.ref ?? "2026-10");
  for (const [k, v] of Object.entries(o.extra ?? {})) form.set(k, v);
  const as = o.as === undefined ? mariana() : o.as;
  const cardId = o.cardId ?? card.id;
  const headers = new Headers({ origin: ORIGIN, host: "localhost:3100" });
  if (as) headers.set("cookie", as.cookie);
  const req = new Request(`${ORIGIN}/api/v1/cards/${cardId}/invoice-imports/preview`, {
    method: "POST",
    headers,
    body: form,
  });
  const res = await withClock(NOW, () => POST(req, { params: Promise.resolve({ id: cardId }) }));
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}
const counts = async () => ({
  tx: await db.transaction.count(),
  idem: await db.idempotencyRecord.count(),
});

beforeEach(async () => {
  vi.stubEnv("INVOICE_IMPORT_ENABLED", "true");
  await resetDb();
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 500000 });
  card = await makeCard(fx, { name: "Nubank", owner: "Lucas", closingDay: 25, dueDay: 5 });
});
afterEach(() => vi.unstubAllEnvs());

describe("US-066 preview do CSV", () => {
  it("AC1: flag desligada = 404", async () => {
    vi.stubEnv("INVOICE_IMPORT_ENABLED", "false");
    expect((await send()).status).toBe(404);
    vi.stubEnv("INVOICE_IMPORT_ENABLED", "");
    expect((await send()).status).toBe(404);
  });

  it("devolve o rascunho com token válido, centavos como texto e pagador = titular", async () => {
    const r = await send();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ source: "CSV", invoiceRef: "2026-10" });
    expect(r.body.items).toHaveLength(3);
    expect(r.body.items[0]).toMatchObject({
      amountInCents: "123456",
      kind: "PURCHASE",
      categoryId: null,
      flags: [],
      payerMemberId: fx.byName.Lucas?.memberId,
    });
    expect(r.body.items[1]).toMatchObject({
      description: "LOJA DE ROUPAS",
      installment: { no: 3, count: 10 },
    });
    expect(r.body.items[2]).toMatchObject({ kind: "CREDIT", amountInCents: "1000" });
    const p = verifyImportToken(
      r.body.importToken,
      { familyId: fx.family.id, cardId: card.id },
      new Date(NOW),
    );
    expect(p?.fileHash).toBe(r.body.fileHash);
  });

  it("AC2: PNG .csv = 415; > 4 MB = 413; CSV com linhas/itens demais = 413", async () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const a = await send({ file: png });
    expect([a.status, a.body.error.code]).toEqual([415, "IMPORT_FORMAT_NOT_ACCEPTED"]);
    const big = await send({ file: new Uint8Array(MAX_FILE_BYTES + 1).fill(65) });
    expect([big.status, big.body.error.code]).toEqual([413, "IMPORT_FILE_TOO_LARGE"]);
    const head = "Data;Descrição;Valor\n";
    const items =
      head + Array.from({ length: 301 }, (_, i) => `01/10/2026;ITEM ${i};1,00`).join("\n");
    const b = await send({ file: Uint8Array.from(Buffer.from(items)) });
    expect([b.status, b.body.error.code]).toEqual([413, "IMPORT_TOO_LARGE"]);
    const lines = head + Array.from({ length: 3001 }, () => "x;y;z").join("\n");
    const c = await send({ file: Uint8Array.from(Buffer.from(lines)) });
    expect([c.status, c.body.error.code]).toEqual([413, "IMPORT_TOO_LARGE"]);
  });

  it("AC3: paga = 422; arquivado = 422; outra família = 404; ref posterior = 422", async () => {
    await makeCardPurchase(fx, {
      card,
      amountInCents: 10000,
      occurredOn: "2026-08-10",
      author: "Lucas",
    });
    const inv = await makeInvoice(fx, card, "2026-08");
    await makeInvoicePayment(fx, {
      card,
      invoice: inv,
      account: acc,
      amountInCents: 10000,
      paidOn: "2026-09-02",
      author: "Lucas",
    });
    const paid = await send({ ref: "2026-08" });
    expect([paid.status, paid.body.error.code]).toEqual([422, "INVOICE_PAID_LOCKED"]);
    expect((await send({ ref: "2026-09" })).status).toBe(200); // fechada e não paga
    const future = await send({ ref: "2026-11" });
    expect([future.status, future.body.error.code]).toEqual([422, "INVOICE_REF_INVALID"]);
    const bad = await send({ ref: "out/2026" });
    expect(bad.status).toBe(400);
    const other = await makeFamily({ uniqueEmails: true });
    const alien = await send({ as: other.byName.Mariana?.as ?? null });
    expect(alien.status).toBe(404);
    await db.creditCard.update({ where: { id: card.id }, data: { archivedAt: new Date(NOW) } });
    const arch = await send();
    expect([arch.status, arch.body.error.code]).toEqual([422, "INVALID_REFERENCE"]);
  });

  it("AC5: sem colunas = 422; sem itens = 422", async () => {
    const enc = (s: string) => Uint8Array.from(Buffer.from(s));
    const a = await send({ file: enc("a;b;c\n1;2;3\n") });
    expect([a.status, a.body.error.code]).toEqual([422, "CSV_COLUMNS_NOT_FOUND"]);
    const b = await send({ file: enc("Data;Descrição;Valor\n") });
    expect([b.status, b.body.error.code]).toEqual([422, "NOT_AN_INVOICE"]);
  });

  it("PDF reconhecido = 501 PDF_IMPORT_NOT_READY; campo desconhecido = 400; sem sessão = 401", async () => {
    const pdf = await send({ file: Uint8Array.from(Buffer.from("%PDF-1.7\n")) });
    expect([pdf.status, pdf.body.error.code]).toEqual([501, "PDF_IMPORT_NOT_READY"]);
    expect((await send({ extra: { familyId: "x" } })).status).toBe(400);
    expect((await send({ as: null })).status).toBe(401);
  });

  it("AC7: nada é gravado e o conteúdo do arquivo não vai ao log", async () => {
    const spies = (["info", "warn", "error", "debug"] as const).map((l) =>
      vi.spyOn(logger, l).mockImplementation(() => undefined),
    );
    const before = await counts();
    await send();
    await send({ file: Uint8Array.from(Buffer.from("a;b;c\n1;MERCADO BOM PRECO;3\n")) });
    await send({ file: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x1a, 0]) });
    expect(await counts()).toEqual(before);
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain("MERCADO");
    expect(logged).not.toContain("1.234,56");
    for (const s of spies) s.mockRestore();
  });
});
