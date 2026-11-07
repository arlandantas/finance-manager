import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  attachTags,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeTag,
  makeTransaction,
} from "../support/factories";
import { mulberry32 } from "../support/prng";

const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let itau: AccountFixture;
let nubank: CardFixture;
let n = 0;
const lucas = () => fx.byName.Lucas?.as ?? null;
let at = NOW; // o limite de requisições é por minuto do relógio: a propriedade avança um minuto por rodada
const analysis = (qs = "") =>
  withClock(at, () => call(lucas(), "GET", `/api/v1/analysis${qs ? `?${qs}` : ""}`));
const api = (url: string) => withClock(at, () => call(lucas(), "GET", url));
const t = () => new Date(Date.UTC(2026, 9, 1, 12, 0, ++n));
type Row = {
  key: string;
  kind: string;
  label: string;
  amountInCents: number;
  count: number;
  permille: number | null;
  drillUrl: string;
};
const byLabel = (rows: Row[], label: string) => rows.find((r) => r.label.startsWith(label));

beforeEach(async () => {
  await resetDb();
  n = 0;
  at = NOW;
  fx = await makeFamily();
  itau = await makeAccount(fx, {
    name: "Itaú Mariana",
    owner: "Mariana",
    openingBalanceInCents: 0,
  });
  nubank = await makeCard(fx, { name: "Nubank Lucas", owner: "Lucas", closingDay: 25, dueDay: 15 });
});

/** Viagem: Lazer 105000 (Mariana, conta) + Transporte 60000 (Lucas, cartão), ambos tag viagem-nordeste. */
async function seedTrip(extraTag?: string) {
  await makeTransaction(fx, {
    account: itau,
    category: "Lazer e restaurantes",
    amountInCents: 105000,
    occurredOn: "2026-10-03",
    payer: "Mariana",
    createdAt: t(),
    tags: ["viagem-nordeste"],
  });
  await makeCardPurchase(fx, {
    card: nubank,
    category: "Transporte",
    amountInCents: 60000,
    occurredOn: "2026-10-05",
    author: "Lucas",
    createdAt: t(),
    tags: ["viagem-nordeste", ...(extraTag ? [extraTag] : [])],
  });
}
async function seedUntagged() {
  await makeTransaction(fx, {
    account: itau,
    category: "Moradia",
    amountInCents: 30000,
    occurredOn: "2026-10-04",
    payer: "Mariana",
    createdAt: t(),
  });
}
const tagId = async (name: string) => (await makeTag(fx, name)).id;

