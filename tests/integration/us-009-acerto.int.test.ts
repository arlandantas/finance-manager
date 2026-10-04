import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
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
let nubank: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>, now = NOW) => withClock(now, fn);

async function cat(name: string, family = fx.family.id): Promise<string> {
  return (await db.category.findFirstOrThrow({ where: { familyId: family, name } })).id;
}

/** Despesa comum/pessoal criada pela API (mesmo caminho do app), em nome de `payer`. */
async function spend(
  payer: "Mariana" | "Lucas",
  amountInCents: number,
  o: { shared?: boolean; occurredOn?: string; now?: string } = {},
) {
  const res = await at(
    async () =>
      call(fx.byName[payer]?.as ?? null, "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        accountId: nubank.id,
        categoryId: await cat("Supermercado"),
        amountInCents,
        payerMemberId: fx.byName[payer]?.memberId,
        isSharedExpense: o.shared ?? true,
        ...(o.occurredOn ? { occurredOn: o.occurredOn } : {}),
      }),
    o.now,
  );
  expect(res.status).toBe(201);
  return res.body.transaction.id as string;
}

const settlement = (as: ReturnType<typeof mariana>, qs = "") =>
  at(() => call(as, "GET", `/api/v1/settlement${qs}`));
type Row = {
  member: { name: string };
  paidInCents: number;
  quotaInCents: number;
  differenceInCents: number;
};
const row = (body: { members: Row[] }, first: string) =>
  body.members.find((m) => m.member.name.startsWith(first)) as Row;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  nubank = await makeAccount(fx, {
    name: "Nubank Conjunta",
    owner: "Mariana",
    openingBalanceInCents: 100000,
  });
});

