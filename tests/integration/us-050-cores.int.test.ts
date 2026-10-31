import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeTransaction,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const post = (path: string, body: Record<string, unknown>, as = mariana()) =>
  at(() => call(as, "POST", path, body));
const patch = (path: string, body: Record<string, unknown>, as = mariana()) =>
  at(() => call(as, "PATCH", path, body));
const newAccount = (name: string, extra: Record<string, unknown> = {}, as = mariana()) =>
  post("/api/v1/accounts", { name, type: "CHECKING", ...extra }, as);
const newCard = (name: string, extra: Record<string, unknown> = {}, as = mariana()) =>
  post("/api/v1/cards", { name, limitInCents: 500000, closingDay: 25, dueDay: 5, ...extra }, as);

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
});

describe("US-050 Cor das contas e cartões novos", () => {
  it("conta nova recebe a 1ª cor não usada (BLUE e GREEN em uso => PURPLE)", async () => {
    await makeAccount(fx, { name: "Itaú Mariana", color: "BLUE" });
    await makeAccount(fx, { name: "Nubank Conjunta", color: "GREEN" });
    const res = await newAccount("Poupança");
    expect(res.status).toBe(201);
    expect(res.body.color).toBe("PURPLE");
  });

  it("sem nenhuma conta => BLUE; o cartão também escolhe entre contas e cartões", async () => {
    expect((await newAccount("Primeira")).body.color).toBe("BLUE");
    const card = await newCard("Nubank Lucas");
    expect(card.status).toBe(201);
    expect(card.body.card.color).toBe("GREEN");
    expect((await newAccount("Terceira")).body.color).toBe("PURPLE");
  });

  it("color informado vence; valor fora da paleta => 400 'Escolha uma cor'", async () => {
    expect((await newAccount("Laranja", { color: "ORANGE" })).body.color).toBe("ORANGE");
    expect((await newCard("Rosa", { color: "PINK" })).body.card.color).toBe("PINK");
    const bad = await newAccount("Hex", { color: "#ff0000" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].message).toBe("Escolha uma cor");
    expect((await newCard("Hex", { color: "azul" })).status).toBe(400);
  });

  it("arquivadas contam como usadas; excluídas não", async () => {
    const a = await makeAccount(fx, { name: "Velha", color: "BLUE" });
    await db.bankAccount.update({ where: { id: a.id }, data: { archivedAt: new Date() } });
    expect((await newAccount("Nova 1")).body.color).toBe("GREEN");
    await db.bankAccount.update({
      where: { id: a.id },
      data: { archivedAt: null, deletedAt: new Date() },
    });
    expect((await newAccount("Nova 2")).body.color).toBe("BLUE");
  });
});

