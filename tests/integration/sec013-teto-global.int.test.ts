import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { ApiError } from "@/lib/api/errors";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { assertLlmConfig, type LlmConfig } from "@/modules/ia/config";
import { FakeLlmAdapter } from "@/modules/ia/fake-adapter";
import { aiMonthKey } from "@/modules/ia/month";
import { reserveBudget, settleEvent } from "@/modules/ia/repo";
import { type RunLogger, runLlm } from "@/modules/ia/run";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

// SEC-013 (SDD-028 §5): teto global mensal de LLM com falha fechada e alarme 50/80/100 %.
const db = testDb();
const NOW = new Date("2026-11-10T15:00:00Z");
const MONTH = aiMonthKey(NOW);
const clock = { now: () => NOW };
const MICRO_PER_CENT = 10_000n;

const cfg = (over: Record<string, string> = {}): LlmConfig =>
  assertLlmConfig({
    NODE_ENV: "test",
    AI_FEATURES_ENABLED: "true",
    LLM_MODEL_ANALYSIS: "modelo-teste",
    LLM_PRICES_JSON: JSON.stringify({ "modelo-teste": { inUsdPerMTok: 1, outUsdPerMTok: 1 } }),
    LLM_USD_BRL_RATE: "1",
    LLM_MONTHLY_CAP_CENTS: "12", // por família: 120 000 µ
    LLM_GLOBAL_MONTHLY_CAP_CENTS: "20", // global: 200 000 µ
    OPS_ALERT_EMAIL: "dono@exemplo.com",
    LLM_MAX_OUTPUT_TOKENS_ANALYSIS: "1000",
    ...over,
  });

let families: FamilyFixture[];
let mailer: InMemoryMailer;
const warns: Array<Record<string, unknown>> = [];
const log: RunLogger = {
  info: () => undefined,
  warn: (o) => void warns.push(o),
  error: () => undefined,
};

const reserve = (f: FamilyFixture, estimateMicro: bigint, globalCapCents: number | null = 20) =>
  db.$transaction((tx) =>
    reserveBudget(tx, {
      familyId: f.family.id,
      memberId: f.members[0]?.memberId as string,
      purpose: "SPENDING_ANALYSIS",
      model: "m",
      estimateMicro,
      capCents: 12,
      ...(globalCapCents !== null ? { globalCapCents } : {}),
      now: NOW,
    }),
  );
const settle = (f: FamilyFixture, eventId: string, costMicro: bigint) =>
  db.$transaction((tx) =>
    settleEvent(tx, {
      eventId,
      familyId: f.family.id,
      month: MONTH,
      status: "SETTLED",
      outcome: "ok",
      costMicro,
      inputTokens: 1,
      outputTokens: 1,
      latencyMs: 1,
      attempts: 1,
      now: NOW,
      globalCapCents: 20,
    }),
  );
const global = async () =>
  (
    await db.$queryRaw<
      Array<{ s: bigint; r: bigint; a: number }>
    >`SELECT "spentMicroBrl" s, "reservedMicroBrl" r, "alertedPct" a FROM llm_global_budget_months WHERE month = ${MONTH}`
  )[0];

beforeEach(async () => {
  await resetDb();
  warns.length = 0;
  mailer = new InMemoryMailer();
  setMailer(mailer);
  families = [];
  for (let i = 0; i < 3; i++) {
    families.push(await makeFamily({ name: `F${i + 1}`, uniqueEmails: true }));
  }
});

