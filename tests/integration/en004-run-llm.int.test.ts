import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { assertLlmConfig, type LlmConfig } from "@/modules/ia/config";
import { FakeLlmAdapter, type FakeScenario } from "@/modules/ia/fake-adapter";
import { aiMonthKey } from "@/modules/ia/month";
import { type RunLogger, runLlm } from "@/modules/ia/run";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
const NOW = new Date("2026-11-10T15:00:00Z");
const MONTH = aiMonthKey(NOW);
const clock = { now: () => NOW };
const SECRET = "SEGREDO-Escola-do-Lucas-123";

// 1 token = 1 micro-real (preço US$ 1/MTok, câmbio 1): custo em µ = tokens, fácil de calibrar.
const cfg = (over: Record<string, string> = {}): LlmConfig =>
  assertLlmConfig({
    NODE_ENV: "test",
    AI_FEATURES_ENABLED: "true",
    LLM_MODEL_ANALYSIS: "modelo-teste",
    LLM_PRICES_JSON: JSON.stringify({ "modelo-teste": { inUsdPerMTok: 1, outUsdPerMTok: 1 } }),
    LLM_USD_BRL_RATE: "1",
    LLM_MONTHLY_CAP_CENTS: "1000",
    LLM_MAX_OUTPUT_TOKENS_ANALYSIS: "1000",
    ...over,
  });
const outputSchema = z.object({ summary: z.string() }).strict();
const fixtures = { SPENDING_ANALYSIS: { ok: { summary: `resumo ${SECRET}` } } };

let fx: FamilyFixture;
let ctx: { familyId: string; memberId: string; clock: typeof clock; requestId: string };
let fake: FakeLlmAdapter;
const allow = async () => {};

const run = (
  over: {
    config?: LlmConfig;
    signal?: AbortSignal;
    assertConsent?: typeof allow;
    log?: RunLogger;
  } = {},
) =>
  runLlm(
    ctx,
    {
      purpose: "SPENDING_ANALYSIS",
      payload: { dado: SECRET },
      buildPrompt: (p) => ({ system: "prompt fixo", input: JSON.stringify(p) }),
      outputSchema,
      ...(over.signal ? { signal: over.signal } : {}),
    },
    {
      db,
      port: fake,
      config: over.config ?? cfg(),
      assertConsent: over.assertConsent ?? allow,
      ...(over.log ? { log: over.log } : {}),
    },
  );
const seedSpent = (micro: number) =>
  db.$executeRaw`INSERT INTO llm_budget_months ("familyId", month, "spentMicroBrl") VALUES (${fx.family.id}::uuid, ${MONTH}, ${micro})
    ON CONFLICT ("familyId", month) DO UPDATE SET "spentMicroBrl" = ${micro}`;
const counters = async () =>
  (
    await db.$queryRaw<
      Array<{ s: bigint; r: bigint }>
    >`SELECT "spentMicroBrl" s, "reservedMicroBrl" r FROM llm_budget_months WHERE "familyId" = ${fx.family.id}::uuid AND month = ${MONTH}`
  )[0];
const fail = async (p: Promise<unknown>) => (await p.catch((e) => e)) as ApiError;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  ctx = {
    familyId: fx.family.id,
    memberId: fx.byName.Mariana?.memberId as string,
    clock,
    requestId: "req-1",
  };
  fake = new FakeLlmAdapter({ fixtures, usage: { inputTokens: 200_000, outputTokens: 200_000 } });
});

