import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { issueImportToken } from "@/modules/importacao/token";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z"; // fechamento dia 25: fatura aberta = 2026-10
const LATER = "2026-10-13T10:00:00Z";
let fx: FamilyFixture;
let card: CardFixture;
let acc: AccountFixture;
let n = 0;
let hashN = 0;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const memberId = (name: string) => fx.byName[name]?.memberId as string;
const at = <T>(fn: () => Promise<T>, now = NOW) => withClock(now, fn);
const catId = async () =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Supermercado" } }))
    .id;

const item = async (o: Record<string, unknown> = {}) => ({
  idx: n++,
  occurrence: 1,
  date: "2026-10-03",
  description: `Compra ${String.fromCharCode(96 + n)}${String.fromCharCode(96 + n)}`,
  amountInCents: "10000",
  kind: "PURCHASE",
  installment: null,
  categoryId: await catId(),
  payerMemberId: memberId("Mariana"),
  ...o,
});

/** Importa um lote (arquivo novo a cada chamada, salvo `hash`) e devolve o corpo do 201. */
async function importBatch(items: unknown[], o: { hash?: string; ref?: string } = {}) {
  const tok = issueImportToken(
    {
      familyId: fx.family.id,
      cardId: card.id,
      fileHash: o.hash ?? String(++hashN).padStart(64, "a"),
      source: "CSV",
    },
    new Date(NOW),
  );
  const res = await at(() =>
    call(
      mariana(),
      "POST",
      `/api/v1/cards/${card.id}/invoice-imports`,
      { importToken: tok, invoiceRef: o.ref ?? "2026-10", items },
      { idempotencyKey: randomUUID() },
    ),
  );
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body as { batch: { id: string }; transactions: Array<{ id: string }> };
}

type Revert = { version?: number; as?: ReturnType<typeof mariana>; key?: string; now?: string };
const revert = (id: string, body: Record<string, unknown> = {}, o: Revert = {}) =>
  at(
    () =>
      call(
        o.as === undefined ? mariana() : o.as,
        "POST",
        `/api/v1/import-batches/${id}/revert`,
        { version: o.version ?? 1, ...body },
        { idempotencyKey: o.key ?? randomUUID() },
      ),
    o.now ?? LATER,
  );
const used = async () =>
  (await at(() => call(mariana(), "GET", `/api/v1/cards/${card.id}`))).body.card
    .usedInCents as number;
const invoiceTotal = async (ref = "2026-10") =>
  (await at(() => call(mariana(), "GET", `/api/v1/cards/${card.id}/invoices/${ref}`))).body.invoice
    .totalInCents as number;
const activeCount = (batchId: string) =>
  db.transaction.count({ where: { importBatchId: batchId, deletedAt: null } });

beforeEach(async () => {
  vi.stubEnv("INVOICE_IMPORT_ENABLED", "true");
  await resetDb();
  n = 0;
  hashN = 0;
  fx = await makeFamily({ splitEngine: "STORED" });
  acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 500000 });
  card = await makeCard(fx, {
    name: "Nubank",
    owner: "Mariana",
    closingDay: 25,
    dueDay: 5,
    limitInCents: 900000,
  });
});
afterEach(() => vi.unstubAllEnvs());

