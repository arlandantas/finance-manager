import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { withClock } from "@/lib/clock";
import { buildAnalysisPayload, canonicalJson } from "@/modules/analise-ia/payload";
import { assertLlmConfig, resetLlmConfigForTests } from "@/modules/ia/config";
import { FakeLlmAdapter } from "@/modules/ia/fake-adapter";
import { runLlm } from "@/modules/ia/run";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
const NOW = "2026-10-24T15:00:00Z";
let fx: FamilyFixture;

beforeEach(async () => {
  await resetDb();
  process.env.AI_FEATURES_ENABLED = "true";
  resetLlmConfigForTests();
  fx = await makeFamily();
});

describe("EN-005 o que é enviado é exatamente o que foi exibido", () => {
  it("runLlm com consentimento envia ao provedor o JSON canônico do payload, byte a byte", async () => {
    await withClock(NOW, () =>
      call(fx.byName.Mariana?.as ?? null, "POST", "/api/v1/ai/consents/SPENDING_ANALYSIS/enable", {
        textVersion: 1,
        familyVersion: 1,
      }),
    );
    const { payload } = buildAnalysisPayload({
      aggregates: {
        months: [
          { rel: -1, expenseInCents: 1000, incomeInCents: 5000 },
          { rel: 0, expenseInCents: 2000, incomeInCents: 5000 },
        ],
        categories: [
          {
            id: randomUUID(),
            name: "Escola do Lucas",
            icon: "shopping-cart" as never,
            totals: [{ rel: 0, amountInCents: 2000, count: 3 }],
          },
        ],
      },
      recurring: [],
      dismissedKeys: new Set(),
      memberNames: ["Mariana Silva", "Lucas Silva"],
      partial: false,
      seed: "e2e",
    });
    const shown = canonicalJson(payload);
    const fake = new FakeLlmAdapter({ fixtures: { SPENDING_ANALYSIS: { ok: { summary: "ok" } } } });
    const r = await runLlm(
      {
        familyId: fx.family.id,
        memberId: fx.byName.Mariana?.memberId as string,
        clock: { now: () => new Date(NOW) },
        requestId: "r",
      },
      {
        purpose: "SPENDING_ANALYSIS",
        payload,
        buildPrompt: (p) => ({ system: "prompt fixo", input: canonicalJson(p) }),
        outputSchema: z.object({ summary: z.string() }).strict(),
      },
      {
        db,
        port: fake,
        config: assertLlmConfig({ NODE_ENV: "test", AI_FEATURES_ENABLED: "true" }),
      },
    );
    expect(r.data.summary).toBe("ok");
    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]?.input).toBe(shown);
    expect(fake.calls[0]?.input).not.toMatch(/Lucas|Mariana|Silva/);
    expect(JSON.parse(shown).categories[0].label).toBe("Escola do pessoa");
  });
});