describe("US-009a Painel de acerto de contas", () => {
  it("Cálculo igualitário com um devedor: 'Lucas deve 40000 a Mariana', quotas e diferenças (S1)", async () => {
    await spend("Mariana", 200000);
    await spend("Mariana", 40000);
    await spend("Lucas", 120000);
    await spend("Lucas", 40000);
    const res = await settlement(lucas());
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: "PENDING",
      totalSharedInCents: 400000,
      period: { key: "2026-10", start: "2026-10-01", end: "2026-10-31", isCurrent: true },
      rule: { kind: "EQUAL", stale: false, canEdit: false },
    });
    expect(row(res.body, "Mariana")).toMatchObject({
      paidInCents: 240000,
      quotaInCents: 200000,
      differenceInCents: 40000,
    });
    expect(row(res.body, "Lucas")).toMatchObject({
      paidInCents: 160000,
      quotaInCents: 200000,
      differenceInCents: -40000,
    });
    expect(res.body.suggestions).toHaveLength(1);
    expect(res.body.suggestions[0]).toMatchObject({
      from: { name: "Lucas Silva" },
      to: { name: "Mariana Silva" },
      amountInCents: 40000,
    });
    expect(res.body.settlements).toEqual([]);
  });

  it("Despesas pessoais não entram: despesa pessoal de 50000 não altera o total comum", async () => {
    await spend("Mariana", 10000);
    const before = await settlement(mariana());
    await spend("Mariana", 50000, { shared: false });
    const after = await settlement(mariana());
    expect(after.body.totalSharedInCents).toBe(10000);
    expect(after.body).toEqual(before.body);
  });

  it("Divisão proporcional: 60/40 e 100000 pago por Mariana => cotas 60000/40000 (S2)", async () => {
    await at(() =>
      call(mariana(), "PUT", "/api/v1/split-rule", {
        kind: "PROPORTIONAL",
        effectiveFrom: "2026-10-01",
        shares: [
          { memberId: fx.byName.Mariana?.memberId, bps: 6000 },
          { memberId: fx.byName.Lucas?.memberId, bps: 4000 },
        ],
      }),
    );
    await spend("Mariana", 100000);
    const res = await settlement(lucas());
    expect(row(res.body, "Mariana").quotaInCents).toBe(60000);
    expect(row(res.body, "Lucas").quotaInCents).toBe(40000);
    expect(res.body.suggestions[0]).toMatchObject({
      from: { name: "Lucas Silva" },
      amountInCents: 40000,
    });
  });

  it("Centavo ímpar não se perde: 10001 => 5001 e 5000, Σ = total (S3)", async () => {
    await spend("Mariana", 10001);
    const res = await settlement(mariana());
    expect(row(res.body, "Mariana").quotaInCents).toBe(5001);
    expect(row(res.body, "Lucas").quotaInCents).toBe(5000);
    expect(res.body.members.reduce((s: number, m: Row) => s + m.quotaInCents, 0)).toBe(10001);
  });

  it("Mês equilibrado => BALANCED sem sugestões (S5)", async () => {
    await spend("Mariana", 50000);
    await spend("Lucas", 50000);
    const res = await settlement(mariana());
    expect(res.body.status).toBe("BALANCED");
    expect(res.body.suggestions).toEqual([]);
  });

  it("Mês sem despesas comuns => EMPTY (S6)", async () => {
    const res = await settlement(mariana());
    expect(res.body.status).toBe("EMPTY");
    expect(res.body.totalSharedInCents).toBe(0);
    expect(res.body.suggestions).toEqual([]);
  });

  it("Família com um só membro => NEEDS_MORE_MEMBERS (S7)", async () => {
    const solo = await makeFamily({
      uniqueEmails: true,
      members: [{ email: "x@exemplo.com", name: "Solo Silva", role: "ADMIN" }],
    });
    const res = await settlement(solo.members[0]?.as ?? null);
    expect(res.body.status).toBe("NEEDS_MORE_MEMBERS");
  });

  it("Três membros: duas sugestões de 30000 para Mariana (S4)", async () => {
    const user = await db.user.create({
      data: { email: "xavier@exemplo.com", name: "Xavier Silva" },
    });
    await db.member.create({
      data: {
        familyId: fx.family.id,
        userId: user.id,
        role: "MEMBER",
        joinedAt: new Date("2026-02-01T12:00:00Z"),
      },
    });
    await spend("Mariana", 90000);
    const res = await settlement(mariana());
    expect(res.body.members.map((m: Row) => m.quotaInCents)).toEqual([30000, 30000, 30000]);
    expect(
      res.body.suggestions.map((s: { to: { name: string }; amountInCents: number }) => [
        s.to.name,
        s.amountInCents,
      ]),
    ).toEqual([
      ["Mariana Silva", 30000],
      ["Mariana Silva", 30000],
    ]);
    expect(res.body.suggestions.map((s: { from: { name: string } }) => s.from.name)).toEqual([
      "Lucas Silva",
      "Xavier Silva",
    ]);
  });

  it("Navegar entre meses: 30/09 não entra em outubro; virada de mês no fuso SP", async () => {
    await spend("Mariana", 10000, { occurredOn: "2026-09-30" });
    await spend("Mariana", 20000, { occurredOn: "2026-10-01" });
    // 02:30Z de 01/10 ainda é 30/09 em São Paulo: o padrão de `occurredOn` cai em setembro.
    await spend("Lucas", 5000, { now: "2026-10-01T02:30:00Z" });
    const oct = await settlement(mariana(), "?period=2026-10");
    const sep = await settlement(mariana(), "?period=2026-09");
    expect(oct.body.totalSharedInCents).toBe(20000);
    expect(sep.body.totalSharedInCents).toBe(15000);
    expect(sep.body.period).toMatchObject({
      key: "2026-09",
      start: "2026-09-01",
      end: "2026-09-30",
      isCurrent: false,
    });
    expect((await settlement(mariana(), "?period=2026-9")).status).toBe(400);
  });

  it("Ver as despesas que compõem o cálculo: total = totalShared; exclui pessoais, receitas, transferências e excluídas", async () => {
    await spend("Mariana", 10000);
    await spend("Lucas", 2500);
    await spend("Lucas", 999, { shared: false });
    await makeTransaction(fx, {
      account: nubank,
      type: "INCOME",
      category: "Salário",
      amountInCents: 500000,
      occurredOn: "2026-10-02",
    });
    await makeTransaction(fx, {
      account: nubank,
      category: "Supermercado",
      amountInCents: 7777,
      occurredOn: "2026-10-02",
      deleted: true,
    });
    const itau = await makeAccount(fx, { name: "Itaú", openingBalanceInCents: 0 });
    await makeTransfer(fx, {
      from: nubank,
      to: itau,
      amountInCents: 30000,
      occurredOn: "2026-10-02",
    });
    const list = await at(() => call(lucas(), "GET", "/api/v1/settlement/expenses?period=2026-10"));
    const sum = await settlement(lucas());
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(2);
    expect(list.body.totalInCents).toBe(12500);
    expect(list.body.totalInCents).toBe(sum.body.totalSharedInCents);
    expect(list.body.items[0]).toMatchObject({
      payer: { name: expect.any(String) },
      category: { name: "Supermercado" },
    });
  });

  it("Exclusões do rateio (regressão): transferência e acerto não alteram total, quotas nem outro mês", async () => {
    await spend("Mariana", 100000);
    const itau = await makeAccount(fx, { name: "Itaú", openingBalanceInCents: 0 });
    const before = await settlement(mariana());
    const sepBefore = await settlement(mariana(), "?period=2026-09");
    await makeTransfer(fx, {
      from: nubank,
      to: itau,
      amountInCents: 40000,
      occurredOn: "2026-10-02",
    });
    const afterTransfer = await settlement(mariana());
    expect(afterTransfer.body).toEqual(before.body);
    const group = await makeTransfer(fx, {
      from: nubank,
      to: itau,
      amountInCents: 10000,
      occurredOn: "2026-10-03",
      kind: "SETTLEMENT",
    });
    await db.transferGroup.update({
      where: { id: group.id },
      data: {
        settlementFromMemberId: fx.byName.Lucas?.memberId,
        settlementToMemberId: fx.byName.Mariana?.memberId,
      },
    });
    const afterSettlement = await settlement(mariana());
    expect(afterSettlement.body.totalSharedInCents).toBe(before.body.totalSharedInCents);
    expect(afterSettlement.body.members.map((m: Row) => m.quotaInCents)).toEqual(
      before.body.members.map((m: Row) => m.quotaInCents),
    );
    expect(afterSettlement.body.settlements).toHaveLength(1);
    expect(afterSettlement.body.suggestions[0].amountInCents).toBe(40000);
    expect((await settlement(mariana(), "?period=2026-09")).body).toEqual(sepBefore.body);
  });

  it("Despesa excluída muda o painel imediatamente", async () => {
    const id = await spend("Mariana", 40000);
    expect((await settlement(mariana())).body.suggestions[0].amountInCents).toBe(20000);
    await db.transaction.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedByMemberId: fx.byName.Mariana?.memberId as string,
        deletionReason: "DELETED",
      },
    });
    expect((await settlement(mariana())).body.status).toBe("EMPTY");
  });

  it("Isolamento: o acerto da Família A é invisível para a B", async () => {
    await spend("Mariana", 40000);
    const b = await makeFamily({ uniqueEmails: true, name: "Família B" });
    const res = await settlement(b.members[0]?.as ?? null);
    expect(res.body.totalSharedInCents).toBe(0);
    const list = await at(() =>
      call(b.members[0]?.as ?? null, "GET", "/api/v1/settlement/expenses"),
    );
    expect(list.body.items).toEqual([]);
  });

  it("Parâmetros e autenticação: sem sessão => 401; period inválido => 400", async () => {
    expect((await at(() => call(null, "GET", "/api/v1/settlement"))).status).toBe(401);
    expect((await settlement(mariana(), "?period=abc")).status).toBe(400);
    expect((await settlement(mariana(), "?foo=1")).status).toBe(400);
  });
});
