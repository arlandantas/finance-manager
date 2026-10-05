import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { suggestSourceAccount } from "@/modules/contas/suggest-source";
import { call } from "../support/call";
import { resetDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
} from "../support/factories";

const NOW = "2026-10-04T15:00:00Z"; // hoje = 2026-10-04; 90 dias atrás = 2026-07-06
let fx: FamilyFixture;
let dinheiro: AccountFixture;
let itauL: AccountFixture;
let itauM: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;

const spend = (account: AccountFixture, author: "Mariana" | "Lucas", occurredOn: string, n = 1) =>
  Promise.all(
    Array.from({ length: n }, () =>
      makeTransaction(fx, {
        account,
        category: "Supermercado",
        amountInCents: 100,
        occurredOn,
        author,
        payer: author,
        shared: false,
      }),
    ),
  );

type Row = { id: string; usageCountByMe: number; balanceInCents: number; owner: { id: string } };
const list = async () => {
  const res = await withClock(NOW, () => call(lucas(), "GET", "/api/v1/accounts"));
  expect(res.status).toBe(200);
  return res.body.items as Row[];
};

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  dinheiro = await makeAccount(fx, {
    name: "Dinheiro",
    owner: "Lucas",
    openingBalanceInCents: 9000,
  });
  itauL = await makeAccount(fx, {
    name: "Itaú Lucas",
    owner: "Lucas",
    openingBalanceInCents: 300000,
  });
  itauM = await makeAccount(fx, {
    name: "Itaú Mariana",
    owner: "Mariana",
    openingBalanceInCents: 650000,
  });
});

describe("US-023 usageCountByMe e sugestão sobre os dados do servidor", () => {
  it("conta só lançamentos do membro logado nos últimos 90 dias", async () => {
    await spend(itauL, "Lucas", "2026-10-01", 5);
    await spend(itauL, "Lucas", "2026-07-06", 1); // limite: 90 dias atrás conta
    await spend(itauL, "Lucas", "2026-07-05", 1); // 91 dias: não conta
    await spend(itauL, "Mariana", "2026-10-01", 3); // outro membro: não conta
    await spend(itauM, "Lucas", "2026-09-01", 2);
    const rows = await list();
    const by = (id: string) => rows.find((r) => r.id === id) as Row;
    expect(by(itauL.id).usageCountByMe).toBe(6);
    expect(by(itauM.id).usageCountByMe).toBe(2);
    expect(by(dinheiro.id).usageCountByMe).toBe(0);
  });

  it("exclui lançamentos apagados e não conta a abertura", async () => {
    await makeTransaction(fx, {
      account: dinheiro,
      category: "Supermercado",
      amountInCents: 100,
      occurredOn: "2026-10-01",
      author: "Lucas",
      deleted: true,
    });
    expect((await list()).find((r) => r.id === dinheiro.id)?.usageCountByMe).toBe(0);
  });

  it("A1 com dados reais: titular com saldo suficiente => Itaú Lucas, mesmo usando mais o Dinheiro", async () => {
    await spend(dinheiro, "Lucas", "2026-10-01", 9);
    const rows = await list();
    const lucasId = fx.byName.Lucas?.memberId as string;
    const s = suggestSourceAccount({
      amountInCents: 47900,
      ownerMemberId: lucasId,
      accounts: rows.map((r) => ({
        id: r.id,
        ownerMemberId: r.owner.id,
        balanceInCents: r.balanceInCents,
        archived: false,
        usageCountByMe: r.usageCountByMe,
      })),
    });
    expect(s).toEqual({ accountId: itauL.id, reason: "OWNER_ENOUGH", sufficient: true });
  });

  it("regressão: defaults do lançamento de despesa continuam com a última conta usada", async () => {
    await spend(dinheiro, "Lucas", "2026-10-02", 1);
    const res = await withClock(NOW, () => call(lucas(), "GET", "/api/v1/transactions/defaults"));
    expect(res.status).toBe(200);
    expect(res.body.accountId).toBe(dinheiro.id);
  });
});
