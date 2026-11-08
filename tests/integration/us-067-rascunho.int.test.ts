import { beforeEach, describe, expect, it } from "vitest";
import type { RequestContext } from "@/lib/api/types";
import { buildDraft, type ExtractedDraftItem } from "@/modules/importacao/draft";
import { importKeys } from "@/modules/importacao/import-key";
import { resetDb, testDb } from "../support/db";
import {
  type CardFixture,
  type FamilyFixture,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
} from "../support/factories";

const db = testDb();
const NOW = new Date("2026-10-12T15:00:00Z");
const REF = "2026-10";
const HASH = "a".repeat(64);
let fx: FamilyFixture;
let card: CardFixture;

const ctxOf = (name: string, f = fx): RequestContext => ({
  userId: f.byName[name]?.userId as string,
  email: f.byName[name]?.email as string,
  name,
  image: null,
  clock: { now: () => NOW },
  requestId: "req-067",
  memberId: f.byName[name]?.memberId as string,
  familyId: f.family.id,
  role: f.byName[name]?.role as "ADMIN" | "MEMBER",
});

let n = 0;
const it_ = (o: Partial<ExtractedDraftItem> = {}): ExtractedDraftItem => ({
  idx: n++,
  date: "2026-10-03",
  description: "MERCADO BOM PRECO",
  amountInCents: "10000",
  kind: "PURCHASE",
  installment: null,
  ...o,
});

async function draft(
  items: ExtractedDraftItem[],
  o: { as?: string; cardId?: string; declared?: { totalInCents?: string }; hash?: string } = {},
) {
  const cardId = o.cardId ?? card.id;
  const row = await db.creditCard.findUniqueOrThrow({ where: { id: cardId } });
  return db.$transaction((tx) =>
    buildDraft(tx, ctxOf(o.as ?? "Mariana"), {
      cardId,
      ownerMemberId: row.ownerMemberId,
      invoiceRef: REF,
      source: "CSV",
      fileHash: o.hash ?? HASH,
      declared: o.declared ?? {},
      warnings: [],
      items,
    }),
  );
}
const catId = async (name: string, f = fx) =>
  (await db.category.findFirstOrThrow({ where: { familyId: f.family.id, name } })).id;

beforeEach(async () => {
  await resetDb();
  n = 0;
  fx = await makeFamily();
  card = await makeCard(fx, { name: "Nubank", owner: "Mariana", closingDay: 25, dueDay: 5 });
});

describe("US-067 rascunho: grupos e seleção (AC 1)", () => {
  it("PURCHASE marcado; FEE em Encargos desmarcado; CREDIT e PAYMENT em grupos próprios; pagador = titular", async () => {
    const d = await draft([
      it_(),
      it_({ kind: "FEE", description: "IOF", amountInCents: "250" }),
      it_({ kind: "CREDIT", description: "ESTORNO", amountInCents: "1000" }),
      it_({ kind: "PAYMENT", description: "PAGAMENTO", amountInCents: "5000" }),
    ]);
    expect(d.items.map((i) => [i.group, i.selected])).toEqual([
      ["Compras", true],
      ["Encargos", false],
      ["Estornos e créditos", false],
      ["Pagamento da fatura", false],
    ]);
    expect(d.items.every((i) => i.payerMemberId === fx.byName.Mariana?.memberId)).toBe(true);
    // 100,00 + 2,50 - 10,00; PAYMENT fora
    expect(d.totals).toEqual({ itemsTotal: "9250", selectedTotal: "10000", difference: "0" });
  });
});

