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

// US-101b AC3 (ADR-037 §4): série ativa que usa a conta impede arquivar (check e 422).
const NOW = "2026-12-03T15:00:00Z";
let fx: FamilyFixture;
let nubank: AccountFixture;
let poupanca: AccountFixture;
let reserva: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const mariana = () => fx.byName.Mariana?.as ?? null;
const at = <T>(fn: () => Promise<T>, now = NOW) => withClock(now, fn);
const SERIES_MSG = "Encerre a transferência mensal ou troque a conta";

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  nubank = await makeAccount(fx, { name: "Nubank", owner: "Mariana" });
  poupanca = await makeAccount(fx, { name: "Poupança", owner: "Mariana", type: "SAVINGS" });
  reserva = await makeAccount(fx, { name: "Reserva", owner: "Mariana" });
});

const series = async (over: Record<string, unknown> = {}) => {
  const r = await at(() =>
    call(lucas(), "POST", "/api/v1/recurring-transfers", {
      fromAccountId: nubank.id,
      toAccountId: poupanca.id,
      amountInCents: 10000,
      dayOfMonth: 5,
      startMonth: "2026-12",
      end: { kind: "NONE" },
      ...over,
    }),
  );
  expect(r.status).toBe(201);
  return r.body.series as { id: string; version: number };
};
const check = (id: string, now = NOW) =>
  at(() => call(mariana(), "GET", `/api/v1/accounts/${id}/archive-check`), now);
const archive = (id: string, version = 1, now = NOW) =>
  at(
    () =>
      call(
        mariana(),
        "POST",
        `/api/v1/accounts/${id}/archive`,
        { version },
        { idempotencyKey: crypto.randomUUID() },
      ),
    now,
  );

describe("US-101b AC3: arquivar conta com série ativa", () => {
  it("origem e destino bloqueiam (check e 422) com a mensagem da série", async () => {
    await series();
    for (const acc of [nubank, poupanca]) {
      expect((await check(acc.id)).body.blockers).toEqual([
        { code: "ACCOUNT_HAS_PLANNED_TRANSFERS", message: SERIES_MSG },
      ]);
      const r = await archive(acc.id);
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe("ACCOUNT_HAS_PLANNED_TRANSFERS");
      expect(r.body.error.message).toBe(SERIES_MSG);
    }
    expect((await check(reserva.id)).body.blockers).toEqual([]);
  });

  it("encerrar a série libera (futuras saem); atrasada pendente ainda bloqueia como prevista", async () => {
    const s = await series({ startMonth: "2026-12", dayOfMonth: 1 }); // 01/12 já passou: atrasada
    const e = await at(() =>
      call(lucas(), "POST", `/api/v1/recurring-transfers/${s.id}/end`, { version: s.version }),
    );
    expect(e.status).toBe(200);
    const blockers = (await check(nubank.id)).body.blockers;
    expect(blockers).toEqual([
      {
        code: "ACCOUNT_HAS_PLANNED_TRANSFERS",
        message: "Exclua ou efetive as transferências previstas desta conta",
      },
    ]);
    const s2 = await series({ fromAccountId: reserva.id, dayOfMonth: 25 });
    await at(() =>
      call(lucas(), "POST", `/api/v1/recurring-transfers/${s2.id}/end`, { version: s2.version }),
    );
    expect((await check(reserva.id)).body.blockers).toEqual([]);
    expect((await archive(reserva.id)).status).toBe(200);
  });

  it("série com fim já passado e sem pendentes não bloqueia; série de outra família não bloqueia", async () => {
    await series({ fromAccountId: reserva.id, dayOfMonth: 25, end: { kind: "COUNT", months: 1 } });
    expect((await check(reserva.id)).body.blockers.length).toBe(1);
    // em janeiro a única ocorrência (dez) está pendente e atrasada: bloqueia como prevista
    const jan = (await check(reserva.id, "2027-01-10T12:00:00Z")).body.blockers;
    expect(jan[0].message).toBe("Exclua ou efetive as transferências previstas desta conta");
    const other = await makeFamily({
      members: [{ email: "outra@exemplo.com", name: "Outra Pessoa", role: "ADMIN" }],
    });
    const oa = await makeAccount(other, { name: "Outra A", owner: "Outra Pessoa" });
    const ob = await makeAccount(other, { name: "Outra B", owner: "Outra Pessoa" });
    await at(() =>
      call(other.byName["Outra Pessoa"]?.as ?? null, "POST", "/api/v1/recurring-transfers", {
        fromAccountId: oa.id,
        toAccountId: ob.id,
        amountInCents: 100,
        dayOfMonth: 5,
        startMonth: "2026-12",
        end: { kind: "NONE" },
      }),
    );
    expect((await check(nubank.id)).body.blockers).toEqual([]);
  });
});
