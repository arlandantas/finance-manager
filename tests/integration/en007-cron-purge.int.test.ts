import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/cron/purge/route";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
const SECRET = "c".repeat(40);
let fx: FamilyFixture;

const req = (auth?: string) =>
  new Request("http://localhost:3100/api/cron/purge", {
    method: "GET",
    headers: auth ? { authorization: auth } : {},
  });

async function usage(createdAt: string, month: string) {
  await db.$executeRaw`INSERT INTO llm_usage_events (id, "familyId", month, purpose, "memberId", model, status, "reservedMicroBrl", "expiresAt", "createdAt", "settledAt")
    VALUES (gen_random_uuid(), ${fx.family.id}::uuid, ${month}, 'SPENDING_ANALYSIS', ${fx.byName.Mariana?.memberId}::uuid, 'm', 'SETTLED', 1, now(), ${new Date(createdAt)}, now())`;
}

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  process.env.CRON_SECRET = SECRET;
});
afterEach(() => {
  delete process.env.CRON_SECRET;
});

describe("EN-007 GET /api/cron/purge (ADR-031 §8)", () => {
  it("sem segredo, com segredo errado ou CRON_SECRET ausente => 401 e nada é apagado", async () => {
    await usage("2020-01-01T00:00:00Z", "2020-01");
    expect((await GET(req())).status).toBe(401);
    expect((await GET(req("Bearer errado"))).status).toBe(401);
    delete process.env.CRON_SECRET;
    expect((await GET(req("Bearer undefined"))).status).toBe(401);
    expect(await db.llmUsageEvent.count()).toBe(1);
  });

  it("apaga o antigo, preserva o recente e é idempotente (rodar duas vezes não apaga a mais)", async () => {
    await usage("2020-01-01T00:00:00Z", "2020-01");
    await usage(new Date().toISOString(), "2026-10");
    const first = await GET(req(`Bearer ${SECRET}`));
    expect(first.status).toBe(200);
    const body = await first.json();
    expect(body.results).toContainEqual({ task: "ai:purge-usage", deleted: 1 });
    expect(await db.llmUsageEvent.count()).toBe(1);
    const again = await (await GET(req(`Bearer ${SECRET}`))).json();
    expect(again.results).toContainEqual({ task: "ai:purge-usage", deleted: 0 });
    expect(await db.llmUsageEvent.count()).toBe(1);
  });

  it("execuções simultâneas (entrega duplicada) não falham nem apagam em dobro", async () => {
    await usage("2020-01-01T00:00:00Z", "2020-01");
    const rs = await Promise.all([1, 2, 3].map(() => GET(req(`Bearer ${SECRET}`))));
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await db.llmUsageEvent.count()).toBe(0);
  });
});