describe("US-067 categoria sugerida (AC 2)", () => {
  it("maioria ≥ 50 % por descrição normalizada em 12 meses; sem histórico = Outros", async () => {
    const mk = (description: string, category: string, occurredOn: string) =>
      makeCardPurchase(fx, { card, amountInCents: 1000, occurredOn, category, description });
    await mk("Mercado Bom Preço 123", "Supermercado", "2026-09-10");
    await mk("MERCADO BOM PRECO", "Supermercado", "2026-08-10");
    await mk("mercado bom preco", "Transporte", "2026-07-10");
    await mk("Posto Shell", "Transporte", "2026-09-01");
    await mk("Posto Shell", "Saúde", "2026-09-02");
    await mk("Posto Shell", "Moradia", "2026-09-03"); // 1/3 cada: sem maioria
    await mk("Farmácia Antiga", "Saúde", "2025-09-01"); // fora dos 12 meses
    const d = await draft([
      it_(),
      it_({ description: "Posto Shell" }),
      it_({ description: "Farmácia Antiga" }),
      it_({ description: "Loja Nova" }),
    ]);
    const outros = await catId("Outros");
    expect(d.items.map((i) => i.categoryId)).toEqual([
      await catId("Supermercado"),
      outros,
      outros,
      outros,
    ]);
    expect(d.items.every((i) => i.flags.length === 0)).toBe(true);
  });

  it("parcelas e lançamentos 'Só meu' de outro membro ficam fora do histórico", async () => {
    await makeCardPurchase(fx, {
      card,
      amountInCents: 1000,
      occurredOn: "2026-09-10",
      category: "Saúde",
      description: "Clínica Privada",
      author: "Lucas",
      shared: false,
    });
    const plan = await db.installmentPlan.create({
      data: {
        familyId: fx.family.id,
        cardId: card.id,
        totalInCents: 20000n,
        installmentCount: 2,
        purchaseOn: new Date("2026-09-10T00:00:00Z"),
        description: "Curso Online",
        categoryId: await catId("Educação"),
        payerMemberId: fx.byName.Mariana?.memberId as string,
        authorMemberId: fx.byName.Mariana?.memberId as string,
      },
    });
    const inv = await makeInvoice(fx, card, "2026-09");
    await db.transaction.create({
      data: {
        familyId: fx.family.id,
        kind: "EXPENSE",
        direction: "DEBIT",
        cardId: card.id,
        invoiceId: inv.id,
        categoryId: await catId("Educação"),
        amountInCents: 10000n,
        occurredOn: new Date("2026-09-10T00:00:00Z"),
        description: "Curso Online",
        payerMemberId: fx.byName.Mariana?.memberId as string,
        authorMemberId: fx.byName.Mariana?.memberId as string,
        isSharedExpense: true,
        installmentPlanId: plan.id,
        installmentNo: 1,
        installmentCount: 2,
      },
    });
    const d = await draft([
      it_({ description: "Clínica Privada" }),
      it_({ description: "Curso Online" }),
    ]);
    const outros = await catId("Outros");
    expect(d.items.map((i) => i.categoryId)).toEqual([outros, outros]);
    // o dono do lançamento privado enxerga a própria categoria
    const lucasView = await draft([it_({ description: "Clínica Privada" })], { as: "Lucas" });
    expect(lucasView.items[0]?.categoryId).toBe(await catId("Saúde"));
  });

  it("família sem 'Outros' ativa: NEEDS_ATTENTION, sem categoria e desmarcado", async () => {
    await db.category.updateMany({
      where: { familyId: fx.family.id, name: "Outros" },
      data: { archivedAt: new Date() },
    });
    const d = await draft([it_({ description: "Loja Nova" })]);
    expect(d.items[0]).toMatchObject({
      categoryId: null,
      flags: ["NEEDS_ATTENTION"],
      selected: false,
    });
  });
});

