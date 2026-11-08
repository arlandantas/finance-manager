import { describe, expect, it } from "vitest";
import { assertNoIdentifiers, fold } from "@/modules/analise-ia/payload";
import { buildInvoicePayload, invoicePayloadHash } from "@/modules/importacao/pdf-preview";
import { candidateLines, redactInvoiceLines } from "@/modules/importacao/redact";
import { mulberry32 } from "../../support/prng";

const PEOPLE = [
  "Mariana Souza Lima",
  "lucas.pereira@example.com",
  "Lucas Pereira",
  "Ex Joaquim Braga",
];
const red = (l: string) => redactInvoiceLines([l], PEOPLE)[0]?.text ?? "";

describe("US-066b candidateLines", () => {
  it("fica com data+valor e termos; descarta cabeçalho, endereço e limite", () => {
    const text = [
      "Olá, Mariana Souza",
      "Rua das Flores 123, CEP 01310-100",
      "Limite total R$ 5.000,00",
      "Cartão final 1234",
      "12/10 MERCADO BOM PRECO 1.234,56",
      "05 OUT LOJA DE ROUPAS 03/10 R$ 50,00",
      "Total da fatura R$ 1.284,56",
      "Vencimento 05/11/2026",
      "Pagamento recebido -1.284,56",
      "IOF 3,50",
      "Compra sem valor",
      "",
    ].join("\n");
    expect(candidateLines(text)).toEqual([
      "12/10 MERCADO BOM PRECO 1.234,56",
      "05 OUT LOJA DE ROUPAS 03/10 R$ 50,00",
      "Total da fatura R$ 1.284,56",
      "Vencimento 05/11/2026",
      "Pagamento recebido -1.284,56",
      "IOF 3,50",
    ]);
  });
});

describe("US-066b redactInvoiceLines (tabela)", () => {
  it.each([
    ["12/10 MERCADO BOM PRECO 1.234,56", "12/10 MERCADO BOM PRECO 1.234,56"],
    ["12 OUT PADARIA R$ 10,00", "12 OUT PADARIA R$ 10,00"],
    ["12/10/2026 LOJA 03/10 1234,56", "12/10/2026 LOJA 03/10 1234,56"],
    ["12/10 PAGTO -50,00", "12/10 PAGTO -50,00"],
    ["12/10 CPF 123.456.789-00 LOJA 10,00", "12/10 CPF LOJA 10,00"],
    ["12/10 CPF 12345678900 LOJA 10,00", "12/10 CPF LOJA 10,00"],
    ["12/10 CNPJ 12.345.678/0001-90 10,00", "12/10 CNPJ 10,00"],
    ["12/10 LOJA 12345678000190 10,00", "12/10 LOJA 10,00"],
    ["12/10 fulano@mail.com 10,00", "12/10 10,00"],
    ["12/10 LOJA https://x.example/a?b=1 10,00", "12/10 LOJA 10,00"],
    ["12/10 LOJA www.loja.example 10,00", "12/10 LOJA 10,00"],
    ["12/10 LOJA (11) 91234-5678 10,00", "12/10 LOJA 10,00"],
    ["12/10 LOJA +55 11 91234-5678 10,00", "12/10 LOJA 10,00"],
    ["12/10 LOJA 1234 5678 9012 3456 10,00", "12/10 LOJA 10,00"],
    ["12/10 LOJA 5555-4444-3333-2222 10,00", "12/10 LOJA 10,00"],
    ["12/10 LOJA 01310-100 10,00", "12/10 LOJA 10,00"],
    ["12/10 LOJA 98765 10,00", "12/10 LOJA 10,00"],
    ["12/10 LOJA PARC 3 DE 10 10,00", "12/10 LOJA PARC 3 DE 10 10,00"],
    ["12/10 MARIANA PADARIA 10,00", "12/10 pessoa PADARIA 10,00"],
    ["12/10 Lúcas&Pereira 10,00", "12/10 pessoa&pessoa 10,00"],
    ["12/10 JOAQUIM BRAGA 10,00", "12/10 pessoa pessoa 10,00"],
    ["12/10 ｌｕｃａｓ 10,00", "12/10 pessoa 10,00"],
    ["12/10 Lu\u200Bcas Pe\u00ADreira 10,00", "12/10 pessoa pessoa 10,00"],
    ["12/10 JOAOBRAGA 10,00", "12/10 pessoa 10,00"],
    ["12/10 xLUCASx 10,00", "12/10 pessoa 10,00"],
    ["12/10 CARTAO 4111111111111111,00", "12/10 CARTAO ,00"],
    ["12/10 BANANA 10,00", "12/10 BANANA 10,00"],
  ])("%s", (input, expected) => {
    expect(red(input)).toBe(expected);
  });

  it("refs L1..Ln opacas e sequenciais; linha que esvazia some", () => {
    const out = redactInvoiceLines(["12/10 A 1,00", "123.456.789-00", "13/10 B 2,00"], PEOPLE);
    expect(out.map((l) => l.ref)).toEqual(["L1", "L2"]);
  });
});

