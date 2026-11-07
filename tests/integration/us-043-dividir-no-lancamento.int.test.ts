import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makePlannedExpense,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
let cat: string;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;
const mid = (n: string) => fx.byName[n]?.memberId as string;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({ splitEngine: "STORED" });
  acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 1_000_000 });
  cat = (
    await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Supermercado" } })
  ).id;
});

const custom = (a: number, b: number) => ({
  mode: "CUSTOM",
  shares: [
    { memberId: mid("Lucas"), bps: a },
    { memberId: mid("Mariana"), bps: b },
  ],
});
const post = (body: Record<string, unknown>, as = lucas()) =>
  at(() =>
    call(as, "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      accountId: acc.id,
      categoryId: cat,
      amountInCents: 20000,
      occurredOn: "2026-10-05",
      ...body,
    }),
  );
const patch = (id: string, version: number, body: Record<string, unknown>, as = lucas()) =>
  at(() => call(as, "PATCH", `/api/v1/transactions/${id}`, { version, ...body }));
const quotas = async () =>
  Object.fromEntries(
    (await at(() => call(lucas(), "GET", "/api/v1/settlement?period=2026-10"))).body.members.map(
      (m: { member: { name: string }; quotaInCents: number }) => [
        m.member.name.split(" ")[0],
        m.quotaInCents,
      ],
    ),
  ) as Record<string, number>;
const rows = async (id: string) =>
  Object.fromEntries(
    (await db.transactionSplit.findMany({ where: { transactionId: id } })).map((r) => [
      r.memberId === mid("Lucas") ? "Lucas" : "Mariana",
      { bps: r.bps, amount: Number(r.amountInCents) },
    ]),
  );