describe("US-069 lista e reversão (AC 1, 2, 5)", () => {
  it("lista o lote e desfaz tudo (itens e parcelas futuras); limite e totais voltam; repetir = 200 sem efeito", async () => {
    const usedBefore = await used();
    const totalBefore = await invoiceTotal();
    const { batch } = await importBatch([
      await item({ amountInCents: "12345" }),
      await item({ amountInCents: "5000", installment: { no: 1, count: 3 } }),
    ]);
    expect(await used()).toBe(usedBefore + 12345 + 15000);
    expect(await db.transaction.count({ where: { importBatchId: batch.id } })).toBe(4);

    const list = await at(() => call(lucas(), "GET", `/api/v1/cards/${card.id}/invoice-imports`));
    expect(list.status).toBe(200);
    expect(list.body.batches).toEqual([
      expect.objectContaining({
        id: batch.id,
        invoiceRef: "2026-10",
        source: "CSV",
        importedBy: "Mariana Silva",
        itemCount: 2,
        totalInCents: 12345 + 15000,
        revertedAt: null,
        version: 1,
        canRevert: true,
        revertBlockedReason: null,
      }),
    ]);

    const eventsBefore = await db.familyEvent.count({ where: { type: "INVOICE_IMPORT_REVERTED" } });
    const res = await revert(batch.id);
    expect(res.status).toBe(200);
    expect(res.body.batch).toMatchObject({
      canRevert: false,
      revertBlockedReason: "REVERTED",
      version: 2,
    });
    expect(res.body.card.usedInCents).toBe(usedBefore);
    expect(await used()).toBe(usedBefore);
    expect(await invoiceTotal()).toBe(totalBefore);
    expect(await invoiceTotal("2026-11")).toBe(0);
    expect(await activeCount(batch.id)).toBe(0);

    const row = await db.importBatch.findUniqueOrThrow({ where: { id: batch.id } });
    expect(row.revertedAt).not.toBeNull();
    expect(row.revertedByMemberId).toBe(memberId("Mariana"));
    const txs = await db.transaction.findMany({ where: { importBatchId: batch.id } });
    expect(txs.every((t) => t.deletedAt?.getTime() === row.revertedAt?.getTime())).toBe(true);
    expect(txs.every((t) => t.deletionReason === "DELETED" && t.version === 2)).toBe(true);
    const plans = await db.installmentPlan.findMany({ where: { importBatchId: batch.id } });
    expect(plans.map((p) => p.deletedAt?.getTime())).toEqual([row.revertedAt?.getTime()]);
    expect(
      await db.transactionRevision.count({
        where: { transactionId: { in: txs.map((t) => t.id) }, action: "DELETE", revision: 2 },
      }),
    ).toBe(4);
    expect(await db.familyEvent.count({ where: { type: "INVOICE_IMPORT_REVERTED" } })).toBe(
      eventsBefore + 1,
    );

    // repetir (outra chave, versão velha): 200 com o lote, sem efeito
    const again = await revert(batch.id, {}, { version: 1 });
    expect(again.status).toBe(200);
    expect(again.body.batch).toMatchObject({ revertBlockedReason: "REVERTED", version: 2 });
    expect(await db.familyEvent.count({ where: { type: "INVOICE_IMPORT_REVERTED" } })).toBe(
      eventsBefore + 1,
    );
    expect(await db.transactionRevision.count({ where: { action: "DELETE" } })).toBe(4);
    const listed = await at(() =>
      call(mariana(), "GET", `/api/v1/cards/${card.id}/invoice-imports`),
    );
    expect(listed.body.batches[0].revertedAt).toBe(row.revertedAt?.toISOString());
  });

  it("dois pedidos em Promise.all (chaves distintas) têm efeito uma vez só", async () => {
    const { batch } = await importBatch([await item(), await item({ amountInCents: "700" })]);
    const rs = await Promise.all([revert(batch.id), revert(batch.id), revert(batch.id)]);
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(await db.familyEvent.count({ where: { type: "INVOICE_IMPORT_REVERTED" } })).toBe(1);
    expect(await db.transactionRevision.count({ where: { action: "DELETE" } })).toBe(2);
    expect((await db.importBatch.findUniqueOrThrow({ where: { id: batch.id } })).version).toBe(2);
  });

  it("mesma Idempotency-Key repete a resposta; versão velha com o lote ativo = 409", async () => {
    const { batch } = await importBatch([await item()]);
    const stale = await revert(batch.id, {}, { version: 7 });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(await activeCount(batch.id)).toBe(1);
    const key = randomUUID();
    const a = await revert(batch.id, {}, { key });
    const b = await revert(batch.id, {}, { key });
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body).toEqual(a.body);
  });

  it("corpo estrito, id inexistente, outra família e flag desligada", async () => {
    const { batch } = await importBatch([await item()]);
    expect((await revert(batch.id, { familyId: randomUUID() })).status).toBe(400);
    expect((await revert(randomUUID())).status).toBe(404);
    const other = await makeFamily({ uniqueEmails: true });
    const out = await at(() =>
      call(
        other.byName.Mariana?.as ?? null,
        "POST",
        `/api/v1/import-batches/${batch.id}/revert`,
        { version: 1 },
        { idempotencyKey: randomUUID() },
      ),
    );
    expect(out.status).toBe(404);
    expect(await activeCount(batch.id)).toBe(1);
    vi.stubEnv("INVOICE_IMPORT_ENABLED", "false");
    expect((await revert(batch.id)).status).toBe(404);
  });
});

