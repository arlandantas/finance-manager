import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { assertNoIdentifiers } from "@/modules/analise-ia/payload";
import { run } from "../../scripts/ai-admin";
import {
  consentOn,
  domainChecksum,
  enableAiFlag,
  freshFake,
  SILVA_NOW,
  seedSilva,
} from "../support/analise";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>, now = SILVA_NOW) => withClock(now, fn);

const analyze = async (period: string, as = lucas(), now = SILVA_NOW) => {
  const pv = await at(
    () => call(as, "GET", `/api/v1/ai/spending-analysis/preview?period=${period}`),
    now,
  );
  const r = await at(
    () =>
      call(as, "POST", "/api/v1/ai/spending-analyses", {
        period,
        previewHash: pv.body.previewHash,
      }),
    now,
  );
  expect(r.status).toBe(201);
  return r.body as { id: string };
};

beforeEach(async () => {
  await resetDb();
  enableAiFlag();
  freshFake();
  fx = await makeFamily();
  await seedSilva(fx);
  await consentOn(fx);
});

describe("US-073 histórico das análises e apagar o que foi enviado", () => {
  it("lista as análises, da mais recente para a mais antiga, com data e autor", async () => {
    const set = await analyze("2026-09", lucas(), "2026-10-20T15:00:00Z");
    const out = await analyze("2026-10", mariana(), "2026-11-05T15:00:00Z");
    const r = await at(() => call(lucas(), "GET", "/api/v1/ai/spending-analyses"));
    expect(r.body.items.map((i: { id: string }) => i.id)).toEqual([out.id, set.id]);
    expect(r.body.items[0]).toMatchObject({
      period: { key: "2026-10", label: "out/2026" },
      requestedBy: { name: "Mariana Silva" },
    });
    expect(r.body.items[1].period.label).toBe("set/2026");
    expect(typeof r.body.items[0].createdAt).toBe("string");
  });

  it("'O que foi enviado' é o payload gravado, sem nomes nem dados de conta", async () => {
    const a = await analyze("2026-10");
    const r = await at(() =>
      call(mariana(), "GET", `/api/v1/ai/spending-analyses/${a.id}/sent-data`),
    );
    expect(r.status).toBe(200);
    const row = await db.spendingAnalysis.findFirstOrThrow({ where: { id: a.id } });
    expect(r.body.payload).toEqual(row.payload);
    expect(() =>
      assertNoIdentifiers(r.body, [
        "Mariana",
        "Lucas",
        "Silva",
        "mariana@exemplo.com",
        "Nubank",
        "Streaming",
      ]),
    ).not.toThrow();
    expect(r.body.readable.recurring.length).toBeGreaterThan(0);
    expect(JSON.stringify(r.body.readable)).not.toMatch(/Streaming/);
    expect(r.body.period.label).toBe("out/2026");
  });

  it("apagar uma análise: some, dá 404 depois e o consumo fica com analysisId nulo", async () => {
    const a = await analyze("2026-10");
    const b = await analyze("2026-09");
    const evBefore = await db.llmUsageEvent.findMany({ where: { analysisId: a.id } });
    expect(evBefore).toHaveLength(1);
    const del = await at(() =>
      call(lucas(), "POST", `/api/v1/ai/spending-analyses/${a.id}/delete`, {}),
    );
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ deleted: 1 });
    expect(
      (await at(() => call(lucas(), "GET", `/api/v1/ai/spending-analyses/${a.id}`))).status,
    ).toBe(404);
    expect(
      (await at(() => call(lucas(), "POST", `/api/v1/ai/spending-analyses/${a.id}/delete`, {})))
        .status,
    ).toBe(404);
    const ev = await db.llmUsageEvent.findUniqueOrThrow({
      where: { id: evBefore[0]?.id as string },
    });
    expect(ev.analysisId).toBeNull();
    expect(Number(ev.costMicroBrl)).toBeGreaterThan(0); // o consumo (custo) permanece
    const list = await at(() => call(lucas(), "GET", "/api/v1/ai/spending-analyses"));
    expect(list.body.items.map((i: { id: string }) => i.id)).toEqual([b.id]);
  });

  it("apagar todo o histórico mantém descartes e lançamentos (checksum)", async () => {
    const a = await analyze("2026-10");
    await analyze("2026-09");
    const detail = await at(() => call(lucas(), "GET", `/api/v1/ai/spending-analyses/${a.id}`));
    const key = detail.body.avoidable.find(
      (x: { displayName: string }) => x.displayName === "Streaming X",
    ).key;
    await at(() =>
      call(lucas(), "POST", "/api/v1/ai/avoidable-dismissals", { analysisId: a.id, key }),
    );
    const before = await domainChecksum();
    const del = await at(() =>
      call(lucas(), "POST", "/api/v1/ai/spending-analyses/delete-all", {}),
    );
    expect(del.body).toEqual({ deleted: 2 });
    expect(await db.spendingAnalysis.count()).toBe(0);
    expect(await db.avoidableDismissal.count()).toBe(1);
    expect(await domainChecksum()).toBe(before);
    expect(
      (await at(() => call(lucas(), "GET", "/api/v1/ai/spending-analyses"))).body.items,
    ).toEqual([]);
    // apagar de novo é inofensivo
    expect(
      (await at(() => call(lucas(), "POST", "/api/v1/ai/spending-analyses/delete-all", {}))).body,
    ).toEqual({ deleted: 0 });
  });

  it("isolamento: apagar a análise de outra família ⇒ 404 e nada some; delete-all só da própria", async () => {
    const a = await analyze("2026-10");
    const other = await makeFamily({ name: "Outra", uniqueEmails: true });
    const o = other.members[0]?.as ?? null;
    expect(
      (await at(() => call(o, "POST", `/api/v1/ai/spending-analyses/${a.id}/delete`, {}))).status,
    ).toBe(404);
    expect(
      (await at(() => call(o, "POST", "/api/v1/ai/spending-analyses/delete-all", {}))).body,
    ).toEqual({ deleted: 0 });
    expect(await db.spendingAnalysis.count()).toBe(1);
  });

  it("apagar vale mesmo com a IA desligada (privacidade)", async () => {
    const a = await analyze("2026-10");
    await db.aiConsentEvent.create({
      data: {
        familyId: fx.family.id,
        purpose: "SPENDING_ANALYSIS",
        action: "DISABLED",
        textVersion: 1,
        memberId: fx.byName.Mariana?.memberId as string,
        createdAt: new Date("2026-11-06T00:00:00Z"),
      },
    });
    expect((await at(() => call(lucas(), "GET", "/api/v1/ai/spending-analyses"))).status).toBe(200);
    expect(
      (await at(() => call(lucas(), "POST", `/api/v1/ai/spending-analyses/${a.id}/delete`, {})))
        .status,
    ).toBe(200);
  });

  it("expurgo ai:purge-analyses apaga só análises com mais de 24 meses", async () => {
    const mk = (createdAt: string) =>
      db.spendingAnalysis.create({
        data: {
          familyId: fx.family.id,
          periodKey: "2026-10",
          partial: false,
          requestedByMemberId: fx.byName.Lucas?.memberId as string,
          model: "m",
          promptVersion: 1,
          payload: {},
          result: {},
          refMap: {},
          createdAt: new Date(createdAt),
        },
      });
    await mk("2026-10-01T00:00:00Z"); // 25 meses antes de 2028-11
    await mk("2027-01-01T00:00:00Z"); // 22 meses
    const out: string[] = [];
    expect(
      await run(db, ["purge-analyses"], (l) => out.push(l), new Date("2028-11-10T12:00:00Z")),
    ).toBe(0);
    expect(await db.spendingAnalysis.count()).toBe(1);
    expect(out[0]).toBe("análises apagadas: 1");
    expect(await run(db, ["purge-analyses", "--months", "0"], (l) => out.push(l))).toBe(2);
  });
});