describe("US-067 duplicados (AC 3, 4, 5)", () => {
  const importedRow = async (o: {
    key?: string;
    description: string;
    amount: number;
    on: string;
  }) => {
    const p = await makeCardPurchase(fx, {
      card,
      amountInCents: o.amount,
      occurredOn: o.on,
      description: o.description,
    });
    if (o.key) await db.transaction.update({ where: { id: p.id }, data: { importKey: o.key } });
    return p;
  };

  it("mesmo importKey ativo = ALREADY_IMPORTED (não selecionável); excluído não conta", async () => {
    const item = it_();
    const [key] = importKeys(card.id, REF, [item]);
    const p = await importedRow({
      key: key as string,
      description: "X",
      amount: 1,
      on: "2026-10-01",
    });
    const d1 = await draft([item]);
    expect(d1.items[0]).toMatchObject({ flags: ["ALREADY_IMPORTED"], selected: false });
    await db.transaction.update({
      where: { id: p.id },
      data: {
        deletedAt: new Date(),
        deletionReason: "DELETED",
        deletedByMemberId: p.authorMemberId,
      },
    });
    expect((await draft([item])).items[0]?.flags).toEqual([]);
  });

  it("parcela 4/10 já materializada no mesmo cartão e fatura, mesmo valor = ALREADY_POSTED_PARCEL", async () => {
    const inv = await makeInvoice(fx, card, REF);
    const me = fx.byName.Mariana?.memberId as string;
    const plan = await db.installmentPlan.create({
      data: {
        familyId: fx.family.id,
        cardId: card.id,
        totalInCents: 100000n,
        installmentCount: 10,
        purchaseOn: new Date("2026-07-05T00:00:00Z"),
        paidBeforeAppCount: 3,
        description: "Geladeira",
        categoryId: await catId("Moradia"),
        payerMemberId: me,
        authorMemberId: me,
      },
    });
    await db.transaction.create({
      data: {
        familyId: fx.family.id,
        kind: "EXPENSE",
        direction: "DEBIT",
        cardId: card.id,
        invoiceId: inv.id,
        categoryId: await catId("Moradia"),
        amountInCents: 10000n,
        occurredOn: new Date("2026-10-05T00:00:00Z"),
        description: "Geladeira",
        payerMemberId: me,
        authorMemberId: me,
        isSharedExpense: true,
        installmentPlanId: plan.id,
        installmentNo: 4,
        installmentCount: 10,
      },
    });
    const inst = { no: 4, count: 10 };
    const d = await draft([
      it_({ description: "GELADEIRA 04/10", installment: inst }),
      it_({
        description: "GELADEIRA 04/10",
        amountInCents: "10001",
        installment: inst,
        date: "2026-09-01",
      }),
      it_({
        description: "GELADEIRA 05/10",
        installment: { no: 5, count: 10 },
        date: "2026-09-01",
      }),
    ]);
    expect(d.items.map((i) => i.flags)).toEqual([["ALREADY_POSTED_PARCEL"], [], []]);
    expect(d.items[0]?.selected).toBe(false);
  });

  it("POSSIBLE_DUPLICATE: mesmo cartão, valor, ±3 dias, descrição igual/contida; desmarcado, com duplicateOf", async () => {
    const a = await importedRow({
      description: "Mercado Bom Preço Filial",
      amount: 10000,
      on: "2026-10-05",
    });
    const d = await draft([
      it_(), // 03/10 vs 05/10: ±3, descrição contida
      it_({ date: "2026-10-08" }), // 3 dias
      it_({ date: "2026-10-09" }), // 4 dias: não
      it_({ amountInCents: "10001" }), // valor diferente: não
      it_({ description: "OUTRA LOJA" }), // descrição diferente: não
    ]);
    expect(d.items.map((i) => i.flags)).toEqual([
      ["POSSIBLE_DUPLICATE"],
      ["POSSIBLE_DUPLICATE"],
      [],
      [],
      [],
    ]);
    expect(d.items[0]).toMatchObject({ selected: false, duplicateOf: a.id });
    expect(d.items[2]?.selected).toBe(true);
  });

  it("outro cartão, outra família e lançamento excluído nunca casam", async () => {
    const other = await makeCard(fx, { name: "Itaú", owner: "Mariana" });
    await makeCardPurchase(fx, {
      card: other,
      amountInCents: 10000,
      occurredOn: "2026-10-03",
      description: "MERCADO BOM PRECO",
    });
    await makeCardPurchase(fx, {
      card,
      amountInCents: 10000,
      occurredOn: "2026-10-03",
      description: "MERCADO BOM PRECO",
      deleted: true,
    });
    const fx2 = await makeFamily({
      members: [{ email: "outra@exemplo.com", name: "Outra Pessoa", role: "ADMIN" }],
    });
    const card2 = await makeCard(fx2, { name: "Nubank", closingDay: 25 });
    await makeCardPurchase(fx2, {
      card: card2,
      amountInCents: 10000,
      occurredOn: "2026-10-03",
      description: "MERCADO BOM PRECO",
    });
    expect((await draft([it_()])).items[0]?.flags).toEqual([]);
  });

  it("dois itens idênticos no mesmo arquivo: chaves diferentes e nenhum é duplicado do outro", async () => {
    const items = [it_(), it_()];
    const keys = importKeys(card.id, REF, items);
    expect(keys[0]).not.toBe(keys[1]);
    const d = await draft(items);
    expect(d.items.map((i) => [i.flags, i.selected])).toEqual([
      [[], true],
      [[], true],
    ]);
    // só a primeira já importada: a segunda continua livre
    await importedRow({ key: keys[0] as string, description: "Y", amount: 1, on: "2026-10-01" });
    const d2 = await draft(items);
    expect(d2.items.map((i) => i.flags)).toEqual([["ALREADY_IMPORTED"], []]);
  });
});