describe("US-043 dividir no lançamento", () => {
  it("AC2/AC1: RULE em R$ 300,00 grava 15000/15000 e o DTO traz modo e rateio; 'Só meu' não entra no acerto", async () => {
    await post({ amountInCents: 8000, split: { mode: "NONE" } });
    const res = await post({ amountInCents: 30000, split: { mode: "RULE" } });
    expect(res.status).toBe(201);
    expect(res.body.transaction.split).toMatchObject({ mode: "RULE" });
    expect(
      res.body.transaction.split.shares.map((s: { amountInCents: number }) => s.amountInCents),
    ).toEqual([15000, 15000]);
    expect(await quotas()).toEqual({ Lucas: 15000, Mariana: 15000 });
    expect(
      (await at(() => call(lucas(), "GET", "/api/v1/transactions/defaults"))).body.split.modes,
    ).toContain("CUSTOM");
  });

  it("AC3: De outro jeito aceita 100%/0% (cota 20000/0) e recusa soma diferente de 100% com 400", async () => {
    const res = await post({ split: custom(10000, 0) });
    expect(res.status).toBe(201);
    expect(res.body.transaction.split.mode).toBe("CUSTOM");
    expect(await quotas()).toEqual({ Lucas: 20000, Mariana: 0 });
    const bad = await post({ split: custom(6000, 3000) });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain("Os percentuais precisam somar 100%");
  });

  it("AC4: 5 centavos 50/50 pagador Lucas = 3/2", async () => {
    const res = await post({
      amountInCents: 5,
      split: custom(5000, 5000),
      payerMemberId: mid("Lucas"),
    });
    expect(res.status).toBe(201);
    expect(await rows(res.body.transaction.id)).toEqual({
      Lucas: { bps: 5000, amount: 3 },
      Mariana: { bps: 5000, amount: 2 },
    });
  });

  it("AC5: mudar a regra para 70/30 não altera o antigo; novo RULE usa 70/30", async () => {
    const old = await post({ amountInCents: 10000, split: { mode: "RULE" } });
    const put = await at(() =>
      call(mariana(), "PUT", "/api/v1/split-rule", {
        kind: "PROPORTIONAL",
        shares: [
          { memberId: mid("Lucas"), bps: 7000 },
          { memberId: mid("Mariana"), bps: 3000 },
        ],
        effectiveFrom: "2026-10-01",
      }),
    );
    expect(put.status).toBeLessThan(300);
    const fresh = await post({ amountInCents: 10000, split: { mode: "RULE" } });
    expect(Object.values(await rows(old.body.transaction.id)).map((r) => r.bps)).toEqual([
      5000, 5000,
    ]);
    expect((await rows(fresh.body.transaction.id)).Lucas).toMatchObject({
      bps: 7000,
      amount: 7000,
    });
  });

  it("AC6: três membros 40/40/20 em R$ 90,00 = 3600/3600/1800", async () => {
    await resetDb();
    fx = await makeFamily({
      splitEngine: "STORED",
      members: [
        { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" },
        { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
        { email: "ana@exemplo.com", name: "Ana Souza", role: "MEMBER" },
      ],
    });
    acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 100000 });
    cat = (
      await db.category.findFirstOrThrow({
        where: { familyId: fx.family.id, name: "Supermercado" },
      })
    ).id;
    const res = await post({
      amountInCents: 9000,
      split: {
        mode: "CUSTOM",
        shares: [
          { memberId: mid("Lucas"), bps: 4000 },
          { memberId: mid("Mariana"), bps: 4000 },
          { memberId: mid("Ana"), bps: 2000 },
        ],
      },
    });
    expect(res.status).toBe(201);
    const amounts = await db.transactionSplit.findMany({
      where: { transactionId: res.body.transaction.id },
    });
    expect(amounts.map((r) => Number(r.amountInCents)).sort((a, b) => a - b)).toEqual([
      1800, 3600, 3600,
    ]);
    const missing = await post({ amountInCents: 9000, split: custom(5000, 5000) });
    expect(missing.status).toBe(422);
    expect(missing.body.error.code).toBe("SHARES_MEMBER_MISMATCH");
  });

  it("AC7: editar o modo em mês aberto atualiza o acerto; em mês acertado exige confirmação", async () => {
    const res = await post({ split: { mode: "RULE" } });
    const id = res.body.transaction.id;
    const upd = await patch(id, 1, { split: custom(10000, 0) });
    expect(upd.status).toBe(200);
    expect(upd.body.transaction.split.mode).toBe("CUSTOM");
    expect(await quotas()).toEqual({ Lucas: 20000, Mariana: 0 });
  });

  it("AC7b: mês acertado => 409 até confirmar", async () => {
    const other = await makeAccount(fx, {
      name: "Nubank",
      owner: "Lucas",
      openingBalanceInCents: 0,
    });
    const res = await post({ split: { mode: "RULE" }, payerMemberId: mid("Lucas") });
    const id = res.body.transaction.id;
    const settle = await at(() =>
      call(mariana(), "POST", "/api/v1/settlements", {
        period: "2026-10",
        fromMemberId: mid("Mariana"),
        toMemberId: mid("Lucas"),
        amountInCents: 10000,
        fromAccountId: acc.id,
        toAccountId: other.id,
      }),
    );
    expect(settle.status).toBe(201);
    const blocked = await patch(id, 1, { split: custom(7000, 3000) });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("SETTLED_PERIOD_CONFIRMATION_REQUIRED");
    const ok = await patch(id, 1, { split: custom(7000, 3000), confirmSettledPeriod: true });
    expect(ok.status).toBe(200);
    expect(await rows(id)).toEqual({
      Lucas: { bps: 7000, amount: 14000 },
      Mariana: { bps: 3000, amount: 6000 },
    });
  });

  it("editar valor de CUSTOM mantém os bps; voltar a 'Só meu' apaga as linhas", async () => {
    const res = await post({ split: custom(7000, 3000), amountInCents: 10001 });
    const id = res.body.transaction.id;
    const upd = await patch(id, 1, { amountInCents: 20000 });
    expect(upd.status).toBe(200);
    expect(await rows(id)).toEqual({
      Lucas: { bps: 7000, amount: 14000 },
      Mariana: { bps: 3000, amount: 6000 },
    });
    const back = await patch(id, 2, { split: { mode: "NONE" } });
    expect(back.status).toBe(200);
    expect(back.body.transaction.split).toBeNull();
    expect(await db.transactionSplit.count({ where: { transactionId: id } })).toBe(0);
    expect((await db.transaction.findUniqueOrThrow({ where: { id } })).splitMode).toBe("NONE");
  });

  it("AC8: com o acerto desligado, split != NONE => 422 SETTLEMENT_DISABLED; NONE segue valendo", async () => {
    await db.family.update({ where: { id: fx.family.id }, data: { settlementEnabled: false } });
    const res = await post({ split: { mode: "RULE" } });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("SETTLEMENT_DISABLED");
    expect((await post({ split: custom(5000, 5000) })).status).toBe(422);
    expect((await post({ split: { mode: "NONE" } })).status).toBe(201);
  });

  it("AC10: isSharedExpense + split juntos => 400; legado true == RULE; previsão CUSTOM copia o rateio na baixa", async () => {
    expect((await post({ isSharedExpense: true, split: { mode: "RULE" } })).status).toBe(400);
    const legacy = await post({ isSharedExpense: true });
    expect(legacy.body.transaction.split.mode).toBe("RULE");

    const planned = await at(() =>
      call(lucas(), "POST", "/api/v1/planned-expenses", {
        description: "Condomínio",
        amountInCents: 30000,
        dueOn: "2026-10-20",
        categoryId: cat,
        split: custom(7000, 3000),
      }),
    );
    expect(planned.status).toBe(201);
    expect(planned.body.plannedExpense.split).toMatchObject({ mode: "CUSTOM" });
    expect(
      (
        await at(() =>
          call(lucas(), "POST", "/api/v1/planned-expenses", {
            description: "X",
            amountInCents: 100,
            categoryId: cat,
            isSharedExpense: true,
            split: { mode: "RULE" },
          }),
        )
      ).status,
    ).toBe(400);
    const paid = await at(() =>
      call(lucas(), "POST", `/api/v1/planned-expenses/${planned.body.plannedExpense.id}/pay`, {
        version: 1,
        accountId: acc.id,
      }),
    );
    expect(paid.status).toBe(201);
    expect(paid.body.transaction.split.mode).toBe("CUSTOM");
    expect(await rows(paid.body.transaction.id)).toEqual({
      Lucas: { bps: 7000, amount: 21000 },
      Mariana: { bps: 3000, amount: 9000 },
    });
    // previsão legada dividida (RULE) resolve a regra na data do pagamento
    const rule = await makePlannedExpense(fx, {
      description: "Aluguel",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: true,
    });
    const paidRule = await at(() =>
      call(lucas(), "POST", `/api/v1/planned-expenses/${rule.id}/pay`, {
        version: 1,
        accountId: acc.id,
      }),
    );
    expect(paidRule.body.transaction.split.mode).toBe("RULE");
  });

  it("editar a previsão: troca RULE -> CUSTOM e volta a 'Só meu'", async () => {
    const planned = await at(() =>
      call(lucas(), "POST", "/api/v1/planned-expenses", {
        description: "Luz",
        amountInCents: 10000,
        categoryId: cat,
        split: { mode: "RULE" },
      }),
    );
    const id = planned.body.plannedExpense.id;
    const upd = await at(() =>
      call(lucas(), "PATCH", `/api/v1/planned-expenses/${id}`, {
        version: 1,
        split: custom(2000, 8000),
      }),
    );
    expect(upd.status).toBe(200);
    expect(upd.body.plannedExpense.split.mode).toBe("CUSTOM");
    const back = await at(() =>
      call(lucas(), "PATCH", `/api/v1/planned-expenses/${id}`, {
        version: 2,
        split: { mode: "NONE" },
      }),
    );
    expect(back.body.plannedExpense.split).toBeNull();
    expect(back.body.plannedExpense.isSharedExpense).toBe(false);
  });
});
