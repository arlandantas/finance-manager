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
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let nubank: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null; // ADMIN
const lucas = () => fx.byName.Lucas?.as ?? null; // MEMBER
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const getFamily = () => at(() => call(mariana(), "GET", "/api/v1/family"));
const patch = async (as: ReturnType<typeof mariana>, body: Record<string, unknown>, key?: string) =>
  at(() =>
    call(as, "PATCH", "/api/v1/family/settings", body, key ? { idempotencyKey: key } : undefined),
  );

const spend = (payer: "Mariana" | "Lucas", cents: number, on: string, shared = true) =>
  makeTransaction(fx, {
    account: nubank,
    category: "Supermercado",
    amountInCents: cents,
    occurredOn: on,
    author: payer,
    payer,
    shared,
  });

async function checksum() {
  const [tx, rules, groups] = await Promise.all([
    db.transaction.findMany({
      orderBy: { id: "asc" },
      select: { id: true, isSharedExpense: true, amountInCents: true, deletedAt: true },
    }),
    db.splitRuleVersion.findMany({ orderBy: { id: "asc" }, include: { shares: true } }),
    db.transferGroup.findMany({ orderBy: { id: "asc" } }),
  ]);
  return JSON.stringify({ tx, rules, groups }, (_, v) => (typeof v === "bigint" ? String(v) : v));
}

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  nubank = await makeAccount(fx, {
    name: "Nubank",
    owner: "Mariana",
    openingBalanceInCents: 500000,
  });
});