describe("US-069 fatura paga e fechada (AC 3)", () => {
  async function pay(ref: string, amount = 1) {
    const inv = await makeInvoice(fx, card, ref);
    await makeInvoicePayment(fx, {
      card,
      invoice: inv,
      account: acc,
      amountInCents: amount,
      paidOn: "2026-10-12",
    });
  }

  it("fatura paga de qualquer parcela trava o lote inteiro, sem efeito parcial", async () => {
    const { batch } = await importBatch([
      await item(),
      await item({ installment: { no: 1, count: 3 } }),
    ]);
    await pay("2026-12"); // a 3ª parcela cai na fatura 2026-12
    const before = await used();
    const r = await revert(batch.id);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({
      code: "INVOICE_PAID_LOCKED",
      details: { ref: "2026-12" },
    });
    expect(await activeCount(batch.id)).toBe(4);
    expect(await used()).toBe(before);
    expect(
      (await db.importBatch.findUniqueOrThrow({ where: { id: batch.id } })).revertedAt,
    ).toBeNull();
    const list = await at(() => call(mariana(), "GET", `/api/v1/cards/${card.id}/invoice-imports`));
    expect(list.body.batches[0]).toMatchObject({
      canRevert: false,
      revertBlockedReason: "INVOICE_PAID",
    });
    expect(await db.transactionRevision.count({ where: { action: "DELETE" } })).toBe(0);
  });

  it("fatura fechada e NÃO paga permite reverter", async () => {
    const { batch } = await importBatch([await item({ date: "2026-09-10" })], { ref: "2026-09" });
    const r = await revert(batch.id, {}, { now: "2026-10-12T15:00:00Z" });
    expect(r.status).toBe(200);
    expect(await activeCount(batch.id)).toBe(0);
  });
});

