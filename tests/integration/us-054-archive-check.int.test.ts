import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb } from "../support/db";
import {
  type AccountFixture,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
} from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

const NOW = "2026-10-12T15:00:00Z"; // fechamento dia 25: fatura aberta = out
let fx: FamilyFixture;
let acc: AccountFixture;
let card: CardFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const check = (kind: "cards" | "accounts", id: string, as = mariana()) =>
  at(() => call(as, "GET", `/api/v1/${kind}/${id}/archive-check`));

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 0 });
  card = await makeCard(fx, { name: "Nubank Lucas", owner: "Lucas", closingDay: 25, dueDay: 5 });
});

describe("US-054 archive-check", () => {
  it("cartão sem impedimentos => lista vazia", async () => {
    const r = await check("cards", card.id);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ blockers: [] });
  });

  it("fatura fechada não paga => CARD_HAS_UNPAID_INVOICE com valor e ref", async () => {
    await makeCardPurchase(fx, {
      card,
      amountInCents: 47900,
      occurredOn: "2026-09-10",
      author: "Lucas",
    });
    const r = await check("cards", card.id);
    expect(r.body.blockers).toEqual([
      {
        code: "CARD_HAS_UNPAID_INVOICE",
        message: "Pague a fatura antes de arquivar o cartão",
        amountInCents: 47900,
        ref: "2026-09",
      },
    ]);
  });

  it("fatura aberta com compras => CARD_HAS_OPEN_PURCHASES", async () => {
    await makeCardPurchase(fx, {
      card,
      amountInCents: 9000,
      occurredOn: "2026-10-05",
      author: "Lucas",
    });
    const r = await check("cards", card.id);
    expect(r.body.blockers).toMatchObject([
      { code: "CARD_HAS_OPEN_PURCHASES", amountInCents: 9000 },
    ]);
  });

  it("parcelas futuras => CARD_HAS_FUTURE_INSTALLMENTS junto da fatura aberta, na mesma ordem do archive", async () => {
    await makeInstallmentPurchase(fx, { card, total: 80000, count: 4, purchaseOn: "2026-10-05" });
    const r = await check("cards", card.id);
    const codes = r.body.blockers.map((b: { code: string }) => b.code);
    expect(codes).toEqual(["CARD_HAS_OPEN_PURCHASES", "CARD_HAS_FUTURE_INSTALLMENTS"]);
    expect(r.body.blockers[1].amountInCents).toBe(60000);
    const a = await at(() =>
      call(mariana(), "POST", `/api/v1/cards/${card.id}/archive`, { version: 1 }),
    );
    expect(a.body.error.code).toBe(codes[0]);
  });

  it("conta: saldo zero => vazio; saldo diferente de zero => ACCOUNT_BALANCE_NOT_ZERO", async () => {
    expect((await check("accounts", acc.id)).body).toEqual({ blockers: [] });
    const full = await makeAccount(fx, {
      name: "Poupança",
      owner: "Mariana",
      openingBalanceInCents: 30000,
    });
    const r = await check("accounts", full.id);
    expect(r.status).toBe(200);
    expect(r.body.blockers).toMatchObject([
      { code: "ACCOUNT_BALANCE_NOT_ZERO", amountInCents: 30000 },
    ]);
    expect(r.body.blockers[0].message).toContain("Para arquivar, o saldo precisa ser zero");
  });

  it("outra família => 404 (cartão e conta); id inválido => 404", async () => {
    const other = await makeFamily({ uniqueEmails: true, name: "Souza" });
    const as = other.members[0]?.as ?? null;
    expect((await check("cards", card.id, as)).status).toBe(404);
    expect((await check("accounts", acc.id, as)).status).toBe(404);
    expect((await check("cards", "xyz")).status).toBe(404);
  });
});