describe("US-028 Acerto opcional", () => {
  it("família existente fica ligada; POST /families nasce ligada ou desligada conforme o corpo", async () => {
    const f = (await getFamily()).body.family;
    expect(f).toMatchObject({ settlementEnabled: true, version: 1 });
    const email = `novo${Date.now()}@exemplo.com`;
    const { asUser } = await import("../support/factories");
    const u = await asUser(email, { name: "Novo Usuário" });
    const created = await call(u, "POST", "/api/v1/families", {
      name: "Família Souza",
      settlementEnabled: false,
    });
    expect(created.status).toBe(201);
    const row = await db.family.findFirstOrThrow({ where: { name: "Família Souza" } });
    expect(row.settlementEnabled).toBe(false);
    const u2 = await asUser(`outro${Date.now()}@exemplo.com`, { name: "Outro" });
    await call(u2, "POST", "/api/v1/families", { name: "Família Padrão" });
    expect(
      (await db.family.findFirstOrThrow({ where: { name: "Família Padrão" } })).settlementEnabled,
    ).toBe(true);
  });

  it("desligar sem diferença: 200, version+1, FamilyEvent; telas e API de acerto respondem 409 SETTLEMENT_DISABLED", async () => {
    const res = await patch(mariana(), { version: 1, settlementEnabled: false });
    expect(res.status).toBe(200);
    expect(res.body.family).toMatchObject({ settlementEnabled: false, version: 2 });
    expect(await db.familyEvent.count({ where: { type: "SETTLEMENT_TOGGLED" } })).toBe(1);
    for (const [m, path] of [
      ["GET", "/api/v1/settlement"],
      ["GET", "/api/v1/settlement/expenses"],
      ["GET", "/api/v1/split-rule"],
      ["GET", "/api/v1/split-rule/history"],
    ] as const) {
      const r = await at(() => call(lucas(), m, path));
      expect(r.status, path).toBe(409);
      expect(r.body.error.code).toBe("SETTLEMENT_DISABLED");
    }
    const put = await at(() => call(mariana(), "PUT", "/api/v1/split-rule", { kind: "EQUAL" }));
    expect(put.status).toBe(409);
    const home = await at(() => call(lucas(), "GET", "/api/v1/home"));
    expect(home.body.settlementIndicator).toBeNull();
    const defaults = await at(() => call(lucas(), "GET", "/api/v1/transactions/defaults"));
    expect(defaults.body.split.available).toBe(false);
  });

  it("com o acerto desligado, gravar despesa dividida => 422; 'Só meu' segue normal; Extrato e totais intactos", async () => {
    const totalsBefore = (
      await at(() => call(lucas(), "GET", "/api/v1/transactions?period=2026-10"))
    ).body.totals;
    await patch(mariana(), { version: 1, settlementEnabled: false });
    const cat = (
      await db.category.findFirstOrThrow({
        where: { familyId: fx.family.id, name: "Supermercado" },
      })
    ).id;
    const body = (shared: boolean) => ({
      type: "EXPENSE",
      accountId: nubank.id,
      categoryId: cat,
      amountInCents: 1000,
      isSharedExpense: shared,
    });
    const bad = await at(() => call(lucas(), "POST", "/api/v1/transactions", body(true)));
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("SETTLEMENT_DISABLED");
    const ok = await at(() => call(lucas(), "POST", "/api/v1/transactions", body(false)));
    expect(ok.status).toBe(201);
    const list = (await at(() => call(lucas(), "GET", "/api/v1/transactions?period=2026-10"))).body
      .totals;
    expect(list.expenseInCents).toBe(totalsBefore.expenseInCents + 1000);
  });

  it("desligar com diferença exige confirmação (qualquer mês, inclusive de 2025); cancelar não grava", async () => {
    await spend("Mariana", 20000, "2026-10-02"); // out: Lucas deve 100,00? (50%) => 10000 pendente
    await spend("Mariana", 18000, "2025-05-10"); // maio/2025 => 9000
    const r1 = await patch(mariana(), { version: 1, settlementEnabled: false });
    expect(r1.status).toBe(409);
    expect(r1.body.error.code).toBe("SETTLEMENT_PENDING");
    expect(r1.body.error.details.pendingInCents).toBe(19000);
    expect(r1.body.error.details.months.map((m: { period: string }) => m.period)).toEqual([
      "2025-05",
      "2026-10",
    ]);
    expect((await db.family.findFirstOrThrow()).settlementEnabled).toBe(true);
    expect(await db.familyEvent.count()).toBe(0);
    const r2 = await patch(mariana(), {
      version: 1,
      settlementEnabled: false,
      confirmPending: true,
    });
    expect(r2.status).toBe(200);
  });

  it("desligar não apaga e religar restaura: checksum idêntico e painel igual", async () => {
    await spend("Mariana", 20000, "2026-10-02");
    await spend("Lucas", 5000, "2026-10-03", false);
    const before = await checksum();
    const panelBefore = (await at(() => call(lucas(), "GET", "/api/v1/settlement"))).body;
    await patch(mariana(), { version: 1, settlementEnabled: false, confirmPending: true });
    expect(await checksum()).toBe(before);
    const on = await patch(mariana(), { version: 2, settlementEnabled: true });
    expect(on.status).toBe(200);
    expect(await checksum()).toBe(before);
    expect((await at(() => call(lucas(), "GET", "/api/v1/settlement"))).body).toEqual(panelBefore);
  });

  it("homologado: com o recurso desligado e religado, outubro 3.169,90 / cota 1.584,95", async () => {
    await spend("Mariana", 316990, "2026-10-02");
    await patch(mariana(), { version: 1, settlementEnabled: false, confirmPending: true });
    await patch(mariana(), { version: 2, settlementEnabled: true });
    const s = (await at(() => call(lucas(), "GET", "/api/v1/settlement"))).body;
    expect(s.totalSharedInCents).toBe(316990);
    expect(s.members.map((m: { quotaInCents: number }) => m.quotaInCents)).toEqual([
      158495, 158495,
    ]);
  });

  it("Membro não altera (403); versão desatualizada => 409 VERSION_CONFLICT com nome", async () => {
    expect((await patch(lucas(), { version: 1, settlementEnabled: false })).status).toBe(403);
    await patch(mariana(), { version: 1, settlementEnabled: false });
    const stale = await patch(mariana(), { version: 1, settlementEnabled: true });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(stale.body.error.message).toContain("Mariana");
  });

  it("sem mudança de valor => 200 sem tocar na versão; corpo estrito", async () => {
    const r = await patch(mariana(), { version: 1, settlementEnabled: true });
    expect(r.status).toBe(200);
    expect(r.body.family.version).toBe(1);
    expect(
      (await patch(mariana(), { version: 1, settlementEnabled: true, familyId: "x" })).status,
    ).toBe(400);
  });

  it("duplo clique: mesma chave => 1 efeito; chaves diferentes => 200 e 409", async () => {
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      patch(mariana(), { version: 1, settlementEnabled: false }, key),
      patch(mariana(), { version: 1, settlementEnabled: false }, key),
    ]);
    expect([a.status, b.status].filter((s) => s === 200).length).toBeGreaterThanOrEqual(1);
    expect(await db.familyEvent.count()).toBe(1);
    await patch(mariana(), { version: 2, settlementEnabled: true });
    const [c, d] = await Promise.all([
      patch(mariana(), { version: 3, settlementEnabled: false }),
      patch(mariana(), { version: 3, settlementEnabled: false }),
    ]);
    expect([c.status, d.status].sort()).toEqual([200, 409]);
  });

  it("FamilyEvent é append-only (trigger)", async () => {
    await patch(mariana(), { version: 1, settlementEnabled: false });
    await expect(db.familyEvent.deleteMany()).rejects.toThrow();
    await expect(db.familyEvent.updateMany({ data: { changes: {} } })).rejects.toThrow();
  });

  it("isolamento: a configuração de uma família não afeta a outra", async () => {
    const b = await makeFamily({ uniqueEmails: true, name: "B" });
    await patch(mariana(), { version: 1, settlementEnabled: false });
    const res = await at(() => call(b.members[0]?.as ?? null, "GET", "/api/v1/settlement"));
    expect(res.status).toBe(200);
  });
});