describe("US-049 quebras da análise", () => {
  it("AC1: por tag mostra viagem-nordeste com R$ 1.650,00 e sem percentual", async () => {
    await seedTrip();
    const res = await analysis("groupBy=tag");
    expect(res.status).toBe(200);
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0]).toMatchObject({
      kind: "TAG",
      label: "viagem-nordeste",
      amountInCents: 165000,
      count: 2,
      permille: null,
    });
    expect(res.body.tagOverlapNotice).toBe(false);
  });

  it("AC2: filtro por tag + categoria => Lazer 63,6% e Transporte 36,4%", async () => {
    await seedTrip();
    await seedUntagged();
    const res = await analysis(`tagIds=${await tagId("viagem-nordeste")}`);
    const rows = res.body.rows as Row[];
    expect(rows.map((r) => [r.label, r.amountInCents, r.permille])).toEqual([
      ["Lazer e restaurantes", 105000, 636],
      ["Transporte", 60000, 364],
    ]);
  });

  it("AC3: por membro e por conta/cartão (cartão como CARD)", async () => {
    await seedTrip();
    const m = (await analysis("groupBy=member")).body.rows as Row[];
    expect(byLabel(m, "Mariana")).toMatchObject({ kind: "MEMBER", amountInCents: 105000 });
    expect(byLabel(m, "Lucas")).toMatchObject({ amountInCents: 60000 });
    const a = (await analysis("groupBy=account")).body.rows as Row[];
    expect(byLabel(a, "Itaú Mariana")).toMatchObject({ kind: "ACCOUNT", amountInCents: 105000 });
    expect(byLabel(a, "Nubank Lucas")).toMatchObject({ kind: "CARD", amountInCents: 60000 });
  });

  it("AC4: duas tags => linhas somam mais que o total, aviso e totals sem duplicar", async () => {
    await seedTrip("lazer-familia");
    const res = await analysis("groupBy=tag");
    expect(res.body.totals.expenseInCents).toBe(165000);
    expect(res.body.rowsTotalInCents).toBe(225000);
    expect(res.body.tagOverlapNotice).toBe(true);
    expect(res.body.rows).toHaveLength(2);
  });

  it("AC5: Sem tag é linha e o drillUrl (untagged) bate com o Extrato", async () => {
    await seedTrip();
    await seedUntagged();
    const res = await analysis("groupBy=tag");
    const none = byLabel(res.body.rows, "Sem tag") as Row;
    expect(none).toMatchObject({ kind: "NO_TAG", amountInCents: 30000, permille: null });
    expect(none.drillUrl).toContain("untagged=true");
    const ext = await api(`/api/v1/transactions?${none.drillUrl.split("?")[1]}`);
    expect(ext.body.totals.expenseInCents).toBe(30000);
    const withTag = await analysis(`groupBy=tag&tagIds=${await tagId("viagem-nordeste")}`);
    expect(byLabel(withTag.body.rows, "Sem tag")).toBeUndefined();
  });

  it("AC6: filtros combinados (membro Mariana + tag) => 105000; combinação vazia", async () => {
    await seedTrip();
    const mariana = fx.byName.Mariana?.memberId;
    const res = await analysis(`payerIds=${mariana}&tagIds=${await tagId("viagem-nordeste")}`);
    expect(res.body.totals.expenseInCents).toBe(105000);
    const empty = await analysis(`payerIds=${mariana}&sourceIds=${nubank.id}`);
    expect(empty.body.isEmpty).toBe(true);
    expect(empty.body.rows).toEqual([]);
  });

  it("tags e untagged juntos => 400", async () => {
    const res = await analysis(`groupBy=tag&untagged=true&tagIds=${await tagId("x-tag")}`);
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe('Use tags ou "sem tag", não os dois');
  });

  it("ex-membro aparece em groupBy=member com archived=true", async () => {
    await seedTrip();
    await testDb().member.update({
      where: { id: fx.byName.Mariana?.memberId as string },
      data: {
        removedAt: new Date(),
        removalKind: "REMOVED",
        removedByMemberId: fx.byName.Lucas?.memberId as string,
      },
    });
    const rows = (await analysis("groupBy=member")).body.rows as Array<Row & { archived: boolean }>;
    expect(byLabel(rows, "Mariana")).toMatchObject({ archived: true, amountInCents: 105000 });
    expect(byLabel(rows, "Lucas")).toMatchObject({ archived: false });
  });

  it("dados de outra família nunca aparecem em member, account e tag", async () => {
    await seedTrip();
    const other = await makeFamily({
      members: [{ email: "x49@exemplo.com", name: "Xis", role: "ADMIN" }],
    });
    const oa = await makeAccount(other, { name: "Outra Conta", owner: "Xis" });
    await makeTransaction(other, {
      account: oa,
      category: "Moradia",
      amountInCents: 99999,
      occurredOn: "2026-10-03",
      tags: ["tag-alheia"],
    });
    for (const g of ["member", "account", "tag"]) {
      const res = await analysis(`groupBy=${g}`);
      const labels = (res.body.rows as Row[]).map((r) => r.label).join("|");
      expect(labels).not.toMatch(/Xis|Outra Conta|tag-alheia/);
      expect(res.body.rowsTotalInCents).toBeLessThanOrEqual(225000);
    }
  });

  it("limite de 20 ids (21 => 400) e COUNT(DISTINCT) com duas tags", async () => {
    const id = (i: number) => `${String(i).padStart(8, "0")}-1111-4111-8111-111111111111`;
    const ids = Array.from({ length: 21 }, (_, i) => `tagIds=${id(i)}`).join("&");
    expect((await analysis(`groupBy=tag&${ids}`)).status).toBe(400);
    await seedTrip("lazer-familia");
    const rows = (await analysis("groupBy=tag")).body.rows as Row[];
    expect(byLabel(rows, "viagem-nordeste")?.count).toBe(2);
    expect(byLabel(rows, "lazer-familia")?.count).toBe(1);
  });

  it("AC8: reconciliação com 200 conjuntos aleatórios de filtros", async () => {
    const rnd = mulberry32(49);
    const pick = <T>(xs: T[]) => xs[Math.floor(rnd() * xs.length)] as T;
    const cats = ["Supermercado", "Moradia", "Lazer e restaurantes", "Transporte"];
    const tagNames = ["a-tag", "b-tag", "c-tag"];
    for (let i = 0; i < 30; i++) {
      const day = String(1 + Math.floor(rnd() * 27)).padStart(2, "0");
      const tags = tagNames.filter(() => rnd() < 0.35);
      const common = {
        category: pick(cats),
        amountInCents: 1 + Math.floor(rnd() * 90000),
        occurredOn: `2026-10-${day}`,
        payer: pick(["Lucas", "Mariana"]),
        tags,
        createdAt: t(),
      };
      if (rnd() < 0.2)
        await makeTransaction(fx, {
          account: itau,
          ...common,
          type: "INCOME",
          category: "Salário",
        });
      else if (rnd() < 0.7) await makeTransaction(fx, { account: itau, ...common });
      else await makeCardPurchase(fx, { card: nubank, ...common });
    }
    const ids = await Promise.all(tagNames.map(tagId));
    const catIds = ((await call(lucas(), "GET", "/api/v1/categories")).body.items ?? []).map(
      (c: { id: string }) => c.id,
    );
    const members = fx.members.map((m) => m.memberId);
    const sources = [itau.id, nubank.id];
    for (let i = 0; i < 200; i++) {
      at = new Date(Date.parse(NOW) + i * 61_000).toISOString();
      const qs = new URLSearchParams({ period: "2026-10", type: pick(["EXPENSE", "INCOME"]) });
      qs.set("groupBy", pick(["category", "member", "account", "tag"]));
      if (rnd() < 0.4) qs.append("payerIds", pick(members));
      if (rnd() < 0.4) qs.append("sourceIds", pick(sources));
      if (rnd() < 0.3 && catIds.length) qs.append("categoryIds", pick(catIds));
      if (rnd() < 0.35) qs.append("tagIds", pick(ids));
      else if (rnd() < 0.2) qs.set("untagged", "true");
      const a = await analysis(qs.toString());
      expect(a.status, qs.toString()).toBe(200);
      const filter = new URLSearchParams(qs);
      filter.delete("groupBy");
      filter.delete("type"); // os totais da análise cobrem os dois lados
      const ext = await api(`/api/v1/transactions?${filter}`);
      expect(a.body.totals.expenseInCents, qs.toString()).toBe(ext.body.totals.expenseInCents);
      expect(a.body.totals.incomeInCents, qs.toString()).toBe(ext.body.totals.incomeInCents);
      const side =
        qs.get("type") === "EXPENSE" ? a.body.totals.expenseInCents : a.body.totals.incomeInCents;
      const rows = a.body.rows as Row[];
      const sum = rows.reduce((s, r) => s + r.amountInCents, 0);
      if (qs.get("groupBy") === "tag") {
        expect(sum, qs.toString()).toBeGreaterThanOrEqual(0);
        expect(a.body.tagOverlapNotice).toBe(sum > side);
        continue;
      }
      expect(sum, qs.toString()).toBe(side);
      for (const r of rows) {
        const d = await api(`/api/v1/transactions?${r.drillUrl.split("?")[1]}`);
        expect(d.status, `${r.drillUrl} ${JSON.stringify(d.body)}`).toBe(200);
        const got =
          qs.get("type") === "EXPENSE" ? d.body.totals.expenseInCents : d.body.totals.incomeInCents;
        expect(got, r.drillUrl).toBe(r.amountInCents);
      }
    }
  }, 120_000);
});