describe("US-050 Editar a cor", () => {
  it("PATCH da conta: troca a cor, pode repetir a de outra e incrementa a versão", async () => {
    const itau = await makeAccount(fx, { name: "Itaú Mariana", color: "BLUE" });
    const nu = await makeAccount(fx, { name: "Nubank Conjunta", color: "GREEN" });
    const r1 = await patch(`/api/v1/accounts/${itau.id}`, { version: 1, color: "ORANGE" });
    expect(r1.status).toBe(200);
    expect(r1.body).toMatchObject({ color: "ORANGE", name: "Itaú Mariana", version: 2 });
    const r2 = await patch(`/api/v1/accounts/${nu.id}`, { version: 1, color: "ORANGE" });
    expect(r2.status).toBe(200);
    expect(r2.body.color).toBe("ORANGE");
    const list = await at(() => call(mariana(), "GET", "/api/v1/accounts"));
    expect(list.body.items.map((a: { color: string }) => a.color)).toEqual(["ORANGE", "ORANGE"]);
  });

  it("conta: cor inválida => 400; versão velha => 409; nada para alterar => 400", async () => {
    const itau = await makeAccount(fx, { name: "Itaú Mariana" });
    const bad = await patch(`/api/v1/accounts/${itau.id}`, { version: 1, color: "LILAS" });
    expect(bad.status).toBe(400);
    expect(bad.body.error.details[0].message).toBe("Escolha uma cor");
    await patch(`/api/v1/accounts/${itau.id}`, { version: 1, color: "RED" });
    const stale = await patch(`/api/v1/accounts/${itau.id}`, { version: 1, color: "TEAL" });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect((await patch(`/api/v1/accounts/${itau.id}`, { version: 2 })).status).toBe(400);
  });

  it("PATCH do cartão: troca a cor sem mexer no ciclo; CYCLE_LOCKED continua valendo", async () => {
    const card = await makeCard(fx, { name: "Nubank Lucas", color: "BLUE" });
    await makeCardPurchase(fx, { card, amountInCents: 1000, occurredOn: "2026-10-03" });
    const ok = await patch(`/api/v1/cards/${card.id}`, { version: 1, color: "PURPLE" });
    expect(ok.status).toBe(200);
    expect(ok.body.card).toMatchObject({ color: "PURPLE", version: 2, cycleLocked: true });
    // mesma cor: 200 sem mudar a versão
    const same = await patch(`/api/v1/cards/${card.id}`, { version: 2, color: "PURPLE" });
    expect(same.status).toBe(200);
    expect(same.body.card.version).toBe(2);
    const locked = await patch(`/api/v1/cards/${card.id}`, { version: 2, closingDay: 20 });
    expect(locked.status).toBe(422);
    expect(locked.body.error.code).toBe("CYCLE_LOCKED");
    const bad = await patch(`/api/v1/cards/${card.id}`, { version: 2, color: "x" });
    expect(bad.status).toBe(400);
  });

  it("isolamento: PATCH de conta/cartão de outra família => 404", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const acc = await makeAccount(other, { name: "Alheia" });
    const card = await makeCard(other, { name: "Cartão alheio" });
    expect((await patch(`/api/v1/accounts/${acc.id}`, { version: 1, color: "RED" })).status).toBe(
      404,
    );
    expect((await patch(`/api/v1/cards/${card.id}`, { version: 1, color: "RED" })).status).toBe(
      404,
    );
  });

  it("arquivar e reativar mantêm a cor", async () => {
    const poup = await makeAccount(fx, { name: "Poupança", color: "PINK" });
    const card = await makeCard(fx, { name: "Cartão", color: "BROWN" });
    const arch = await at(() =>
      call(mariana(), "POST", `/api/v1/accounts/${poup.id}/archive`, { version: 1 }),
    );
    expect(arch.body.account).toMatchObject({ archived: true, color: "PINK" });
    const un = await at(() =>
      call(mariana(), "POST", `/api/v1/accounts/${poup.id}/unarchive`, { version: 2 }),
    );
    expect(un.body.account.color).toBe("PINK");
    const carch = await at(() =>
      call(lucas(), "POST", `/api/v1/cards/${card.id}/archive`, { version: 1 }),
    );
    expect(carch.body.card).toMatchObject({ archived: true, color: "BROWN" });
    const cl = await at(() => call(mariana(), "GET", "/api/v1/cards?archived=true"));
    expect(cl.body.items[0].color).toBe("BROWN");
  });
});

describe("US-050 Cor nos DTOs de lançamento", () => {
  it("GET /transactions e /transactions/:id trazem account.color e card.color", async () => {
    const itau = await makeAccount(fx, { name: "Itaú Mariana", color: "ORANGE" });
    const card = await makeCard(fx, { name: "Nubank Lucas", color: "PURPLE" });
    const t1 = await makeTransaction(fx, {
      account: itau,
      category: "Supermercado",
      amountInCents: 1000,
      occurredOn: "2026-10-03",
    });
    await makeCardPurchase(fx, { card, amountInCents: 2000, occurredOn: "2026-10-04" });
    const res = await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10"));
    expect(res.status).toBe(200);
    const items = res.body.items as Array<{
      account: { color: string } | null;
      card: { color: string } | null;
    }>;
    expect(items.map((i) => i.account?.color ?? i.card?.color).sort()).toEqual([
      "ORANGE",
      "PURPLE",
    ]);
    const detail = await at(() => call(mariana(), "GET", `/api/v1/transactions/${t1.id}`));
    expect(detail.body.transaction.account).toMatchObject({
      name: "Itaú Mariana",
      color: "ORANGE",
    });
  });

  it("alterar a cor reflete no extrato (a cor vem da conta)", async () => {
    const itau = await makeAccount(fx, { name: "Itaú Mariana", color: "BLUE" });
    await makeTransaction(fx, {
      account: itau,
      category: "Supermercado",
      amountInCents: 1000,
      occurredOn: "2026-10-03",
    });
    await patch(`/api/v1/accounts/${itau.id}`, { version: 1, color: "TEAL" });
    const res = await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10"));
    expect(res.body.items[0].account.color).toBe("TEAL");
  });
});

