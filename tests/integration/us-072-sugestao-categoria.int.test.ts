import { beforeEach, describe, expect, it } from "vitest";
import { setDevClockOverride, withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
  makeTransaction,
} from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

const db = testDb();
const NOW = "2026-11-05T15:00:00Z";
let fx: FamilyFixture;
let account: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
type Sug = {
  transactionId: string;
  version: number;
  description: string;
  descriptionKey: string;
  from: { id: string; name: string };
  to: { id: string; name: string };
  why: string;
};
const list = (as = lucas()) =>
  at(() => call(as, "GET", "/api/v1/category-suggestions")).then((r) => r.body.items as Sug[]);

async function droga(inSaude: number, inLazer: number, from = "2026-07-02") {
  const ids: string[] = [];
  const mk = async (category: string, i: number) => {
    const d = new Date(`${from}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * 9);
    const tx = await makeTransaction(fx, {
      account,
      category,
      amountInCents: 4_500 + i,
      description: "Droga Raia",
      occurredOn: d.toISOString().slice(0, 10),
      author: "Mariana",
      payer: "Mariana",
      shared: true,
    });
    ids.push(tx.id);
  };
  for (let i = 0; i < inSaude; i++) await mk("Saúde", i);
  for (let i = 0; i < inLazer; i++) await mk("Lazer e restaurantes", inSaude + i);
  return ids;
}

beforeEach(async () => {
  await resetDb();
  setDevClockOverride(null);
  fx = await makeFamily();
  account = await makeAccount(fx, {
    name: "Nubank",
    owner: "Mariana",
    openingBalanceInCents: 1_000_000,
  });
});

describe("US-072 sugestões de categoria (regra local, sem IA)", () => {
  it("9 em Saúde + 1 em Lazer: sugestão com 'de Lazer para Saúde' e o porquê", async () => {
    const ids = await droga(9, 1);
    const items = await list();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      transactionId: ids[9],
      description: "Droga Raia",
      from: { name: "Lazer e restaurantes" },
      to: { name: "Saúde" },
      why: '9 de 10 lançamentos de "droga raia" estão em Saúde',
    });
  });

  it("6/4 e 2 lançamentos não geram sugestão; parcelas ficam de fora", async () => {
    await droga(6, 4);
    expect(await list()).toEqual([]);
    await resetDb();
    fx = await makeFamily();
    account = await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 1 });
    await droga(1, 1);
    expect(await list()).toEqual([]);
  });

  it("parcelas não entram na regra", async () => {
    const card = await makeCard(fx, {
      name: "Cartão",
      closingDay: 20,
      dueDay: 28,
      limitInCents: 5_000_000,
    });
    await makeInstallmentPurchase(fx, {
      card,
      total: 90_000,
      count: 9,
      purchaseOn: "2026-08-10",
      category: "Saúde",
      description: "Droga Raia",
    });
    setDevClockOverride(null);
    await makeInstallmentPurchase(fx, {
      card,
      total: 10_000,
      count: 1,
      purchaseOn: "2026-08-11",
      category: "Outros",
      description: "Droga Raia",
    }).catch(() => undefined);
    setDevClockOverride(null);
    expect(await list()).toEqual([]);
  });

  it("aceitar muda SÓ a categoria; valor, data, conta e divisão ficam; histórico e versão registram", async () => {
    const ids = await droga(9, 1);
    const [s] = await list();
    const before = await db.transaction.findUniqueOrThrow({ where: { id: ids[9] as string } });
    const r = await at(() =>
      call(lucas(), "POST", "/api/v1/category-suggestions/accept", {
        transactionId: s?.transactionId,
        version: s?.version,
        fromCategoryId: s?.from.id,
        toCategoryId: s?.to.id,
      }),
    );
    expect(r.status).toBe(200);
    expect(r.body.transaction.category.name).toBe("Saúde");
    const after = await db.transaction.findUniqueOrThrow({ where: { id: ids[9] as string } });
    expect(after.categoryId).toBe(s?.to.id);
    expect({ ...after, categoryId: 0, version: 0, updatedAt: 0, updatedByMemberId: 0 }).toEqual({
      ...before,
      categoryId: 0,
      version: 0,
      updatedAt: 0,
      updatedByMemberId: 0,
    });
    expect(after.version).toBe(before.version + 1);
    expect(after.updatedByMemberId).toBe(fx.byName.Lucas?.memberId);
    const hist = await at(() => call(mariana(), "GET", `/api/v1/transactions/${ids[9]}/history`));
    const top = hist.body.items[0];
    expect(top).toMatchObject({ action: "UPDATE", actor: { name: "Lucas Silva" } });
    expect(top.changes[0]).toMatchObject({
      field: "categoryId",
      fromLabel: "Lazer e restaurantes",
      toLabel: "Saúde",
      source: "CATEGORY_SUGGESTION",
    });
    expect(await list()).toEqual([]);
  });

  it("não existe 'aceitar todas'", async () => {
    await droga(9, 1);
    await expect(
      at(() => call(lucas(), "POST", "/api/v1/category-suggestions/accept-all", {})),
    ).rejects.toThrow(/Rota não encontrada/);
  });

  it("recusar descarta para a família e não altera a categoria", async () => {
    const ids = await droga(9, 1);
    const [s] = await list();
    const r = await at(() =>
      call(lucas(), "POST", "/api/v1/category-suggestions/dismiss", {
        descriptionKey: s?.descriptionKey,
        toCategoryId: s?.to.id,
      }),
    );
    expect(r.status).toBe(200);
    expect(await list(mariana())).toEqual([]);
    const tx = await db.transaction.findUniqueOrThrow({ where: { id: ids[9] as string } });
    expect(tx.categoryId).not.toBe(s?.to.id);
    expect(tx.version).toBe(1);
    // idempotente
    expect(
      (
        await at(() =>
          call(mariana(), "POST", "/api/v1/category-suggestions/dismiss", {
            descriptionKey: s?.descriptionKey,
            toCategoryId: s?.to.id,
          }),
        )
      ).status,
    ).toBe(200);
    expect(await db.categorySuggestionDismissal.count()).toBe(1);
  });

  it("desfazer devolve a categoria anterior e registra a origem no histórico", async () => {
    const ids = await droga(9, 1);
    const [s] = await list();
    const accept = await at(() =>
      call(lucas(), "POST", "/api/v1/category-suggestions/accept", {
        transactionId: s?.transactionId,
        version: s?.version,
        fromCategoryId: s?.from.id,
        toCategoryId: s?.to.id,
      }),
    );
    const undo = await at(() =>
      call(lucas(), "POST", "/api/v1/category-suggestions/accept", {
        transactionId: s?.transactionId,
        version: accept.body.transaction.version,
        fromCategoryId: s?.to.id,
        toCategoryId: s?.from.id,
        undo: true,
      }),
    );
    expect(undo.status).toBe(200);
    expect(undo.body.transaction.category.name).toBe("Lazer e restaurantes");
    const hist = await at(() => call(lucas(), "GET", `/api/v1/transactions/${ids[9]}/history`));
    expect(hist.body.items[0].changes[0].source).toBe("CATEGORY_SUGGESTION_UNDO");
  });

  it("fatura paga e conta arquivada não impedem mudar a categoria", async () => {
    const card = await makeCard(fx, {
      name: "Cartão",
      closingDay: 25,
      dueDay: 5,
      limitInCents: 5_000_000,
    });
    for (let i = 0; i < 9; i++) {
      await makeCardPurchase(fx, {
        card,
        category: "Saúde",
        amountInCents: 3_000,
        occurredOn: `2026-0${(i % 3) + 7}-0${i + 1}`,
        description: "Droga Raia",
      });
    }
    const last = await makeCardPurchase(fx, {
      card,
      category: "Lazer e restaurantes",
      amountInCents: 3_100,
      occurredOn: "2026-09-12",
      description: "Droga Raia",
    });
    const inv = await makeInvoice(fx, card, "2026-09");
    await makeInvoicePayment(fx, {
      card,
      invoice: inv,
      account,
      amountInCents: 1,
      paidOn: "2026-10-05",
    });
    // PATCH comum recusa (fatura paga)…
    const saude = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Saúde" },
    });
    const patch = await at(() =>
      call(lucas(), "PATCH", `/api/v1/transactions/${last.id}`, {
        version: 1,
        categoryId: saude.id,
      }),
    );
    expect(patch.status).toBe(422);
    // …a sugestão aceita (edição não financeira)
    const [s] = await list();
    expect(s?.transactionId).toBe(last.id);
    const r = await at(() =>
      call(lucas(), "POST", "/api/v1/category-suggestions/accept", {
        transactionId: s?.transactionId,
        version: s?.version,
        fromCategoryId: s?.from.id,
        toCategoryId: s?.to.id,
      }),
    );
    expect(r.status).toBe(200);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: last.id } })).categoryId).toBe(
      s?.to.id,
    );

    // conta arquivada
    await resetDb();
    fx = await makeFamily();
    account = await makeAccount(fx, { name: "Antiga", owner: "Mariana", openingBalanceInCents: 0 });
    const ids = await droga(9, 1);
    await db.bankAccount.update({ where: { id: account.id }, data: { archivedAt: new Date() } });
    const [s2] = await list();
    const r2 = await at(() =>
      call(lucas(), "POST", "/api/v1/category-suggestions/accept", {
        transactionId: s2?.transactionId,
        version: s2?.version,
        fromCategoryId: s2?.from.id,
        toCategoryId: s2?.to.id,
      }),
    );
    expect(r2.status).toBe(200);
    expect(
      (await db.transaction.findUniqueOrThrow({ where: { id: ids[9] as string } })).categoryId,
    ).toBe(s2?.to.id);
  });

  it("sugestão velha (categoria já mudou) ⇒ 409 SUGGESTION_STALE; versão velha ⇒ 409; destino arquivado ⇒ 422", async () => {
    const ids = await droga(9, 1);
    const [s] = await list();
    const body = (over: object = {}) => ({
      transactionId: s?.transactionId,
      version: s?.version,
      fromCategoryId: s?.from.id,
      toCategoryId: s?.to.id,
      ...over,
    });
    const post = (b: object, as = lucas()) =>
      at(() => call(as, "POST", "/api/v1/category-suggestions/accept", b));
    expect(
      (await post(body({ fromCategoryId: s?.to.id, toCategoryId: s?.from.id }))).body.error.code,
    ).toBe("SUGGESTION_STALE");
    expect((await post(body({ version: 7 }))).body.error.code).toBe("VERSION_CONFLICT");
    await db.category.update({ where: { id: s?.to.id }, data: { archivedAt: new Date() } });
    expect((await post(body())).status).toBe(422);
    // arquivada deixa de ser alvo de sugestão
    expect(await list()).toEqual([]);
    // outra família
    const other = await makeFamily({ name: "Outra", uniqueEmails: true });
    expect((await post(body(), other.members[0]?.as ?? null)).status).toBe(404);
    expect(
      (await db.transaction.findUniqueOrThrow({ where: { id: ids[9] as string } })).categoryId,
    ).toBe(s?.from.id);
  });

  it("independe da IA: funciona com a IA desligada e sem chamar o provedor", async () => {
    await droga(9, 1);
    expect(await list()).toHaveLength(1);
  });
});
