import { describe, expect, it } from "vitest";
import {
  anchorFor,
  draftTotal,
  mapItem,
  type PlanContext,
  refsOf,
} from "@/modules/importacao/confirm-map";
import type { ConfirmItem } from "@/modules/importacao/confirm-schema";
import { ConfirmImportBodySchema } from "@/modules/importacao/confirm-schema";

const UUID = "00000000-0000-4000-8000-000000000001";
// fatura alvo 2026-10 (fechamento dia 25), hoje 12/10: ainda aberta
const CTX: PlanContext = {
  closingDay: 25,
  dueDay: 5,
  invoiceRef: "2026-10",
  closingDate: "2026-10-25",
  today: "2026-10-12",
};
const item = (o: Partial<ConfirmItem> = {}): ConfirmItem => ({
  idx: 0,
  occurrence: 1,
  date: "2026-10-03",
  description: "Loja",
  amountInCents: "10000",
  kind: "PURCHASE",
  installment: null,
  categoryId: UUID,
  payerMemberId: UUID,
  ...o,
});

describe("US-068 mapeamento item -> lançamento", () => {
  it("à vista grava o valor em centavos (BigInt) sem plano", () => {
    const d = mapItem(item(), "k", CTX);
    expect(d).toMatchObject({ kind: "SINGLE", amountInCents: 10000n });
    expect(draftTotal(d)).toBe(10000n);
  });

  it("parcela 3/10: plano de valor × 10, paidBeforeApp 2, parcelas 3..10 em faturas crescentes", () => {
    const d = mapItem(item({ installment: { no: 3, count: 10 } }), "k", CTX);
    if (d.kind !== "PLAN") throw new Error("esperava plano");
    expect(d.totalInCents).toBe(100000n);
    expect(d.paidBeforeApp).toBe(2);
    expect(d.parcels.map((p) => p.no)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(d.parcels.every((p) => p.amountInCents === 10000)).toBe(true);
    expect(d.parcels[0]?.invoiceRef).toBe("2026-10");
    expect(d.parcels[7]?.invoiceRef).toBe("2027-05");
    expect(draftTotal(d)).toBe(80000n); // valor × (N − n + 1)
    expect(refsOf([d], "2026-10")).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
    ]);
  });

  it("âncora: data + (n-1) meses se cair no ciclo e não for futura; senão fim do ciclo (≤ hoje)", () => {
    // 03/08 + 2 meses = 03/10: dentro do ciclo 26/09..25/10 e já passou
    expect(anchorFor("2026-08-03", 3, CTX)).toBe("2026-10-03");
    // 20/08 + 2 = 20/10: dentro do ciclo, mas ainda no futuro (hoje 12/10): usa hoje
    expect(anchorFor("2026-08-20", 3, CTX)).toBe("2026-10-12");
    // 15/07 + 2 = 15/09: fora do ciclo da fatura alvo: usa hoje (fatura aberta)
    expect(anchorFor("2026-07-15", 3, CTX)).toBe("2026-10-12");
    // fatura alvo já fechada: último dia do ciclo
    const closed = { ...CTX, invoiceRef: "2026-09", closingDate: "2026-09-25" };
    expect(anchorFor("2026-06-10", 3, closed)).toBe("2026-09-25");
  });
});

describe("US-068 ConfirmImportBody", () => {
  const body = (items: unknown[], extra: object = {}) => ({
    importToken: "t",
    invoiceRef: "2026-10",
    items,
    ...extra,
  });
  const raw = (o: object = {}) => ({ ...item(), ...o });
  it("aceita o corpo válido e rejeita campo extra, valor ≤ 0, idx repetido, descrição curta e parcela inválida", () => {
    expect(ConfirmImportBodySchema.safeParse(body([raw()])).success).toBe(true);
    expect(ConfirmImportBodySchema.safeParse(body([raw()], { familyId: UUID })).success).toBe(
      false,
    );
    expect(ConfirmImportBodySchema.safeParse(body([raw({ importKey: "x" })])).success).toBe(false);
    expect(ConfirmImportBodySchema.safeParse(body([raw({ amountInCents: "0" })])).success).toBe(
      false,
    );
    expect(ConfirmImportBodySchema.safeParse(body([raw({ amountInCents: "-5" })])).success).toBe(
      false,
    );
    expect(ConfirmImportBodySchema.safeParse(body([raw(), raw()])).success).toBe(false);
    expect(ConfirmImportBodySchema.safeParse(body([raw({ description: "a" })])).success).toBe(
      false,
    );
    expect(ConfirmImportBodySchema.safeParse(body([raw({ kind: "CREDIT" })])).success).toBe(false);
    expect(
      ConfirmImportBodySchema.safeParse(body([raw({ installment: { no: 11, count: 10 } })]))
        .success,
    ).toBe(false);
    expect(
      ConfirmImportBodySchema.safeParse(body([raw({ installment: { no: 1, count: 25 } })])).success,
    ).toBe(false);
    expect(ConfirmImportBodySchema.safeParse(body([])).success).toBe(false);
  });
});

describe("US-068 ocorrência no arquivo", () => {
  it("occurrences conta entre idênticos do arquivo inteiro; a chave depende dela, não do subconjunto confirmado", async () => {
    const { occurrences, importKey } = await import("@/modules/importacao/import-key");
    const a = { date: "2026-10-03", amountInCents: "100", description: "Loja", installment: null };
    expect(occurrences([a, { ...a, description: "Outra" }, a])).toEqual([1, 1, 2]);
    expect(importKey("c", "2026-10", a, 2)).not.toBe(importKey("c", "2026-10", a, 1));
  });
  it("corpo exige occurrence ≥ 1", () => {
    const b = (o: object) => ({
      importToken: "t",
      invoiceRef: "2026-10",
      items: [{ ...item(), ...o }],
    });
    expect(ConfirmImportBodySchema.safeParse(b({})).success).toBe(true);
    expect(ConfirmImportBodySchema.safeParse(b({ occurrence: 0 })).success).toBe(false);
    expect(ConfirmImportBodySchema.safeParse(b({ occurrence: undefined })).success).toBe(false);
  });
});
