import { describe, expect, it } from "vitest";
import { parseCsvAmount, parseCsvDate } from "@/modules/importacao/csv-amount";
import { extractInstallment, parseInvoiceCsv } from "@/modules/importacao/csv-parser";
import { detectFormat, MAX_CSV_LINES } from "@/modules/importacao/file-format";
import { EXPECTED, FIXTURES } from "./fixtures";

describe("US-066 valores em centavos (sem float)", () => {
  it.each([
    ["1.234,56", 123456n],
    ["1234.56", 123456n],
    ["0,01", 1n],
    ["R$ 5", 500n],
    ["-10,00", -1000n],
    ["1.234", 123400n],
    ["10,5", 1050n],
    ["(10,00)", -1000n],
  ])("%s => %s", (raw, cents) => expect(parseCsvAmount(raw)).toBe(cents));
  it.each(["", "abc", "1,2,3x", "12,345,6"])("inválido %j => null", (raw) =>
    expect(parseCsvAmount(raw)).toBeNull(),
  );
  it("datas dd/mm/aaaa, dd/mm (ano pela fatura) e ISO; inválidas = null", () => {
    expect(parseCsvDate("03/10/2026", "2026-10")).toBe("2026-10-03");
    expect(parseCsvDate("03/10", "2026-10")).toBe("2026-10-03");
    expect(parseCsvDate("28/12", "2027-01")).toBe("2026-12-28");
    expect(parseCsvDate("2026-10-03", "2026-10")).toBe("2026-10-03");
    expect(parseCsvDate("31/02/2026", "2026-10")).toBeNull();
  });
  it("parcela 03/10 sai da descrição; fora de faixa fica", () => {
    expect(extractInstallment("LOJA X 03/10")).toEqual({
      description: "LOJA X",
      installment: { no: 3, count: 10 },
    });
    expect(extractInstallment("LOJA X PARC 1/2").installment).toEqual({ no: 1, count: 2 });
    expect(extractInstallment("LOJA X 11/10")).toEqual({
      description: "LOJA X 11/10",
      installment: null,
    });
    expect(extractInstallment("LOJA X 1/1").installment).toBeNull();
  });
});

describe("US-066 CSV de 5 bancos gera os mesmos itens (AC4)", () => {
  it.each(Object.keys(FIXTURES))("%s", (bank) => {
    const f = FIXTURES[bank] as (typeof FIXTURES)[string];
    const fmt = detectFormat(f.bytes);
    expect(fmt?.kind).toBe("CSV");
    const r = parseInvoiceCsv((fmt as { text: string }).text, f.ref);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.items.map(({ idx: _i, ...rest }) => rest)).toEqual(EXPECTED);
  });
});

describe("US-066 erros do CSV (AC2, AC5)", () => {
  it("sem colunas = CSV_COLUMNS_NOT_FOUND", () =>
    expect(parseInvoiceCsv("a;b;c\n1;2;3\n", "2026-10")).toEqual({
      ok: false,
      code: "CSV_COLUMNS_NOT_FOUND",
    }));
  it("sem itens = NOT_AN_INVOICE", () =>
    expect(parseInvoiceCsv("Data;Descrição;Valor\n", "2026-10")).toEqual({
      ok: false,
      code: "NOT_AN_INVOICE",
    }));
  it("> 300 itens e > 3000 linhas = IMPORT_TOO_LARGE", () => {
    const row = (i: number) => `01/10/2026;ITEM ${i};1,00`;
    const head = "Data;Descrição;Valor\n";
    const many = head + Array.from({ length: 301 }, (_, i) => row(i)).join("\n");
    expect(parseInvoiceCsv(many, "2026-10")).toEqual({ ok: false, code: "IMPORT_TOO_LARGE" });
    const lines =
      head + "\n".repeat(0) + Array.from({ length: MAX_CSV_LINES }, () => "x;y;z").join("\n");
    expect(parseInvoiceCsv(lines, "2026-10")).toEqual({ ok: false, code: "IMPORT_TOO_LARGE" });
  });
});

describe("US-066 detector de formato (AC2)", () => {
  it("PDF pelos bytes", () =>
    expect(detectFormat(Uint8Array.from(Buffer.from("%PDF-1.7\n...")))).toEqual({ kind: "PDF" }));
  it("PNG renomeado .csv, binário com NUL e vazio = null", () => {
    const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    expect(detectFormat(png)).toBeNull();
    expect(detectFormat(Uint8Array.from(Buffer.from("a;b\0c")))).toBeNull();
    expect(detectFormat(new Uint8Array())).toBeNull();
  });
  it("texto sem separador não é CSV", () =>
    expect(detectFormat(Uint8Array.from(Buffer.from("só uma frase")))).toBeNull());
  it("UTF-8 e Latin-1 decodificam igual", () => {
    const a = detectFormat(Uint8Array.from(Buffer.from("Histórico;Valor", "utf8")));
    const b = detectFormat(Uint8Array.from(Buffer.from("Histórico;Valor", "latin1")));
    expect(a).toEqual(b);
  });
});