describe("EN-004 runLlm", () => {
  it("dentro do teto: acerta o custo real (R$ 2,00 + R$ 0,40 = R$ 2,40) e registra sem conteúdo", async () => {
    await seedSpent(2_000_000);
    const r = await run();
    expect(r.data.summary).toContain("resumo");
    expect(await counters()).toEqual({ s: 2_400_000n, r: 0n });
    const rows = await db.$queryRaw<Array<Record<string, unknown>>>`SELECT * FROM llm_usage_events`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      status: "SETTLED",
      outcome: "ok",
      inputTokens: 200_000,
      outputTokens: 200_000,
    });
    // varredura: nenhuma coluna contém strings do payload nem do resultado
    expect(
      JSON.stringify(rows, (_, v) => (typeof v === "bigint" ? v.toString() : v)),
    ).not.toContain(SECRET);
    expect(fake.calls).toHaveLength(1);
  });

  it("teto atingido: 422 LLM_BUDGET_EXCEEDED com resetsOn e zero chamadas", async () => {
    await seedSpent(10_000_000);
    const e = await fail(run());
    expect(e).toMatchObject({
      status: 422,
      code: "LLM_BUDGET_EXCEEDED",
      details: { resetsOn: "2026-12-01" },
    });
    expect(e.message).toBe(
      "O limite de uso de IA deste mês foi atingido. Volta a liberar em 01/12/2026",
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("estimativa maior que o saldo: 422 LLM_ESTIMATE_EXCEEDS_BUDGET e zero chamadas", async () => {
    await seedSpent(9_999_000); // saldo de 1.000 µ; a estimativa passa de 1.000 tokens de saída
    const e = await fail(run());
    expect(e).toMatchObject({ status: 422, code: "LLM_ESTIMATE_EXCEEDS_BUDGET" });
    expect(fake.calls).toHaveLength(0);
    expect(await db.llmUsageEvent.count()).toBe(0);
  });

  const failures: Array<[FakeScenario, number, string]> = [
    ["unavailable", 503, "LLM_UNAVAILABLE"],
    ["timeout", 503, "LLM_UNAVAILABLE"],
    ["rate_limited", 503, "LLM_UNAVAILABLE"],
    ["auth", 503, "LLM_UNAVAILABLE"],
    ["invalid_json", 502, "LLM_INVALID_RESPONSE"],
    ["schema_violation", 502, "LLM_INVALID_RESPONSE"],
    ["truncated", 502, "LLM_INVALID_RESPONSE"],
    ["refusal", 502, "LLM_INVALID_RESPONSE"],
  ];
  it.each(failures)(
    "falha %s ⇒ %i %s, mensagem neutra, reserva liberada",
    async (scenario, status, code) => {
      fake.scenario = scenario;
      fake.fixtures = {
        SPENDING_ANALYSIS: { invalid_json: "{x", schema_violation: { summary: 1 } },
      };
      const e = await fail(run());
      expect(e).toMatchObject({ status, code });
      expect(e.message).toBe("Não foi possível usar a IA agora. Tente novamente em instantes");
      const c = await counters();
      expect(c?.r).toBe(0n);
      // falha antes de qualquer token custa 0; com tokens (truncado, recusado, resposta inválida) custa o real
      const withTokens = ["truncated", "refusal", "invalid_json", "schema_violation"].includes(
        scenario,
      );
      expect(c?.s).toBe(withTokens ? 400_000n : 0n);
      expect((await db.llmUsageEvent.findFirst())?.status).toBe("FAILED");
    },
  );

  it("consentimento ausente (padrão fail-closed): 409 AI_DISABLED, sem reserva e sem chamada", async () => {
    const e = await fail(
      runLlm(
        ctx,
        {
          purpose: "SPENDING_ANALYSIS",
          payload: {},
          buildPrompt: () => ({ system: "s", input: "{}" }),
          outputSchema,
        },
        { db, port: fake, config: cfg() },
      ),
    );
    expect(e).toMatchObject({ status: 409, code: "AI_DISABLED" });
    expect(fake.calls).toHaveLength(0);
    expect(await db.llmUsageEvent.count()).toBe(0);
  });

  it("finalidade desconhecida/indisponível ⇒ 422 PURPOSE_NOT_AVAILABLE, sem provedor nem reserva", async () => {
    const e = await fail(
      runLlm(
        ctx,
        {
          purpose: "FUTURE_PURPOSE" as never, // US-066c liberou INVOICE_IMPORT: só uma finalidade fora do enum cai aqui
          payload: {},
          buildPrompt: () => ({ system: "s", input: "{}" }),
          outputSchema,
        },
        { db, port: fake, config: cfg(), assertConsent: allow },
      ),
    );
    expect(e).toMatchObject({ status: 422, code: "PURPOSE_NOT_AVAILABLE" });
    expect(fake.calls).toHaveLength(0);
    expect(await db.llmUsageEvent.count()).toBe(0);
  });

  it("flag AI_FEATURES_ENABLED=false ⇒ 503 AI_UNAVAILABLE", async () => {
    expect(await fail(run({ config: cfg({ AI_FEATURES_ENABLED: "false" }) }))).toMatchObject({
      status: 503,
      code: "AI_UNAVAILABLE",
    });
    expect(fake.calls).toHaveLength(0);
  });

  it("concorrência: 10 runLlm simultâneos com saldo para 3 ⇒ 3 chamam o provedor e 7 recebem LLM_ESTIMATE_EXCEEDS_BUDGET", async () => {
    // teto 1 centavo = 10.000 µ; estimativa ≈ 1.000 saída + ~55 entrada ⇒ cabem 9; use teto menor via override da família
    await db.family.update({ where: { id: fx.family.id }, data: { aiMonthlyCapCents: 1 } });
    fake.usage = { inputTokens: 10, outputTokens: 10 };
    fake.delayMs = 400; // todas reservam antes de qualquer acerto
    // 1 centavo = 10.000 µ; seed 6.700 ⇒ saldo 3.300 ⇒ 3 estimativas de ~1.0xx cabem
    await seedSpent(6_700);
    const rs = await Promise.all(
      Array.from({ length: 10 }, () =>
        run().then(
          () => "ok",
          (e: ApiError) => e.code,
        ),
      ),
    );
    expect(rs.filter((r) => r === "ok")).toHaveLength(3);
    expect(rs.filter((r) => r === "LLM_ESTIMATE_EXCEEDS_BUDGET")).toHaveLength(7);
    expect(fake.calls).toHaveLength(3);
    const c = await counters();
    expect((c?.s ?? 0n) + (c?.r ?? 0n)).toBeLessThanOrEqual(10_000n);
  });

  it("cancelamento durante a chamada: 499 e a reserva inteira fica como gasta (conservador)", async () => {
    fake.delayMs = 2000;
    const ac = new AbortController();
    const p = fail(run({ signal: ac.signal }));
    setTimeout(() => ac.abort(), 100);
    const e = await p;
    expect(e).toMatchObject({ status: 499, code: "LLM_CANCELLED" });
    const c = await counters();
    expect(c?.r).toBe(0n);
    expect(c?.s ?? 0n).toBeGreaterThan(0n);
    expect((await db.llmUsageEvent.findFirst())?.outcome).toBe("cancelled");
  });

  it("prazo total (LLM_DEADLINE_MS) estourado vira TIMEOUT (503), não cancelamento", async () => {
    fake.delayMs = 5000;
    const e = await fail(run({ config: cfg({ LLM_DEADLINE_MS: "1000" }) }));
    expect(e).toMatchObject({ status: 503, code: "LLM_UNAVAILABLE" });
    expect((await db.llmUsageEvent.findFirst())?.outcome).toBe("timeout");
  }, 15_000);

  it("logs: nenhuma saída contém payload, resultado ou chave", async () => {
    const lines: string[] = [];
    const log: RunLogger = {
      info: (o, m) => lines.push(JSON.stringify([o, m])),
      warn: (o, m) => lines.push(JSON.stringify([o, m])),
      error: (o, m) => lines.push(JSON.stringify([o, m])),
    };
    await run({ log });
    fake.scenario = "unavailable";
    await fail(run({ log }));
    fake.scenario = "refusal";
    await fail(run({ log }));
    await seedSpent(10_000_000);
    await fail(run({ log }));
    const all = lines.join("\n");
    expect(lines.length).toBeGreaterThanOrEqual(4);
    expect(all).not.toContain(SECRET);
    expect(all).not.toContain("prompt fixo");
    expect(all).not.toContain("sk-ant");
    expect(all).toContain('"outcome":"ok"');
    expect(all).toContain('"outcome":"budget"');
    expect(all).toContain('"familyId"');
  });
});