describe("SEC-013 teto global", () => {
  it("reprodução do relatório: F1 e F2 gastam, F3 (abaixo do próprio teto) recebe global_exceeded", async () => {
    for (const f of [families[0], families[1]] as FamilyFixture[]) {
      const r = await reserve(f, 100_000n);
      expect(r.ok).toBe(true);
      if (r.ok) await settle(f, r.eventId, 100_000n);
    }
    expect((await global())?.s).toBe(200_000n);
    const third = await reserve(families[2] as FamilyFixture, 1n);
    expect(third).toMatchObject({ ok: false, reason: "global_exceeded" });
    // sem teto global informado (legado) a F3 passaria: prova que a recusa vem do global
    expect((await reserve(families[2] as FamilyFixture, 1n, null)).ok).toBe(true);
  });

  it("runLlm: teto global atingido => 503 AI_UNAVAILABLE neutra (sem revelar teto nem valor)", async () => {
    await db.$executeRaw`INSERT INTO llm_global_budget_months (month, "spentMicroBrl") VALUES (${MONTH}, 200000)`;
    const fake = new FakeLlmAdapter({
      fixtures: { SPENDING_ANALYSIS: { ok: { summary: "x" } } },
      usage: { inputTokens: 10, outputTokens: 10 },
    });
    const err = (await runLlm(
      {
        familyId: (families[2] as FamilyFixture).family.id,
        memberId: (families[2] as FamilyFixture).members[0]?.memberId as string,
        clock,
        requestId: "r",
      },
      {
        purpose: "SPENDING_ANALYSIS",
        payload: { a: 1 },
        buildPrompt: (p) => ({ system: "s", input: JSON.stringify(p) }),
        outputSchema: z.object({ summary: z.string() }).strict(),
      },
      { db, port: fake, config: cfg(), assertConsent: async () => {}, log },
    ).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(503);
    expect(err.code).toBe("AI_UNAVAILABLE");
    expect(err.message).toBe(
      "A análise com IA está indisponível no momento. Tente de novo mais tarde.",
    );
    expect(JSON.stringify(err.toBody())).not.toMatch(/global|teto|limite|R\$/i);
  });

  it("10 reservas de famílias distintas com folga global para 3 => exatamente 3 ok, sem deadlock", async () => {
    const many: FamilyFixture[] = [...families];
    for (let i = 0; i < 7; i++) many.push(await makeFamily({ name: `X${i}`, uniqueEmails: true }));
    // global 200 000 µ; cada reserva estima 60 000 µ => cabem 3 (180 000)
    const results = await Promise.all(many.map((f) => reserve(f, 60_000n)));
    expect(results.filter((r) => r.ok)).toHaveLength(3);
    expect(results.filter((r) => !r.ok && r.reason === "global_exceeded")).toHaveLength(7);
    expect((await global())?.r).toBe(180_000n);
  }, 10_000);

  it("reserva vencida volta ao global como gasta", async () => {
    const f = families[0] as FamilyFixture;
    const r = await reserve(f, 50_000n);
    expect(r.ok).toBe(true);
    expect(await global()).toMatchObject({ s: 0n, r: 50_000n });
    const later = new Date(NOW.getTime() + 11 * 60_000);
    await db.$transaction((tx) =>
      reserveBudget(tx, {
        familyId: f.family.id,
        memberId: f.members[0]?.memberId as string,
        purpose: "SPENDING_ANALYSIS",
        model: "m",
        estimateMicro: 1n,
        capCents: 12,
        globalCapCents: 20,
        now: later,
      }),
    );
    expect(await global()).toMatchObject({ s: 50_000n, r: 1n });
  });

  it("liquidações simultâneas que cruzam o MESMO limiar (50 %) => um único alerta", async () => {
    const f = families[0] as FamilyFixture;
    const g = families[1] as FamilyFixture;
    await db.$executeRaw`INSERT INTO llm_global_budget_months (month, "spentMicroBrl") VALUES (${MONTH}, 90000)`; // 45 %
    const a = await reserve(f, 10_000n);
    const b = await reserve(g, 10_000n);
    expect(a.ok && b.ok).toBe(true);
    const [sa, sb] = await Promise.all([
      settle(f, (a as { eventId: string }).eventId, 10_000n),
      settle(g, (b as { eventId: string }).eventId, 10_000n),
    ]);
    expect([sa.alert, sb.alert].filter(Boolean)).toHaveLength(1);
    expect((await global())?.a).toBe(50);
  });

  it("alerta de 80 % dispara uma vez; repetir a liquidação acima do limiar não reenvia", async () => {
    const f = families[0] as FamilyFixture;
    await db.$executeRaw`INSERT INTO llm_global_budget_months (month, "spentMicroBrl", "alertedPct") VALUES (${MONTH}, 100000, 50)`;
    const r1 = await reserve(f, 10_000n);
    const s1 = await settle(f, (r1 as { eventId: string }).eventId, 70_000n); // 170 000 = 85 %
    expect(s1.alert).toMatchObject({ pct: 80 });
    const r2 = await reserve(f, 1_000n);
    const s2 = await settle(f, (r2 as { eventId: string }).eventId, 1_000n);
    expect(s2.alert).toBeNull();
    expect((await global())?.a).toBe(80);
  });

  it("runLlm envia o alarme por log e e-mail para OPS_ALERT_EMAIL, só com números", async () => {
    const f = families[0] as FamilyFixture;
    await db.$executeRaw`INSERT INTO llm_global_budget_months (month, "spentMicroBrl") VALUES (${MONTH}, 99000)`;
    const fake = new FakeLlmAdapter({
      fixtures: { SPENDING_ANALYSIS: { ok: { summary: "ok" } } },
      usage: { inputTokens: 500, outputTokens: 500 },
    });
    await runLlm(
      { familyId: f.family.id, memberId: f.members[0]?.memberId as string, clock, requestId: "r" },
      {
        purpose: "SPENDING_ANALYSIS",
        payload: { a: 1 },
        buildPrompt: (p) => ({ system: "s", input: JSON.stringify(p) }),
        outputSchema: z.object({ summary: z.string() }).strict(),
      },
      { db, port: fake, config: cfg(), assertConsent: async () => {}, log },
    );
    expect(warns.some((w) => w.event === "llm_global_budget_threshold" && w.pct === 50)).toBe(true);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("dono@exemplo.com");
    expect(mailer.sent[0]?.subject).toContain("50 %");
    expect(mailer.sent[0]?.text).not.toMatch(/R\$/);
  });
});

describe("SEC-013 configuração de boot", () => {
  const prod = {
    NODE_ENV: "production",
    VERCEL_ENV: "production",
    AI_FEATURES_ENABLED: "true",
    LLM_PROVIDER: "anthropic",
    ANTHROPIC_API_KEY: "k",
  };
  it("produção com IA ligada sem teto global ou sem e-mail de alarme => erro", () => {
    expect(() => assertLlmConfig(prod)).toThrow(/LLM_GLOBAL_MONTHLY_CAP_CENTS/);
    expect(() => assertLlmConfig({ ...prod, LLM_GLOBAL_MONTHLY_CAP_CENTS: "5000" })).toThrow(
      /OPS_ALERT_EMAIL/,
    );
    expect(() => assertLlmConfig({ ...prod, OPS_ALERT_EMAIL: "dono@exemplo.com" })).toThrow(
      /LLM_GLOBAL_MONTHLY_CAP_CENTS/,
    );
    const ok = assertLlmConfig({
      ...prod,
      LLM_GLOBAL_MONTHLY_CAP_CENTS: "5000",
      OPS_ALERT_EMAIL: "dono@exemplo.com",
    });
    expect(ok.globalCapCents).toBe(5000);
  });
  it("dev/teste e produção com IA desligada não exigem; padrão de dev = 100 000 centavos", () => {
    expect(assertLlmConfig({ NODE_ENV: "test" }).globalCapCents).toBe(100_000);
    expect(() =>
      assertLlmConfig({ NODE_ENV: "production", VERCEL_ENV: "production" }),
    ).not.toThrow();
  });
  void MICRO_PER_CENT;
});
