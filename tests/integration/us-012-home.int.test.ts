import { beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { getDb } from "@/lib/db";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
  makeTransfer,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const home = (as = mariana(), qs = "") =>
  withClock(NOW, () => call(as, "GET", `/api/v1/home${qs}`));
let n = 0;
const t = () => new Date(Date.UTC(2026, 9, 1, 12, 0, ++n));

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  n = 0;
  fx = await makeFamily();
});

async function twoAccounts(): Promise<{ itau: AccountFixture; nubank: AccountFixture }> {
  const itau = await makeAccount(fx, {
    name: "Itaú Mariana",
    owner: "Mariana",
    openingBalanceInCents: 650000,
  });
  const nubank = await makeAccount(fx, {
    name: "Nubank Conjunta",
    owner: "Mariana",
    openingBalanceInCents: 84950,
  });
  return { itau, nubank };
}

describe("US-012 Home da família", () => {
  it("Home com dados: saldo da família, contas, acerto e 5 recentes", async () => {
    const { itau, nubank } = await twoAccounts();
    for (let i = 0; i < 7; i++) {
      await makeTransaction(fx, {
        account: nubank,
        category: "Supermercado",
        amountInCents: 100 + i,
        occurredOn: `2026-10-0${1 + (i % 4)}`,
        createdAt: t(),
      });
    }
    const res = await home();
    expect(res.status).toBe(200);
    expect(res.body.familyBalanceInCents).toBe(
      650000 + 84950 - (100 + 101 + 102 + 103 + 104 + 105 + 106),
    );
    expect(res.body.accounts.map((a: { name: string }) => a.name)).toEqual([
      "Itaú Mariana",
      "Nubank Conjunta",
    ]);
    expect(res.body.settlement).toMatchObject({
      period: { key: "2026-10" },
      status: expect.any(String),
      rule: { kind: "EQUAL" },
    });
    expect(res.body.recent).toHaveLength(5);
    expect(res.body.recent[0].occurredOn >= res.body.recent[4].occurredOn).toBe(true);
    expect(res.body.period).toEqual({ key: "2026-10", start: "2026-10-01", end: "2026-10-31" });
    expect(res.body.memberCount).toBe(2);
    expect(itau.id).toBeDefined();
  });

  it("Resumo do mês exclui transferências e acertos", async () => {
    const { itau, nubank } = await twoAccounts();
    await makeTransaction(fx, {
      account: itau,
      type: "INCOME",
      category: "Salário",
      amountInCents: 500000,
      occurredOn: "2026-10-02",
      createdAt: t(),
    });
    await makeTransaction(fx, {
      account: nubank,
      category: "Moradia",
      amountInCents: 120000,
      occurredOn: "2026-10-03",
      createdAt: t(),
    });
    await makeTransfer(fx, {
      from: itau,
      to: nubank,
      amountInCents: 100000,
      occurredOn: "2026-10-03",
    });
    await makeTransfer(fx, {
      from: itau,
      to: nubank,
      amountInCents: 5000,
      occurredOn: "2026-10-03",
      kind: "SETTLEMENT",
    });
    const res = await home();
    expect(res.body.monthSummary).toMatchObject({ incomeInCents: 500000, expenseInCents: 120000 });
  });

  it("Participação por membro: 75% e 25% (inclui despesas pessoais); total 0 => 0", async () => {
    const { nubank } = await twoAccounts();
    expect(
      (await home()).body.monthSummary.byMember.map(
        (m: { sharePercent: number }) => m.sharePercent,
      ),
    ).toEqual([0, 0]);
    await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 60000,
      occurredOn: "2026-10-02",
      payer: "Mariana",
      createdAt: t(),
    });
    await makeTransaction(fx, {
      account: nubank,
      category: "Lazer e restaurantes",
      amountInCents: 30000,
      occurredOn: "2026-10-02",
      payer: "Mariana",
      shared: false,
      createdAt: t(),
    });
    await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 30000,
      occurredOn: "2026-10-02",
      author: "Lucas",
      payer: "Lucas",
      createdAt: t(),
    });
    const by = (await home()).body.monthSummary.byMember;
    expect(
      by.map((m: { member: { name: string }; paidInCents: number; sharePercent: number }) => [
        m.member.name,
        m.paidInCents,
        m.sharePercent,
      ]),
    ).toEqual([
      ["Mariana Silva", 90000, 75],
      ["Lucas Silva", 30000, 25],
    ]);
  });

  it("Família nova sem dados: showChecklist; com conta (só abertura) deixa de mostrar", async () => {
    const res = await home();
    expect(res.body.onboarding).toEqual({
      hasAccount: false,
      hasOtherMember: true,
      hasTransaction: false,
      showChecklist: true,
    });
    await twoAccounts();
    const after = await home();
    expect(after.body.onboarding).toMatchObject({
      hasAccount: true,
      hasTransaction: false,
      showChecklist: false,
    });
  });

  it("Últimos 5: 7 lançamentos => 5 mais recentes, sem OPENING nem excluídos, inclui transferências", async () => {
    const { itau, nubank } = await twoAccounts();
    for (let i = 0; i < 5; i++) {
      await makeTransaction(fx, {
        account: nubank,
        category: "Supermercado",
        amountInCents: 100 + i,
        occurredOn: "2026-09-10",
        createdAt: t(),
      });
    }
    await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 999,
      occurredOn: "2026-10-04",
      deleted: true,
      createdAt: t(),
    });
    await makeTransfer(fx, {
      from: itau,
      to: nubank,
      amountInCents: 7000,
      occurredOn: "2026-10-03",
    });
    const res = await home();
    const types = res.body.recent.map((r: { type: string }) => r.type);
    expect(types).toHaveLength(5);
    expect(types).not.toContain("OPENING");
    expect(types.filter((x: string) => x.startsWith("TRANSFER"))).toHaveLength(2);
    expect(res.body.recent.every((r: { deletedAt: string | null }) => r.deletedAt === null)).toBe(
      true,
    );
  });

  it("Snapshot: a leitura usa transação REPEATABLE READ", async () => {
    const spy = vi.spyOn(getDb(), "$transaction");
    await home();
    expect(
      spy.mock.calls.some(
        (c) =>
          (c[1] as { isolationLevel?: string } | undefined)?.isolationLevel === "RepeatableRead",
      ),
    ).toBe(true);
  });

  it("Período: ?period aceita chave válida e rejeita inválida", async () => {
    expect((await home(mariana(), "?period=2026-09")).body.period.key).toBe("2026-09");
    expect((await home(mariana(), "?period=abc")).status).toBe(400);
  });

  it("Isolamento: a Home da Família B nunca contém dados da A", async () => {
    await twoAccounts();
    const b = await makeFamily({ uniqueEmails: true, name: "Família B" });
    const res = await home(b.members[0]?.as ?? null);
    expect(res.body.accounts).toEqual([]);
    expect(res.body.familyBalanceInCents).toBe(0);
    expect(res.body.recent).toEqual([]);
    expect(await db.family.count()).toBe(2);
  });

  it("Sem sessão => 401", async () => {
    expect((await home(null)).status).toBe(401);
  });
});
