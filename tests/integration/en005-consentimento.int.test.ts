import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { withClock } from "@/lib/clock";
import { assertLlmConfig, resetLlmConfigForTests } from "@/modules/ia/config";
import { AI_CONSENT_TEXTS, setConsentTextsForTests } from "@/modules/ia/consent-texts";
import { FakeLlmAdapter } from "@/modules/ia/fake-adapter";
import { runLlm } from "@/modules/ia/run";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
const NOW = "2026-10-24T15:00:00Z";
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);

const settings = (as = mariana()) => at(() => call(as, "GET", "/api/v1/ai/settings"));
const enable = (
  as = mariana(),
  body: unknown = { textVersion: 1, familyVersion: 1 },
  key?: string,
) =>
  at(() =>
    call(as, "POST", "/api/v1/ai/consents/SPENDING_ANALYSIS/enable", body, {
      ...(key ? { idempotencyKey: key } : {}),
    }),
  );
const disable = (as = mariana(), familyVersion = 1) =>
  at(() => call(as, "POST", "/api/v1/ai/consents/SPENDING_ANALYSIS/disable", { familyVersion }));
const events = () => db.aiConsentEvent.findMany({ orderBy: { createdAt: "asc" } });
type Feature = {
  purpose: string;
  state: string;
  available: boolean;
  lastChange: {
    action: string;
    by: { name: string; former: boolean };
    textVersion: number;
  } | null;
  currentText: { version: number; summary: string };
};
const feature = (r: { body: { features: Feature[] } }) =>
  r.body.features.find((f) => f.purpose === "SPENDING_ANALYSIS") as Feature;

const cfg = () =>
  assertLlmConfig({
    NODE_ENV: "test",
    AI_FEATURES_ENABLED: "true",
    LLM_MONTHLY_CAP_CENTS: "1000",
  });
const outputSchema = z.object({ summary: z.string() }).strict();
const runOnce = (fake: FakeLlmAdapter) =>
  runLlm(
    {
      familyId: fx.family.id,
      memberId: fx.byName.Lucas?.memberId as string,
      clock: { now: () => new Date(NOW) },
      requestId: "r",
    },
    {
      purpose: "SPENDING_ANALYSIS",
      payload: {},
      buildPrompt: () => ({ system: "s", input: "{}" }),
      outputSchema,
    },
    { db, port: fake, config: cfg() },
  ).then(
    () => "ok",
    (e: { code: string }) => e.code,
  );
const mkFake = () =>
  new FakeLlmAdapter({ fixtures: { SPENDING_ANALYSIS: { ok: { summary: "ok" } } } });

beforeEach(async () => {
  await resetDb();
  process.env.AI_FEATURES_ENABLED = "true";
  resetLlmConfigForTests();
  setConsentTextsForTests(null);
  fx = await makeFamily();
});

