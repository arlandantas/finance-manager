import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { resetLlmConfigForTests } from "@/modules/ia/config";
import { aiMonthKey } from "@/modules/ia/month";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
const NOW = "2026-11-10T15:00:00Z";
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const usage = (as: ReturnType<typeof mariana>) =>
  withClock(NOW, () => call(as, "GET", "/api/v1/ai/usage"));

function useEnv(env: Record<string, string | undefined>) {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(env)) {
    prev[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  resetLlmConfigForTests();
  return () => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    resetLlmConfigForTests();
  };
}

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
});

describe("EN-004 GET /ai/usage", () => {
  it("ADMIN vê o consumo (R$ 2,40 de R$ 10,00) e o reset em 01/12/2026; MEMBER recebe 403", async () => {
    const restore = useEnv({ AI_FEATURES_ENABLED: "true", LLM_MONTHLY_CAP_CENTS: "1000" });
    try {
      await db.$executeRaw`INSERT INTO llm_budget_months ("familyId", month, "spentMicroBrl")
        VALUES (${fx.family.id}::uuid, ${aiMonthKey(new Date(NOW))}, 2400000)`;
      const r = await usage(mariana());
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({
        month: "2026-11",
        capInCents: 1000,
        usedInCents: 240,
        remainingInCents: 760,
        resetsOn: "2026-12-01",
      });
      const m = await usage(lucas());
      expect(m.status).toBe(403);
      expect(m.body.error.message).toBe("Só o Administrador pode ver o consumo de IA");
      expect((await usage(null)).status).toBe(401);
    } finally {
      restore();
    }
  });

  it("padrão do app é R$ 5,00; sobrescrita por família; IA desligada ⇒ cap nulo", async () => {
    let restore = useEnv({ AI_FEATURES_ENABLED: "true", LLM_MONTHLY_CAP_CENTS: undefined });
    try {
      expect((await usage(mariana())).body.capInCents).toBe(500);
      await db.family.update({ where: { id: fx.family.id }, data: { aiMonthlyCapCents: 200 } });
      expect((await usage(mariana())).body.capInCents).toBe(200);
    } finally {
      restore();
    }
    restore = useEnv({ AI_FEATURES_ENABLED: "false" });
    try {
      const r = await usage(mariana());
      expect(r.body).toMatchObject({ capInCents: null, remainingInCents: null });
    } finally {
      restore();
    }
  });

  it("nenhum DTO contém a chave da API", async () => {
    const restore = useEnv({ AI_FEATURES_ENABLED: "true" });
    try {
      const raw = JSON.stringify((await usage(mariana())).body);
      expect(raw).not.toMatch(/apiKey|ANTHROPIC|sk-ant/i);
    } finally {
      restore();
    }
  });
});
