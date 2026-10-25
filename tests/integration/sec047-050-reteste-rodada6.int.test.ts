import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makePlannedExpense,
  makeTransaction,
} from "../support/factories";

// Reteste da rodada 6 (reteste-rodada6-2026-10-26): SEC-047..050 (D-GES-57). As provas do relatório viram regressão.
// SEC-047 (titular do cartão) está em sec042-046-so-meu-reteste.int.test.ts.
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
let accCarla: AccountFixture;
let accMariana: AccountFixture;
const as = (n: string) => fx.byName[n]?.as ?? null;
const idOf = (n: string) => fx.byName[n]?.memberId as string;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({
    members: [
      { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" },
      { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
      { email: "carla@exemplo.com", name: "Carla Silva", role: "MEMBER" },
      { email: "bia@exemplo.com", name: "Bia Silva", role: "MEMBER" },
    ],
  });
  accCarla = await makeAccount(fx, {
    name: "Conta da Carla",
    owner: "Carla",
    openingBalanceInCents: 100000,
  });
  accMariana = await makeAccount(fx, {
    name: "Conta da Mariana",
    owner: "Mariana",
    openingBalanceInCents: 100000,
  });
});

const removeLucas = () =>
  db.member.update({
    where: { id: idOf("Lucas") },
    data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
  });
const mk = (amountInCents = 30000, description = "Farmácia") =>
  makeTransaction(fx, {
    account: accCarla,
    category: "Supermercado",
    amountInCents,
    occurredOn: "2026-10-02",
    payer: "Lucas",
    author: "Lucas",
    shared: false,
    description,
  });
const patch = (who: string, id: string, version: number, body: Record<string, unknown>) =>
  at(() => call(as(who), "PATCH", `/api/v1/transactions/${id}`, { version, ...body }));
const txRow = (id: string) => db.transaction.findUniqueOrThrow({ where: { id } });
type SRow = { member: { name: string }; differenceInCents: number };
const settlement = async (who = "Bia") => {
  const res = await at(() => call(as(who), "GET", "/api/v1/settlement?period=2026-10"));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.members as SRow[];
};

// ---------------------------------------------------------------------------------------------------------------
describe("SEC-048 ao dividir o 'Só meu' de ex-membro, o pagador continua o ex-membro", () => {
  it("prova do relatório: Admin dividir e se pôr como pagador (ou outro ativo) ⇒ 403; o acerto não muda", async () => {
    const t = await mk();
    await removeLucas();
    const before = await settlement();
    for (const body of [
      { isSharedExpense: true, payerMemberId: idOf("Mariana"), accountId: accMariana.id },
      { isSharedExpense: true, payerMemberId: idOf("Carla") },
      { isSharedExpense: true, payerMemberId: idOf("Bia") },
    ]) {
      const res = await patch("Mariana", t.id, 1, body);
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
      expect(res.body.error.message).toBe("Ao dividir, o pagador continua sendo quem pagou.");
    }
    const row = await txRow(t.id);
    expect(row.isSharedExpense).toBe(false);
    expect(row.payerMemberId).toBe(idOf("Lucas"));
    expect(row.accountId).toBe(accCarla.id);
    expect(row.version).toBe(1);
    expect(await settlement()).toEqual(before);
  });

  it("só dividir (ou reenviar o próprio ex-membro como pagador) vale: o pagador continua Lucas e ele é o credor", async () => {
    const a = await mk(30000, "Farmácia");
    const b = await mk(10000, "Terapia");
    await removeLucas();
    expect((await patch("Mariana", a.id, 1, { isSharedExpense: true })).status).toBe(200);
    const same = await patch("Mariana", b.id, 1, {
      isSharedExpense: true,
      payerMemberId: idOf("Lucas"),
      accountId: accMariana.id,
    });
    expect(same.status, JSON.stringify(same.body)).toBe(200);
    for (const id of [a.id, b.id]) {
      const row = await txRow(id);
      expect(row.isSharedExpense).toBe(true);
      expect(row.payerMemberId).toBe(idOf("Lucas"));
    }
    const rows = await settlement();
    const get = (n: string) => rows.find((r) => r.member.name.startsWith(n))?.differenceInCents;
    expect(get("Mariana")).toBeLessThan(0); // Mariana não ganha crédito algum
    expect(get("Lucas")).toBeGreaterThan(0);
  });

  it("DEV-129 segue valendo enquanto 'Só meu': o Admin assume em nome próprio; para terceiro, 403", async () => {
    const t = await mk();
    await removeLucas();
    const toCarla = await patch("Mariana", t.id, 1, { payerMemberId: idOf("Carla") });
    expect(toCarla.status).toBe(403);
    expect(toCarla.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
    const ok = await patch("Mariana", t.id, 1, { payerMemberId: idOf("Mariana") });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect((await txRow(t.id)).payerMemberId).toBe(idOf("Mariana"));
  });

  it("prevista e série: dividir mantém o responsável ex-membro; trocar o responsável ao dividir ⇒ 403", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Escola",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
    });
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Moradia" },
    });
    const created = await at(() =>
      call(as("Lucas"), "POST", "/api/v1/recurring-expenses", {
        description: "Academia",
        amountInCents: 10000,
        categoryId: cat.id,
        isSharedExpense: false,
        paymentAccountId: accCarla.id,
        dayOfMonth: 5,
        startMonth: "2026-10",
        end: { kind: "COUNT", months: 2 },
      }),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const s = created.body.series as { id: string; version: number };
    await removeLucas();
    const pUrl = `/api/v1/planned-expenses/${p.id}`;
    const sUrl = `/api/v1/recurring-expenses/${s.id}`;
    for (const [url, version] of [
      [pUrl, 1],
      [sUrl, s.version],
    ] as const) {
      for (const who of ["Mariana", "Carla"]) {
        const res = await at(() =>
          call(as(who), "PATCH", url, {
            version,
            isSharedExpense: true,
            responsibleMemberId: idOf(who),
          }),
        );
        expect(res.status, `${who} ${url}`).toBe(403);
      }
    }
    expect(
      (await db.plannedExpense.findUniqueOrThrow({ where: { id: p.id } })).responsibleMemberId,
    ).toBe(idOf("Lucas"));
    const okP = await at(() =>
      call(as("Mariana"), "PATCH", pUrl, { version: 1, isSharedExpense: true }),
    );
    expect(okP.status, JSON.stringify(okP.body)).toBe(200);
    const okS = await at(() =>
      call(as("Mariana"), "PATCH", sUrl, {
        version: s.version,
        isSharedExpense: true,
        responsibleMemberId: idOf("Lucas"),
      }),
    );
    expect(okS.status, JSON.stringify(okS.body)).toBe(200);
    expect(
      (await db.plannedExpense.findUniqueOrThrow({ where: { id: p.id } })).responsibleMemberId,
    ).toBe(idOf("Lucas"));
    expect(
      (await db.recurringExpense.findUniqueOrThrow({ where: { id: s.id } })).responsibleMemberId,
    ).toBe(idOf("Lucas"));
  });
});
