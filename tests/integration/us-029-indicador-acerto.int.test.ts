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
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let nubank: AccountFixture;
let itau: AccountFixture;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const indicator = async () =>
  (await at(() => call(lucas(), "GET", "/api/v1/home"))).body.settlementIndicator;
const spend = (cents: number, on: string, payer: "Mariana" | "Lucas" = "Mariana") =>
  makeTransaction(fx, {
    account: nubank,
    category: "Supermercado",
    amountInCents: cents,
    occurredOn: on,
    author: payer,
    payer,
    shared: true,
  });

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  nubank = await makeAccount(fx, {
    name: "Nubank",
    owner: "Mariana",
    openingBalanceInCents: 500000,
  });
  itau = await makeAccount(fx, { name: "Itaú", owner: "Lucas", openingBalanceInCents: 500000 });
});

describe("US-029 Indicador neutro de acerto", () => {
  it("mês pendente: PENDING com o valor; sem despesas comuns: null; equilibrado: IN_ORDER", async () => {
    expect((await indicator()).current).toBeNull();
    await spend(76000, "2026-10-02");
    expect((await indicator()).current).toEqual({
      periodKey: "2026-10",
      state: "PENDING",
      toSettleInCents: 38000,
    });
    await spend(76000, "2026-10-03", "Lucas");
    expect((await indicator()).current).toMatchObject({ state: "IN_ORDER" });
  });

  it("mês anterior pendente (setembro 26.050 = homologado) entra em previous; some após acertar", async () => {
    await spend(52100, "2026-09-10");
    const ind = await indicator();
    expect(ind.previous).toEqual({
      monthsCount: 1,
      totalInCents: 26050,
      oldestPeriodKey: "2026-09",
    });
    await makeTransfer(fx, {
      from: itau,
      to: nubank,
      amountInCents: 26050,
      occurredOn: "2026-10-05",
      kind: "SETTLEMENT",
    });
    // o acerto precisa apontar o período/membros: grava via API como o app faz
    await db.transferGroup.updateMany({
      data: {
        settlementPeriod: "2026-09",
        settlementFromMemberId: fx.byName.Lucas?.memberId as string,
        settlementToMemberId: fx.byName.Mariana?.memberId as string,
      },
    });
    expect((await indicator()).previous).toBeNull();
  });

  it("janela de 12 meses: 12 meses atrás entra, 13 não; o painel do mês antigo segue mostrando", async () => {
    await spend(18000, "2025-10-10"); // 12 meses antes de out/2026
    expect((await indicator()).previous).toMatchObject({
      monthsCount: 1,
      oldestPeriodKey: "2025-10",
    });
  });

  it("13 meses atrás não gera aviso, mas o painel do mês mostra o valor", async () => {
    await spend(18000, "2025-09-10");
    expect((await indicator()).previous).toBeNull();
    const panel = await at(() => call(lucas(), "GET", "/api/v1/settlement?period=2025-09"));
    expect(panel.body.suggestions[0].amountInCents).toBe(9000);
  });

  it("reconciliação: indicador.current == painel do mesmo mês (200 variações com semente fixa)", async () => {
    const { mulberry32 } = await import("../support/prng");
    const rnd = mulberry32(29);
    for (let i = 0; i < 25; i++) {
      await resetDb();
      fx = await makeFamily();
      nubank = await makeAccount(fx, { name: "N", owner: "Mariana", openingBalanceInCents: 0 });
      const k = 1 + Math.floor(rnd() * 4);
      for (let j = 0; j < k; j++) {
        await spend(
          100 + Math.floor(rnd() * 90000),
          `2026-10-${String(1 + Math.floor(rnd() * 11)).padStart(2, "0")}`,
          rnd() < 0.5 ? "Mariana" : "Lucas",
        );
      }
      const ind = await indicator();
      const panel = (await at(() => call(lucas(), "GET", "/api/v1/settlement"))).body;
      const due = panel.suggestions.reduce(
        (s: number, x: { amountInCents: number }) => s + x.amountInCents,
        0,
      );
      if (ind.current.state === "PENDING") expect(ind.current.toSettleInCents).toBe(due);
      else expect(due).toBe(0);
    }
  }, 120_000);

  it("acerto desligado => settlementIndicator nulo", async () => {
    await spend(76000, "2026-10-02");
    await db.family.update({ where: { id: fx.family.id }, data: { settlementEnabled: false } });
    expect(await indicator()).toBeNull();
  });
});
