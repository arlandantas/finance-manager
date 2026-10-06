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

const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let corrente: AccountFixture;
let reserva: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const list = () => at(() => call(mariana(), "GET", "/api/v1/accounts"));
const patch = (id: string, body: Record<string, unknown>) =>
  at(() => call(mariana(), "PATCH", `/api/v1/accounts/${id}`, body));

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  corrente = await makeAccount(fx, {
    name: "Corrente",
    owner: "Mariana",
    openingBalanceInCents: 200000,
  });
  reserva = await makeAccount(fx, {
    name: "Reserva",
    owner: "Mariana",
    openingBalanceInCents: 1000000,
  });
});

describe("US-057 conta fora do saldo disponível", () => {
  it("marcar como reserva separa disponível e reservas; desmarcar devolve", async () => {
    const r = await patch(reserva.id, { excludeFromAvailable: true, version: 1 });
    expect(r.status).toBe(200);
    expect(r.body.excludeFromAvailable).toBe(true);
    let l = await list();
    expect(l.body.totalBalanceInCents).toBe(200000);
    expect(l.body.reservesInCents).toBe(1000000);
    await patch(reserva.id, { excludeFromAvailable: false, version: 2 });
    l = await list();
    expect(l.body.totalBalanceInCents).toBe(1200000);
    expect(l.body.reservesInCents).toBe(0);
  });

  it("continua movimentável: transferência Corrente→Reserva", async () => {
    await patch(reserva.id, { excludeFromAvailable: true, version: 1 });
    const t = await at(() =>
      call(mariana(), "POST", "/api/v1/transfers", {
        fromAccountId: corrente.id,
        toAccountId: reserva.id,
        amountInCents: 50000,
      }),
    );
    expect(t.status).toBe(201);
    const l = await list();
    expect(l.body.totalBalanceInCents).toBe(150000);
    expect(l.body.reservesInCents).toBe(1050000);
  });

  it("saldo previsto e Início ignoram a reserva", async () => {
    await patch(reserva.id, { excludeFromAvailable: true, version: 1 });
    const h = await at(() => call(mariana(), "GET", "/api/v1/home"));
    expect(h.body.balances.totalInCents).toBe(200000);
    expect(h.body.balances.reservesInCents).toBe(1000000);
    expect(h.body.monthSummary.currentBalanceInCents).toBe(200000);
  });

  it("PATCH sem nenhum campo é rejeitado", async () => {
    const r = await patch(reserva.id, { version: 1 });
    expect(r.status).toBe(400);
  });
});
