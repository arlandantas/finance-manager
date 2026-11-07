import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
} from "../support/factories";

// US-100b (ADR-037): coluna "Transferências previstas" no resumo por conta e bloqueio de arquivar.
const NOW = "2026-12-03T15:00:00Z";
let fx: FamilyFixture;
let itau: AccountFixture;
let poupanca: AccountFixture;
let nubank: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const BASE = "/api/v1/planned-transfers";

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  itau = await makeAccount(fx, { name: "Itaú", owner: "Lucas", openingBalanceInCents: 500000 });
  poupanca = await makeAccount(fx, { name: "Poupança", owner: "Mariana", type: "SAVINGS" });
  nubank = await makeAccount(fx, { name: "Nubank", owner: "Mariana" });
});

const create = (over: Record<string, unknown> = {}) =>
  at(() =>
    call(lucas(), "POST", BASE, {
      fromAccountId: itau.id,
      toAccountId: poupanca.id,
      amountInCents: 100000,
      dueOn: "2026-12-20",
      ...over,
    }),
  );
const payables = async (qs = "", as = lucas()) =>
  (await at(() => call(as, "GET", `/api/v1/payables${qs}`))).body;
const row = (p: { byAccount: { rows: Array<Record<string, unknown>> } }, id: string) =>
  p.byAccount.rows.find((r) => (r.account as { id: string } | null)?.id === id);

describe("US-100b AC1/AC2: coluna no resumo por conta", () => {
  it("prevista de 1.000,00 em dezembro: -1.000,00 / +1.000,00, previsto ajustado, totais iguais", async () => {
    const before = await payables();
    expect((await create()).status).toBe(201);
    const p = await payables();
    expect(row(p, itau.id)).toMatchObject({
      plannedTransfersInCents: -100000,
      projectedInCents: 400000,
    });
    expect(row(p, poupanca.id)).toMatchObject({
      plannedTransfersInCents: 100000,
      projectedInCents: 100000,
    });
    expect(p.byAccount.columns.plannedTransfers).toBe(true);
    expect(p.totals).toEqual(before.totals);
    expect(
      p.byAccount.rows.reduce((s: number, r: { dueInCents: number }) => s + r.dueInCents, 0),
    ).toBe(p.totals.dueInCents);
    const home = (await at(() => call(lucas(), "GET", "/api/v1/home"))).body;
    expect(JSON.stringify(home)).not.toContain("plannedTransfers");
  });

  it("sem prevista no período, a coluna some; outro mês não entra; atrasada entra no corrente", async () => {
    expect((await payables()).byAccount.columns.plannedTransfers).toBe(false);
    await create({ dueOn: "2027-02-10" });
    expect((await payables()).byAccount.columns.plannedTransfers).toBe(false);
    expect((await payables("?period=2027-02")).byAccount.columns.plannedTransfers).toBe(true);
    await create({ dueOn: "2026-11-20", amountInCents: 5000 });
    const p = await payables();
    expect(row(p, itau.id)).toMatchObject({ plannedTransfersInCents: -5000 });
  });

  it("efetivada e excluída não entram; efetivar zera a coluna", async () => {
    const a = (await create()).body.plannedTransfer;
    const b = (await create({ amountInCents: 2000 })).body.plannedTransfer;
    await at(() => call(lucas(), "POST", `${BASE}/${b.id}/delete`, { version: b.version }));
    expect(row(await payables(), itau.id)).toMatchObject({ plannedTransfersInCents: -100000 });
    const r = await at(() =>
      call(
        lucas(),
        "POST",
        `${BASE}/${a.id}/realize`,
        { version: a.version },
        {
          idempotencyKey: crypto.randomUUID(),
        },
      ),
    );
    expect(r.status).toBe(201);
    expect((await payables()).byAccount.columns.plannedTransfers).toBe(false);
  });

  it("isolamento: outra família não vê a transferência prevista", async () => {
    await create();
    const other = await makeFamily({ name: "Outra", uniqueEmails: true });
    const acc = await makeAccount(other, { name: "Conta X", openingBalanceInCents: 1000 });
    const p = await payables("", other.members[0]?.as ?? null);
    expect(p.byAccount.columns.plannedTransfers).toBe(false);
    expect(row(p, acc.id)).toMatchObject({ plannedTransfersInCents: 0 });
  });
});

describe("US-100b AC4: arquivar conta com prevista pendente", () => {
  const archive = (id: string, version = 1, as = mariana()) =>
    at(() =>
      call(
        as,
        "POST",
        `/api/v1/accounts/${id}/archive`,
        { version },
        {
          idempotencyKey: crypto.randomUUID(),
        },
      ),
    );
  const check = (id: string, as = mariana()) =>
    at(() => call(as, "GET", `/api/v1/accounts/${id}/archive-check`));

  it("origem e destino bloqueiam (check e 422); sem saldo, só este impedimento", async () => {
    await create({ fromAccountId: nubank.id, toAccountId: poupanca.id });
    for (const acc of [nubank, poupanca]) {
      const c = await check(acc.id);
      expect(c.body.blockers).toEqual([
        {
          code: "ACCOUNT_HAS_PLANNED_TRANSFERS",
          message: "Exclua ou efetive as transferências previstas desta conta",
        },
      ]);
      const r = await archive(acc.id);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe("ACCOUNT_HAS_PLANNED_TRANSFERS");
    }
  });

  it("conta sem prevista arquiva; excluir ou efetivar libera; efetivada não bloqueia", async () => {
    const t = (await create({ fromAccountId: nubank.id, toAccountId: poupanca.id })).body
      .plannedTransfer;
    expect((await check(itau.id)).body.blockers.map((b: { code: string }) => b.code)).toEqual([
      "ACCOUNT_BALANCE_NOT_ZERO",
    ]);
    await at(() => call(lucas(), "POST", `${BASE}/${t.id}/delete`, { version: t.version }));
    expect((await check(nubank.id)).body.blockers).toEqual([]);
    const t2 = (
      await create({ fromAccountId: nubank.id, toAccountId: poupanca.id, amountInCents: 1 })
    ).body.plannedTransfer;
    await at(() =>
      call(
        lucas(),
        "POST",
        `${BASE}/${t2.id}/realize`,
        { version: t2.version },
        {
          idempotencyKey: crypto.randomUUID(),
        },
      ),
    );
    // nubank ficou com saldo -1; a prevista efetivada não é impedimento
    expect((await check(nubank.id)).body.blockers.map((b: { code: string }) => b.code)).toEqual([
      "ACCOUNT_BALANCE_NOT_ZERO",
    ]);
  });

  it("prevista excluída de outra família não bloqueia; criação concorrente após lock é recusada", async () => {
    const t = (await create({ fromAccountId: nubank.id, toAccountId: poupanca.id })).body
      .plannedTransfer;
    await at(() => call(lucas(), "POST", `${BASE}/${t.id}/delete`, { version: t.version }));
    expect((await archive(nubank.id)).status).toBe(200);
    const late = await create({ fromAccountId: nubank.id, toAccountId: poupanca.id });
    expect(late.status).toBe(422);
    expect(late.body.error.code).toBe("INVALID_REFERENCE");
  });
});
