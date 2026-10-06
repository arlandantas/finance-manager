import { beforeEach, describe, expect, it } from "vitest";
import { setDevClockOverride } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb } from "../support/db";
import { type FamilyFixture, makeAccount, makeCard, makeFamily } from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const get = async (path: string) => {
  setDevClockOverride(NOW);
  return call(mariana(), "GET", path);
};

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 500000 });
});

describe("US-052 parcelas fora do acerto (somente leitura)", () => {
  it("sem parcelas: null", async () => {
    const s = await get("/api/v1/settlement?period=2026-10");
    expect(s.status).toBe(200);
    expect(s.body.installmentsOutside).toBeNull();
  });

  it("conta as parcelas do mês no Acerto e no indicador, sem mudar o acerto", async () => {
    const before = await get("/api/v1/settlement?period=2026-10");
    const card = await makeCard(fx, { name: "Nubank", owner: "Mariana" });
    await makeInstallmentPurchase(fx, {
      card,
      total: 120000,
      count: 3,
      purchaseOn: "2026-10-05",
      description: "TV 55 polegadas",
    });
    const s = await get("/api/v1/settlement?period=2026-10");
    expect(s.body.installmentsOutside).toEqual({ count: 1, totalInCents: 40000 });
    expect(s.body.members).toEqual(before.body.members);
    expect(s.body.totalSharedInCents).toBe(before.body.totalSharedInCents);
    const home = await get("/api/v1/home");
    expect(home.body.settlementIndicator.installmentsOutside).not.toBeUndefined();
  });
});