describe("US-050 Migração us050_cores (backfill, SDD-017 §4.1)", () => {
  const sql = readFileSync("prisma/migrations/20261031010000_us050_cores/migration.sql", "utf8");
  const start = sql.indexOf("WITH src AS");
  const end = sql.indexOf("ALTER TABLE", start);
  const backfill = sql
    .slice(start, end)
    .split(/;\s*\n/)
    .filter((s) => s.trim());
  const ORDER = [
    "BLUE",
    "GREEN",
    "PURPLE",
    "ORANGE",
    "PINK",
    "TEAL",
    "RED",
    "YELLOW",
    "GRAY",
    "BROWN",
  ];

  async function runBackfill() {
    await db.$executeRawUnsafe(`UPDATE bank_accounts SET color = 'BROWN'`);
    await db.$executeRawUnsafe(`UPDATE credit_cards SET color = 'BROWN'`);
    for (const stmt of backfill) await db.$executeRawUnsafe(stmt);
  }
  const colorsOf = async (familyId: string) => {
    const a = await db.bankAccount.findMany({ where: { familyId } });
    const c = await db.creditCard.findMany({ where: { familyId } });
    return [
      ...a.map((x) => ({ id: x.id, at: x.createdAt, color: x.color })),
      ...c.map((x) => ({ id: x.id, at: x.createdAt, color: x.color })),
    ]
      .sort((x, y) => x.at.getTime() - y.at.getTime())
      .map((x) => x.color);
  };
  /** Cria N fontes (conta/cartão alternados) com createdAt crescente. */
  async function seed(f: FamilyFixture, kinds: Array<"A" | "C">, t0 = Date.UTC(2026, 0, 1)) {
    let i = 0;
    for (const k of kinds) {
      const at = new Date(t0 + i * 60_000);
      if (k === "A") {
        const a = await makeAccount(f, { name: `Conta ${i}` });
        await db.bankAccount.update({ where: { id: a.id }, data: { createdAt: at } });
      } else {
        const c = await makeCard(f, { name: `Cartão ${i}` });
        await db.creditCard.update({ where: { id: c.id }, data: { createdAt: at } });
      }
      i++;
    }
  }

  it("3 contas e 2 cartões (createdAt crescentes) => BLUE, GREEN, PURPLE, ORANGE, PINK", async () => {
    await seed(fx, ["A", "A", "C", "A", "C"]);
    await runBackfill();
    expect(await colorsOf(fx.family.id)).toEqual(ORDER.slice(0, 5));
  });

  it("12 fontes: a 11ª volta a BLUE e a 12ª é GREEN (ciclo de 10)", async () => {
    await seed(
      fx,
      Array.from({ length: 12 }, (_, i) => (i % 3 === 2 ? "C" : "A")),
    );
    await runBackfill();
    const got = await colorsOf(fx.family.id);
    expect(got.slice(10)).toEqual(["BLUE", "GREEN"]);
    expect(got.slice(0, 10)).toEqual(ORDER);
  });

  it("famílias independentes; arquivadas/excluídas entram na ordenação; idempotente", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    await seed(fx, ["A", "A", "A"]);
    await seed(other, ["A", "C"]);
    const first = await db.bankAccount.findMany({
      where: { familyId: fx.family.id },
      orderBy: { createdAt: "asc" },
    });
    await db.bankAccount.update({ where: { id: first[0]?.id }, data: { deletedAt: new Date() } });
    await db.bankAccount.update({ where: { id: first[1]?.id }, data: { archivedAt: new Date() } });
    await runBackfill();
    expect(await colorsOf(fx.family.id)).toEqual(["BLUE", "GREEN", "PURPLE"]);
    expect(await colorsOf(other.family.id)).toEqual(["BLUE", "GREEN"]);
    const snap = JSON.stringify(await db.bankAccount.findMany({ orderBy: { id: "asc" } }));
    for (const stmt of backfill) await db.$executeRawUnsafe(stmt);
    expect(JSON.stringify(await db.bankAccount.findMany({ orderBy: { id: "asc" } }))).toBe(snap);
  });

  it("coluna NOT NULL com DEFAULT BLUE (compatível com a versão anterior)", async () => {
    const cols = await db.$queryRaw<
      Array<{ table_name: string; is_nullable: string; column_default: string }>
    >`
      SELECT table_name, is_nullable, column_default FROM information_schema.columns
      WHERE column_name = 'color' AND table_name IN ('bank_accounts', 'credit_cards')`;
    expect(cols).toHaveLength(2);
    for (const c of cols) {
      expect(c.is_nullable).toBe("NO");
      expect(c.column_default).toContain("BLUE");
    }
  });
});