describe("US-066b previewHash", () => {
  const text = "12/10 MERCADO 1.234,56\n13/10 PADARIA 10,00\nTotal 1.244,56";
  it("mesmo texto, mesmo hash; uma linha diferente muda o hash", () => {
    const a = invoicePayloadHash(buildInvoicePayload(text, PEOPLE));
    expect(invoicePayloadHash(buildInvoicePayload(text, PEOPLE))).toBe(a);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    const b = invoicePayloadHash(buildInvoicePayload(text.replace("PADARIA", "FARMACIA"), PEOPLE));
    expect(b).not.toBe(a);
  });
  it("sem linha candidata = NOT_AN_INVOICE; > 400 linhas = IMPORT_TOO_LARGE", () => {
    expect(() => buildInvoicePayload("só texto\noutro texto", PEOPLE)).toThrow(/fatura/);
    const many = Array.from({ length: 401 }, (_, i) => `12/10 ITEM ${i} 1,00`).join("\n");
    expect(() => buildInvoicePayload(many, PEOPLE)).toThrow(/linhas demais/);
  });
});

// Propriedade (ADR-029 §5): ≥ 200 documentos com dados "maliciosos"; nada identificável sai.
describe("US-066b propriedade: nenhum identificador sai", () => {
  const FIRST = ["Mariana", "Lucas", "Joaquim", "Beatriz", "Ágatha", "Zeca", "Valéria", "Íris"];
  const LAST = ["Souza", "Pereira", "Braga", "Nóbrega", "Albuquerque", "Çalhanoglu"];
  const MERCH = ["MERCADO BOM PRECO", "PADARIA", "UBER TRIP", "POSTO IPIRANGA", "LOJA DE ROUPAS"];
  const pick = <T>(r: () => number, a: T[]): T => a[Math.floor(r() * a.length)] as T;
  const digits = (r: () => number, n: number) =>
    Array.from({ length: n }, () => Math.floor(r() * 10)).join("");

  for (let seed = 1; seed <= 220; seed++) {
    it(`documento ${seed}`, () => {
      const r = mulberry32(seed);
      const first = pick(r, FIRST);
      const last = pick(r, LAST);
      const people = [`${first} ${last}`, `${first.toLowerCase()}.${last.toLowerCase()}@mail.test`];
      const d = digits(r, 11);
      const cpf = `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
      const card = [0, 1, 2, 3].map(() => digits(r, 4));
      const cep = `${digits(r, 5)}-${digits(r, 3)}`;
      const phone = `(${digits(r, 2)}) 9${digits(r, 4)}-${digits(r, 4)}`;
      const email = `${last.toLowerCase()}${seed}@dominio-teste.example`;
      const url = `https://site-${seed}.example/${last}`;
      const cnpj = `${digits(r, 2)}.${digits(r, 3)}.${digits(r, 3)}/0001-${digits(r, 2)}`;
      const forms = [first, first.toUpperCase(), last, last.toUpperCase(), `${first} ${last}`];
      const name = pick(r, forms);
      const doc = [
        `Olá, ${first} ${last}`,
        `Titular: ${first} ${last} CPF ${cpf}`,
        `Endereço Rua ${last} ${digits(r, 3)}, CEP ${cep}`,
        `Limite R$ ${digits(r, 4)},00 Cartão ${card.join(" ")}`,
        `Tel ${phone} ${email}`,
        `12/10 ${pick(r, MERCH)} ${name} ${cpf} ${card.join("-")} 1.234,56`,
        `13 OUT ${pick(r, MERCH)} ${email} ${url} R$ 10,00`,
        `14/10 ${cnpj} ${phone} ${cep} ${first.toUpperCase()}${last} 99,90`,
        `Total ${name} ${card.join(" ")} R$ 1.345,00`,
        `Pagamento recebido ${cpf} -500,00`,
      ].join("\n");
      const payload = buildInvoicePayload(doc, people);
      const forbidden = [
        ...people,
        first,
        last,
        cpf,
        cpf.replace(/\D/g, ""),
        cnpj,
        ...card,
        card.join(" "),
        cep,
        cep.replace("-", ""),
        phone,
        email,
        url,
        "Olá",
        "Titular",
        "Endereço",
        "Limite",
      ];
      expect(() => assertNoIdentifiers(payload, forbidden)).not.toThrow();
      const all = payload.lines.map((l) => fold(l.text)).join("\n");
      // nenhuma sequência ≥ 4 dígitos que não seja valor/data
      const stripped = all
        .replace(/\d{1,2}\/\d{1,2}(?:\/\d{2,4})?/g, "")
        .replace(/-?\d+(?:\.\d{3})*,\d{2}/g, "");
      expect(stripped).not.toMatch(/\d{4}/);
      expect(all).not.toMatch(/@|https?:|\.example/);
      // valores e datas legítimos permanecem
      expect(payload.lines[0]?.text).toContain("12/10");
      expect(all).toContain("1.234,56");
    });
  }
});
