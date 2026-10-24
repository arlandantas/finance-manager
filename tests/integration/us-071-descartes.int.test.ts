import { beforeEach, describe, expect, it } from "vitest";
import { setDevClockOverride, withClock } from "@/lib/clock";
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
const at = <T>(fn: () => Promise<T>) => withClock(SILVA_NOW, fn);
type Avoidable = { key: string; displayName: string; kind: string };

const analyze = async (as = lucas()) => {
  const pv = await at(() => call(as, "GET", "/api/v1/ai/spending-analysis/preview?period=2026-10"));
  return at(() =>
    call(as, "POST", "/api/v1/ai/spending-analyses", {
      period: "2026-10",
      previewHash: pv.body.previewHash,
    }),
  );
};
const streamingKey = (a: { body: { avoidable: Avoidable[] } }) =>
  a.body.avoidable.find((x) => x.displayName === "Streaming X")?.key as string;
const dismiss = (analysisId: string, key: string, as = lucas(), reason?: string) =>
  at(() =>
    call(as, "POST", "/api/v1/ai/avoidable-dismissals", {
      analysisId,
      key,
      ...(reason ? { reason } : {}),
    }),
  );
const names = (r: { body: { avoidable: Avoidable[] } }) =>
  r.body.avoidable.map((a) => a.displayName);

beforeEach(async () => {
  await resetDb();
  enableAiFlag();
  freshFake();
  setDevClockOverride(null);
  fx = await makeFamily();
  await seedSilva(fx);
  await consentOn(fx);
});

describe("US-071 descartar sugestão de gasto evitável", () => {
  it("descartar tira o item da lista e não altera lançamentos (checksum)", async () => {
    const a = await analyze();
    expect(names(a)).toContain("Streaming X");
    const before = await domainChecksum();
    const d = await dismiss(a.body.id, streamingKey(a));
    expect(d.status).toBe(201);
    expect(d.body).toMatchObject({
      kind: "RECURRING",
      displayName: "Streaming X",
      categoryName: "Lazer",
      by: { name: "Lucas Silva" },
    });
    const again = await at(() => call(lucas(), "GET", `/api/v1/ai/spending-analyses/${a.body.id}`));
    expect(names(again)).not.toContain("Streaming X");
    expect(await domainChecksum()).toBe(before);
  });

  it("vale para toda a família: Mariana vê em 'descartadas' e a análise sem o item", async () => {
    const a = await analyze();
    await dismiss(a.body.id, streamingKey(a));
    const list = await at(() => call(mariana(), "GET", "/api/v1/ai/avoidable-dismissals"));
    expect(list.body.items).toHaveLength(1);
    expect(list.body.items[0]).toMatchObject({
      displayName: "Streaming X",
      by: { name: "Lucas Silva" },
    });
    const view = await at(() =>
      call(mariana(), "GET", `/api/v1/ai/spending-analyses/${a.body.id}`),
    );
    expect(names(view)).not.toContain("Streaming X");
  });

  it("a próxima análise respeita o descarte: o recorrente nem vai no payload; o motivo nunca sai do banco", async () => {
    const a = await analyze();
    await dismiss(a.body.id, streamingKey(a), lucas(), "Assinamos de propósito para as crianças");
    const fake = freshFake();
    const b = await analyze();
    expect(b.status).toBe(201);
    expect(names(b)).not.toContain("Streaming X");
    const sent = fake.calls[0]?.input ?? "";
    expect(
      JSON.parse(sent).recurring.some(
        (r: { monthlyAvgInCents: number }) => r.monthlyAvgInCents === 5590,
      ),
    ).toBe(false);
    expect(sent).not.toMatch(/propósito|crianças|Streaming/);
    const rows = await db.spendingAnalysis.findMany();
    for (const r of rows) {
      expect(JSON.stringify(r.payload)).not.toMatch(/propósito|crianças/);
    }
    expect((await db.avoidableDismissal.findFirstOrThrow()).reason).toContain("propósito");
  });

  it("voltar a sugerir: a análise seguinte pode apontar de novo", async () => {
    const a = await analyze();
    const d = await dismiss(a.body.id, streamingKey(a));
    const r = await at(() =>
      call(mariana(), "POST", `/api/v1/ai/avoidable-dismissals/${d.body.id}/restore`, {}),
    );
    expect(r.status).toBe(200);
    expect(await db.avoidableDismissal.count()).toBe(0);
    const again = await at(() => call(lucas(), "GET", `/api/v1/ai/spending-analyses/${a.body.id}`));
    expect(names(again)).toContain("Streaming X");
    const b = await analyze();
    expect(names(b)).toContain("Streaming X");
    // segundo restore: 404
    expect(
      (
        await at(() =>
          call(mariana(), "POST", `/api/v1/ai/avoidable-dismissals/${d.body.id}/restore`, {}),
        )
      ).status,
    ).toBe(404);
  });

  it("idempotente pela chave natural: dois pedidos geram um descarte", async () => {
    const a = await analyze();
    const k = streamingKey(a);
    const [x, y] = await Promise.all([dismiss(a.body.id, k), dismiss(a.body.id, k, mariana())]);
    expect([x.status, y.status]).toEqual([201, 201]);
    expect(x.body.id).toBe(y.body.id);
    expect(await db.avoidableDismissal.count()).toBe(1);
  });

  it("descartar uma categoria inteira: some dos evitáveis; a categoria segue no payload", async () => {
    const a = await analyze();
    const cat = a.body.avoidable.find((x: Avoidable) => x.kind === "CATEGORY") as Avoidable;
    expect(cat.displayName).toBe("Lazer");
    const d = await dismiss(a.body.id, cat.key);
    expect(d.body).toMatchObject({ kind: "CATEGORY", displayName: "Lazer" });
    const again = await at(() => call(lucas(), "GET", `/api/v1/ai/spending-analyses/${a.body.id}`));
    expect(again.body.avoidable.some((x: Avoidable) => x.kind === "CATEGORY")).toBe(false);
    const pv = await at(() =>
      call(lucas(), "GET", "/api/v1/ai/spending-analysis/preview?period=2026-10"),
    );
    expect(pv.body.payload.categories.some((c: { label: string }) => c.label === "Lazer")).toBe(
      true,
    );
  });

  it("validação e isolamento", async () => {
    const a = await analyze();
    expect((await dismiss(a.body.id, "R99")).status).toBe(400);
    expect((await dismiss(a.body.id, "xx")).status).toBe(400);
    expect((await dismiss(a.body.id, streamingKey(a), lucas(), "x".repeat(141))).status).toBe(400);
    expect((await dismiss("00000000-0000-4000-8000-000000000000", "R1")).status).toBe(404);
    const other = await makeFamily({ name: "Outra", uniqueEmails: true });
    const o = other.members[0]?.as ?? null;
    expect((await dismiss(a.body.id, streamingKey(a), o)).status).toBe(404);
    const d = await dismiss(a.body.id, streamingKey(a));
    expect(
      (await at(() => call(o, "POST", `/api/v1/ai/avoidable-dismissals/${d.body.id}/restore`, {})))
        .status,
    ).toBe(404);
    expect(
      (await at(() => call(o, "GET", "/api/v1/ai/avoidable-dismissals"))).body.items,
    ).toHaveLength(0);
  });
});