describe("EN-005 opt-in de privacidade", () => {
  it("recursos nascem desligados; a importação de fatura tem texto próprio (US-066c)", async () => {
    const r = await settings();
    expect(r.status).toBe(200);
    expect(feature(r).state).toBe("OFF");
    expect(feature(r).available).toBe(true);
    expect(feature(r).currentText.version).toBe(1);
    const inv = r.body.features.find((f: { purpose: string }) => f.purpose === "INVOICE_IMPORT");
    expect(inv).toMatchObject({ available: true, state: "OFF" });
    expect(inv.currentText.version).toBe(1);
    expect(inv.currentText.summary).toMatch(/Anthropic/);
    expect(r.body.canEdit).toBe(true);
    expect(r.body.usage).not.toBeNull();
  });

  it("enable exige textVersion e familyVersion (400); só ADMIN (403); finalidade inválida (400) ou da R5 (422)", async () => {
    expect((await enable(mariana(), { familyVersion: 1 })).status).toBe(400);
    expect((await enable(mariana(), { textVersion: 1, familyVersion: 1, texto: "x" })).status).toBe(
      400,
    );
    const m = await enable(lucas());
    expect(m.status).toBe(403);
    expect(m.body.error.message).toBe("Só o Administrador pode ligar ou desligar");
    expect((await disable(lucas())).status).toBe(403);
    expect(
      (
        await at(() =>
          call(mariana(), "POST", "/api/v1/ai/consents/XPTO/enable", {
            textVersion: 1,
            familyVersion: 1,
          }),
        )
      ).status,
    ).toBe(400);
    setConsentTextsForTests({ SPENDING_ANALYSIS: AI_CONSENT_TEXTS.SPENDING_ANALYSIS as never });
    const inv = await at(() =>
      call(mariana(), "POST", "/api/v1/ai/consents/INVOICE_IMPORT/enable", {
        textVersion: 1,
        familyVersion: 1,
      }),
    );
    expect(inv).toMatchObject({ status: 422 });
    expect(inv.body.error.code).toBe("PURPOSE_NOT_AVAILABLE");
    expect(await events()).toHaveLength(0);
  });

  it("registra quem e quando (memberId, textVersion 1) e mostra 'Ligado por Mariana'", async () => {
    const r = await enable();
    expect(r.status).toBe(200);
    expect(feature(r).state).toBe("ON");
    expect(feature(r).lastChange).toMatchObject({
      action: "ENABLED",
      textVersion: 1,
      by: { name: "Mariana Silva", former: false },
    });
    const ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      action: "ENABLED",
      textVersion: 1,
      memberId: fx.byName.Mariana?.memberId,
    });
    expect(ev[0]?.createdAt.toISOString()).toBe(NOW.replace("Z", ".000Z"));
    expect(await db.familyEvent.count({ where: { type: "AI_CONSENT_CHANGED" } })).toBe(1);
    expect((await db.family.findUnique({ where: { id: fx.family.id } }))?.version).toBe(2);
  });

  it("membro comum lê o estado (sem consumo) mas não altera", async () => {
    await enable();
    const r = await settings(lucas());
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ canEdit: false, usage: null });
    expect(feature(r).state).toBe("ON");
  });

  it("autor ex-membro aparece como ex-membro (nome guardado)", async () => {
    await enable();
    await db.member.update({
      where: { id: fx.byName.Mariana?.memberId },
      data: { removedAt: new Date(NOW), removalKind: "REMOVED" },
    });
    expect(feature(await settings(lucas())).lastChange?.by).toMatchObject({
      name: "Mariana Silva",
      former: true,
    });
  });

  it("idempotência: mesma Idempotency-Key ⇒ 1 evento; já ligado ⇒ 200 sem novo evento; versão velha ⇒ 409", async () => {
    const key = randomUUID();
    expect((await enable(mariana(), undefined, key)).status).toBe(200);
    const replay = await enable(mariana(), undefined, key);
    expect(replay.status).toBe(200);
    expect(await events()).toHaveLength(1);
    // ligar de novo com chave nova e a versão atual (2): efetivo ⇒ sem evento
    expect((await enable(mariana(), { textVersion: 1, familyVersion: 2 })).status).toBe(200);
    expect(await events()).toHaveLength(1);
    // versão velha da família
    expect((await enable(mariana(), { textVersion: 1, familyVersion: 1 })).status).toBe(409);
    // desligar duas vezes ⇒ 1 evento DISABLED
    expect((await disable(mariana(), 2)).status).toBe(200);
    expect((await disable(mariana(), 3)).status).toBe(200);
    expect((await events()).map((e) => e.action)).toEqual(["ENABLED", "DISABLED"]);
  });

  it("recurso desligado bloqueia o envio: 409 AI_DISABLED, zero chamadas, sem reserva", async () => {
    const fake = mkFake();
    expect(await runOnce(fake)).toBe("AI_DISABLED");
    expect(fake.calls).toHaveLength(0);
    expect(await db.llmUsageEvent.count()).toBe(0);
    expect(await db.$queryRaw`SELECT 1 FROM llm_budget_months`).toHaveLength(0);
  });

  it("ligado envia; desligar vale na hora, não apaga dados e bloqueia o próximo envio", async () => {
    const fake = mkFake();
    await enable();
    expect(await runOnce(fake)).toBe("ok");
    const checksum = async () =>
      JSON.stringify([
        await db.transaction.count(),
        await db.bankAccount.count(),
        await db.category.count(),
        await db.llmUsageEvent.count(),
      ]);
    const before = await checksum();
    expect((await disable(mariana(), 2)).status).toBe(200);
    expect(await checksum()).toBe(before);
    expect(await runOnce(fake)).toBe("AI_DISABLED");
    expect(fake.calls).toHaveLength(1);
  });

  it("corrida desligar × envio: nenhuma chamada ao provedor começa depois do COMMIT do disable", async () => {
    for (let i = 0; i < 5; i++) {
      await resetDb();
      fx = await makeFamily();
      const fake = mkFake();
      await enable();
      const [res, disableDoneAt] = await Promise.all([
        runOnce(fake),
        disable(mariana(), 2).then((d) => {
          expect(d.status).toBe(200);
          return Date.now();
        }),
      ]);
      expect(["ok", "AI_DISABLED"]).toContain(res);
      for (const c of fake.calls) expect(c.startedAt).toBeLessThanOrEqual(disableDoneAt);
      // depois do disable confirmado, nada passa
      expect(await runOnce(fake)).toBe("AI_DISABLED");
    }
  });

  it("mudança de texto: v2 ⇒ NEEDS_RECONSENT; enable com v1 ⇒ 422; com v2 ⇒ ON; envio bloqueado enquanto isso", async () => {
    await enable();
    const v1 = AI_CONSENT_TEXTS.SPENDING_ANALYSIS;
    if (!v1) throw new Error("texto v1 ausente");
    setConsentTextsForTests({
      SPENDING_ANALYSIS: { ...v1, version: 2, summary: `${v1.summary} (novo)` },
    });
    const r = await settings();
    expect(feature(r).state).toBe("NEEDS_RECONSENT");
    const fake = mkFake();
    expect(await runOnce(fake)).toBe("AI_DISABLED");
    const old = await enable(mariana(), { textVersion: 1, familyVersion: 2 });
    expect(old.status).toBe(422);
    expect(old.body.error.code).toBe("CONSENT_TEXT_OUTDATED");
    const ok = await enable(mariana(), { textVersion: 2, familyVersion: 2 });
    expect(feature(ok).state).toBe("ON");
    expect(await runOnce(fake)).toBe("ok");
    expect((await events()).map((e) => e.textVersion)).toEqual([1, 2]);
  });

  it("registro append-only: UPDATE e DELETE recusados pelo banco", async () => {
    await enable();
    await expect(db.$executeRaw`UPDATE ai_consent_events SET "textVersion" = 9`).rejects.toThrow(
      /append-only/,
    );
    await expect(db.$executeRaw`DELETE FROM ai_consent_events`).rejects.toThrow(/append-only/);
    expect(await events()).toHaveLength(1);
  });

  it("isolamento: o consentimento de uma família não vale para outra", async () => {
    await enable();
    const other = await makeFamily({ uniqueEmails: true, name: "Outra" });
    const r = await at(() => call(other.byName.Mariana?.as ?? null, "GET", "/api/v1/ai/settings"));
    expect(feature(r).state).toBe("OFF");
  });

  it("IA indisponível (flag desligada): estado UNAVAILABLE e enable ⇒ 503", async () => {
    process.env.AI_FEATURES_ENABLED = "false";
    resetLlmConfigForTests();
    expect(feature(await settings()).state).toBe("UNAVAILABLE");
    const r = await enable();
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("AI_UNAVAILABLE");
  });
});