describe("US-067 lote ativo e conferência de total (AC 6, 7)", () => {
  const batch = async (o: { revertedAt?: Date } = {}) => {
    const inv = await makeInvoice(fx, card, REF);
    return db.importBatch.create({
      data: {
        familyId: fx.family.id,
        cardId: card.id,
        invoiceId: inv.id,
        fileHash: HASH,
        source: "CSV",
        itemCount: 1,
        totalInCents: 100n,
        importedByMemberId: fx.byName.Mariana?.memberId as string,
        importedAt: new Date("2026-10-10T12:00:00Z"),
        ...(o.revertedAt
          ? { revertedAt: o.revertedAt, revertedByMemberId: fx.byName.Mariana?.memberId as string }
          : {}),
      },
    });
  };

  it("lote ativo do mesmo fileHash: alreadyImportedAt e nada selecionável; revertido libera", async () => {
    const b = await batch();
    const d = await draft([it_(), it_({ description: "OUTRA" })]);
    expect(d.alreadyImportedAt).toBe("2026-10-10T12:00:00.000Z");
    expect(d.items.every((i) => !i.selected)).toBe(true);
    expect(d.warnings.map((w) => w.code)).toContain("FILE_ALREADY_IMPORTED");
    expect(d.warnings.find((w) => w.code === "FILE_ALREADY_IMPORTED")?.message).toBe(
      "Este arquivo já foi importado em 10/10.",
    );
    await db.importBatch.update({
      where: { id: b.id },
      data: { revertedAt: NOW, revertedByMemberId: b.importedByMemberId },
    });
    const free = await draft([it_()]);
    expect(free.alreadyImportedAt).toBeUndefined();
    expect(free.items[0]?.selected).toBe(true);
    // outro cartão com o mesmo hash não é afetado
    const other = await makeCard(fx, { name: "Itaú", owner: "Mariana" });
    await db.importBatch.update({
      where: { id: b.id },
      data: { revertedAt: null, revertedByMemberId: null },
    });
    expect((await draft([it_()], { cardId: other.id })).alreadyImportedAt).toBeUndefined();
  });

  it("total declarado diferente => TOTAL_MISMATCH com diferença com sinal; igual => sem aviso", async () => {
    const items = [it_(), it_({ kind: "CREDIT", amountInCents: "1000", description: "ESTORNO" })];
    const bad = await draft(items, { declared: { totalInCents: "8000" } });
    expect(bad.totals.difference).toBe("-1000");
    expect(bad.warnings.map((w) => w.code)).toContain("TOTAL_MISMATCH");
    const ok = await draft(items, { declared: { totalInCents: "9000" } });
    expect(ok.totals.difference).toBe("0");
    expect(ok.warnings).toEqual([]);
    expect((await draft(items)).warnings).toEqual([]);
  });
});

describe("US-067 índices únicos parciais da migração (AC 8)", () => {
  it("um lote ativo por (família, cartão, fileHash) e um lançamento ativo por (família, importKey)", async () => {
    const inv = await makeInvoice(fx, card, REF);
    const base = {
      familyId: fx.family.id,
      cardId: card.id,
      invoiceId: inv.id,
      fileHash: HASH,
      source: "PDF" as const,
      itemCount: 1,
      totalInCents: 1n,
      importedByMemberId: fx.byName.Mariana?.memberId as string,
    };
    const first = await db.importBatch.create({ data: base });
    await expect(db.importBatch.create({ data: base })).rejects.toThrow();
    await db.importBatch.update({
      where: { id: first.id },
      data: { revertedAt: NOW, revertedByMemberId: base.importedByMemberId },
    });
    await expect(db.importBatch.create({ data: base })).resolves.toBeTruthy();

    const a = await makeCardPurchase(fx, { card, amountInCents: 100, occurredOn: "2026-10-01" });
    const b = await makeCardPurchase(fx, { card, amountInCents: 100, occurredOn: "2026-10-01" });
    await db.transaction.update({
      where: { id: a.id },
      data: { importKey: "k1", origin: "INVOICE_IMPORT" },
    });
    await expect(
      db.transaction.update({ where: { id: b.id }, data: { importKey: "k1" } }),
    ).rejects.toThrow();
  });
});
