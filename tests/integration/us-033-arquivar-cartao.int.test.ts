import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z"; // fechamento dia 25: fatura aberta = out (fecha 25/10)
let fx: FamilyFixture;
let acc: AccountFixture;
let nubank: CardFixture; // com compras já pagas
let novo: CardFixture; // nunca usado
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const act = (as: ReturnType<typeof mariana>, id: string, a: string, version = 1) =>
  at(() => call(as, "POST", `/api/v1/cards/${id}/${a}`, { version }));
const cat = async (n: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: n } })).id;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 500000 });
  nubank = await makeCard(fx, { name: "Nubank Lucas", owner: "Lucas", closingDay: 25, dueDay: 5 });
  novo = await makeCard(fx, { name: "Cartão novo", owner: "Mariana", closingDay: 25, dueDay: 5 });
  // compra de agosto já paga
  await makeCardPurchase(fx, {
    card: nubank,
    amountInCents: 10000,
    occurredOn: "2026-08-10",
    author: "Lucas",
  });
  const inv = await makeInvoice(fx, nubank, "2026-08");
  await makeInvoicePayment(fx, {
    card: nubank,
    invoice: inv,
    account: acc,
    amountInCents: 10000,
    paidOn: "2026-09-02",
    author: "Lucas",
  });
});

describe("US-033 arquivar, reativar e excluir cartão", () => {
  it("sem pendências arquiva; some da lista padrão e aparece em ?archived=true; compras antigas ficam com marcador", async () => {
    const r = await act(mariana(), nubank.id, "archive");
    expect(r.status).toBe(200);
    expect(r.body.card).toMatchObject({ archived: true, version: 2 });
    const active = await at(() => call(mariana(), "GET", "/api/v1/cards"));
    expect(active.body.items.map((c: { name: string }) => c.name)).toEqual(["Cartão novo"]);
    const arch = await at(() => call(mariana(), "GET", "/api/v1/cards?archived=true"));
    expect(arch.body.items.map((c: { name: string }) => c.name)).toEqual(["Nubank Lucas"]);
    const ext = await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-08"));
    const row = ext.body.items.find((i: { card: unknown }) => i.card);
    expect(row.card).toMatchObject({ name: "Nubank Lucas", archived: true });
  });

  it("fatura fechada não paga bloqueia (com a referência); fatura aberta com compras bloqueia", async () => {
    await makeCardPurchase(fx, {
      card: nubank,
      amountInCents: 47900,
      occurredOn: "2026-09-10",
      author: "Lucas",
    }); // fatura set fechada
    const a = await act(mariana(), nubank.id, "archive");
    expect(a.status).toBe(422);
    expect(a.body.error.code).toBe("CARD_HAS_UNPAID_INVOICE");
    expect(a.body.error.message).toBe("Pague a fatura antes de arquivar o cartão");
    expect(a.body.error.details.ref).toBe("2026-09");
    await resetDb();
    fx = await makeFamily();
    nubank = await makeCard(fx, {
      name: "Nubank Lucas",
      owner: "Lucas",
      closingDay: 25,
      dueDay: 5,
    });
    await makeCardPurchase(fx, {
      card: nubank,
      amountInCents: 9000,
      occurredOn: "2026-10-05",
      author: "Lucas",
    });
    const b = await act(mariana(), nubank.id, "archive");
    expect(b.body.error.code).toBe("CARD_HAS_OPEN_PURCHASES");
    expect(b.body.error.message).toBe(
      "Há compras na fatura aberta. Pague a fatura quando ela fechar para arquivar.",
    );
  });

  it("reativar volta o cartão; excluir só ADMIN e só sem compras; libera o nome; arquivado ocupa o nome", async () => {
    await act(mariana(), nubank.id, "archive");
    const re = await act(lucas(), nubank.id, "unarchive", 2);
    expect(re.status).toBe(200);
    expect((await act(lucas(), novo.id, "delete")).status).toBe(403);
    expect((await act(mariana(), nubank.id, "delete", 3)).body.error.code).toBe("CARD_HAS_HISTORY");
    expect((await act(mariana(), novo.id, "delete")).body).toEqual({ deleted: true });
    const make = (name: string) =>
      at(() =>
        call(mariana(), "POST", "/api/v1/cards", {
          name,
          limitInCents: 100000,
          closingDay: 25,
          dueDay: 5,
        }),
      );
    expect((await make("Cartão novo")).status).toBe(201);
    await act(mariana(), nubank.id, "archive", 3);
    const dup = await make("Nubank Lucas");
    expect(dup.status).toBe(409);
  });

  it("cartão arquivado não recebe compra nova; versão antiga => 409; outra família => 404", async () => {
    await act(mariana(), nubank.id, "archive");
    const buy = await at(async () =>
      call(lucas(), "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        cardId: nubank.id,
        categoryId: await cat("Supermercado"),
        amountInCents: 1000,
      }),
    );
    expect(buy.status).toBe(422);
    expect(buy.body.error.code).toBe("INVALID_REFERENCE");
    const stale = await act(lucas(), nubank.id, "archive", 1);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(stale.body.error.message).toBe(
      "Este cartão foi alterado por Mariana. Recarregue para continuar.",
    );
    const other = await makeFamily({ uniqueEmails: true, name: "Souza" });
    expect((await act(other.members[0]?.as ?? null, nubank.id, "archive")).status).toBe(404);
  });

  it("corrida: arquivar × comprar nas duas ordens nunca deixa cartão arquivado com compra aberta", async () => {
    for (let i = 0; i < 6; i++) {
      await resetDb();
      fx = await makeFamily();
      const c = await makeCard(fx, {
        name: "Corrida",
        owner: "Mariana",
        closingDay: 25,
        dueDay: 5,
      });
      const categoryId = await cat("Supermercado");
      const buy = () =>
        at(() =>
          call(lucas(), "POST", "/api/v1/transactions", {
            type: "EXPENSE",
            cardId: c.id,
            categoryId,
            amountInCents: 1000,
            occurredOn: "2026-10-05",
          }),
        );
      const arch = () => act(mariana(), c.id, "archive");
      i % 2 === 0 ? await Promise.all([buy(), arch()]) : await Promise.all([arch(), buy()]);
      const row = await db.creditCard.findUniqueOrThrow({ where: { id: c.id } });
      const purchases = await db.transaction.count({ where: { cardId: c.id, deletedAt: null } });
      if (row.archivedAt) expect(purchases, `iteração ${i}`).toBe(0);
    }
  }, 120_000);
});