describe("US-069 item editado, mês acertado e controle (AC 4, 7)", () => {
  it("item editado exige confirmEditedItems e lista quais", async () => {
    const { batch, transactions } = await importBatch([await item(), await item()]);
    const edited = transactions[0] as { id: string };
    const p = await at(() =>
      call(mariana(), "PATCH", `/api/v1/transactions/${edited.id}`, {
        version: 1,
        description: "Mercado editado",
      }),
    );
    expect(p.status).toBe(200);
    const r = await revert(batch.id);
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("IMPORT_EDITED_ITEMS");
    expect(r.body.error.details.items).toEqual([
      { id: edited.id, description: "Mercado editado", date: "2026-10-03" },
    ]);
    expect(await activeCount(batch.id)).toBe(2);
    const ok = await revert(batch.id, { confirmEditedItems: true });
    expect(ok.status).toBe(200);
    expect(await activeCount(batch.id)).toBe(0);
  });

  it("item que virou dividido em mês acertado exige confirmSettledPeriod", async () => {
    const { batch, transactions } = await importBatch([await item({ amountInCents: "20000" })]);
    const id = (transactions[0] as { id: string }).id;
    const split = await at(() =>
      call(mariana(), "PATCH", `/api/v1/transactions/${id}`, {
        version: 1,
        split: {
          mode: "CUSTOM",
          shares: [
            { memberId: memberId("Lucas"), bps: 5000 },
            { memberId: memberId("Mariana"), bps: 5000 },
          ],
        },
      }),
    );
    expect(split.status).toBe(200);
    const other = await makeAccount(fx, { name: "Nu", owner: "Lucas" });
    const settle = await at(() =>
      call(mariana(), "POST", "/api/v1/settlements", {
        period: "2026-10",
        fromMemberId: memberId("Lucas"),
        toMemberId: memberId("Mariana"),
        amountInCents: 1000,
        fromAccountId: other.id,
        toAccountId: acc.id,
      }),
    );
    expect(settle.status).toBe(201);
    const blocked = await revert(batch.id, { confirmEditedItems: true });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toMatchObject({
      code: "SETTLED_PERIOD_CONFIRMATION_REQUIRED",
      details: { periods: ["2026-10"] },
    });
    expect(await activeCount(batch.id)).toBe(1);
    const ok = await revert(batch.id, { confirmEditedItems: true, confirmSettledPeriod: true });
    expect(ok.status).toBe(200);
    expect(await activeCount(batch.id)).toBe(0);
  });

  it("exige controle sobre todos os itens 'Só meu': outro membro = 403 IMPORT_REVERT_FORBIDDEN", async () => {
    const { batch } = await importBatch([await item()]);
    const r = await revert(batch.id, {}, { as: lucas() });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("IMPORT_REVERT_FORBIDDEN");
    expect(await activeCount(batch.id)).toBe(1);
    expect((await revert(batch.id)).status).toBe(200);
  });

  it("item excluído antes continua excluído; o Desfazer do plano e a restauração não devolvem o lote", async () => {
    const { batch, transactions } = await importBatch([
      await item(),
      await item({ installment: { no: 1, count: 3 } }),
    ]);
    const single = (transactions[0] as { id: string }).id;
    const del = await at(() =>
      call(mariana(), "POST", `/api/v1/transactions/${single}/delete`, { version: 1 }),
    );
    expect(del.status).toBe(200);
    const deletedAt = (await db.transaction.findUniqueOrThrow({ where: { id: single } })).deletedAt;
    expect(await revert(batch.id)).toMatchObject({ status: 200 });
    const after = await db.transaction.findUniqueOrThrow({ where: { id: single } });
    expect(after.deletedAt?.getTime()).toBe(deletedAt?.getTime());
    expect(after.version).toBe(2); // não reescrito pela reversão
    const plan = await db.installmentPlan.findFirstOrThrow({ where: { importBatchId: batch.id } });
    const restorePlan = await at(() =>
      call(mariana(), "POST", `/api/v1/installment-plans/${plan.id}/restore`, {
        version: plan.version,
      }),
    );
    expect(restorePlan.status).toBe(422);
    expect(restorePlan.body.error.code).toBe("NOT_RESTORABLE");
    const restoreOne = await at(() =>
      call(mariana(), "POST", `/api/v1/transactions/${single}/restore`, { version: 2 }),
    );
    expect(restoreOne.status).toBe(422);
    expect(await activeCount(batch.id)).toBe(0);
  });
});

describe("US-069 reimportar depois de reverter (AC 6)", () => {
  it("o mesmo arquivo e os mesmos itens entram de novo como novo lote; antes de reverter segue 409", async () => {
    const HASH = "c".repeat(64);
    const items = [await item({ description: "Padaria" })];
    const first = await importBatch(items, { hash: HASH });
    const dupToken = issueImportToken(
      { familyId: fx.family.id, cardId: card.id, fileHash: HASH, source: "CSV" },
      new Date(NOW),
    );
    const dup = await at(() =>
      call(
        mariana(),
        "POST",
        `/api/v1/cards/${card.id}/invoice-imports`,
        { importToken: dupToken, invoiceRef: "2026-10", items },
        { idempotencyKey: randomUUID() },
      ),
    );
    expect(dup.status).toBe(409);
    expect((await revert(first.batch.id)).status).toBe(200);
    const usedAfterRevert = await used();
    const second = await importBatch(items, { hash: HASH });
    expect(second.batch.id).not.toBe(first.batch.id);
    expect(await used()).toBe(usedAfterRevert + 10000);
    const list = await at(() => call(mariana(), "GET", `/api/v1/cards/${card.id}/invoice-imports`));
    const flags = list.body.batches.map(
      (b: { revertedAt: string | null }) => b.revertedAt !== null,
    );
    expect([...flags].sort()).toEqual([false, true]);
  });
});
