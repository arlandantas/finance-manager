import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { type DoorCtx, type DoorState, validateSubmission } from "@/modules/lancamento/door";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type CardFixture, type FamilyFixture, makeCard, makeFamily } from "../support/factories";

// US-096d: a porta única só traduz; "Todo mês" com cartão chama POST /subscriptions (sem rota nova).
const db = testDb();
const NOW = "2026-11-10T15:00:00Z";
let fx: FamilyFixture;
let card: CardFixture;
let moradia: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const mid = () => fx.byName.Mariana?.memberId as string;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  card = await makeCard(fx, { name: "Nubank", owner: "Mariana", closingDay: 25, dueDay: 5 });
  moradia = (
    await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Moradia" } })
  ).id;
});

const ctx = (): DoorCtx => ({
  today: "2026-11-10",
  me: mid(),
  splitAvailable: true,
  splitBlocked: false,
  flags: { incomePlanned: false },
});
const state = (o: Partial<DoorState> = {}): DoorState => ({
  kind: "EXPENSE",
  when: "NOW",
  repeat: "MONTHLY",
  cents: 5590,
  description: "Netflix",
  categoryId: moradia,
  source: `card:${card.id}`,
  payerId: mid(),
  shared: true,
  sharedTouched: true,
  date: "",
  note: "",
  tags: [],
  installments: 1,
  paidBeforeApp: 0,
  paidAnchorOn: "",
  day: "10",
  startMonth: "2026-11",
  endKind: "NONE",
  endMonths: "",
  ...o,
});

const save = (o: Partial<DoorState> = {}) => {
  const v = validateSubmission(state(o), ctx());
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  expect(v.submission.service).toBe("SUBSCRIPTION");
  return withClock(NOW, () => call(mariana(), "POST", "/api/v1/subscriptions", v.submission.input));
};

describe("US-096d assinatura pela porta única", () => {
  it("dia de hoje: cria a assinatura e só a cobrança do dia (nenhuma compra avulsa extra)", async () => {
    const res = await save();
    expect(res.status).toBe(201);
    expect(await db.cardSubscription.count({ where: { familyId: fx.family.id } })).toBe(1);
    // A cobrança do dia é lançada ao abrir as telas (lançamento preguiçoso), nunca no cadastro.
    expect(await db.transaction.count({ where: { familyId: fx.family.id } })).toBe(0);
    await withClock(NOW, () => call(mariana(), "GET", "/api/v1/subscriptions"));
    const txs = await db.transaction.findMany({ where: { familyId: fx.family.id } });
    expect(txs).toHaveLength(1);
    expect(txs[0]?.origin).toBe("SUBSCRIPTION");
    expect(Number(txs[0]?.amountInCents)).toBe(5590);
  });

  it("dia futuro: só a assinatura, nenhuma Transaction", async () => {
    expect((await save({ day: "20" })).status).toBe(201);
    await withClock(NOW, () => call(mariana(), "GET", "/api/v1/subscriptions"));
    expect(await db.transaction.count({ where: { familyId: fx.family.id } })).toBe(0);
  });

  it("'Dividir' ligado na tela não vira divisão: a assinatura nasce 'Só meu' do próprio autor", async () => {
    const res = await save();
    expect(res.status).toBe(201);
    const sub = await db.cardSubscription.findFirstOrThrow({ where: { familyId: fx.family.id } });
    expect(sub.payerMemberId).toBe(mid());
  });

  it("em nome de outro membro: 403 PERSONAL_ON_BEHALF_FORBIDDEN (a tela desabilita, o servidor recusa)", async () => {
    const lucas = fx.byName.Lucas?.memberId as string;
    const res = await withClock(NOW, () =>
      call(mariana(), "POST", "/api/v1/subscriptions", {
        cardId: card.id,
        description: "Netflix",
        amountInCents: 5590,
        categoryId: moradia,
        payerMemberId: lucas,
        dayOfMonth: 10,
        end: { type: "NONE" },
      }),
    );
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).toContain("PERSONAL_ON_BEHALF_FORBIDDEN");
  });
});
