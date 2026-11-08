import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { buildDraft } from "@/modules/importacao/draft";
import { issueImportToken } from "@/modules/importacao/token";
import { ExportSchema } from "@/modules/privacidade/export-schema";
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

// Injeção de falha na gravação (atomicidade): a N-ésima chamada de `insertRevisions` lança.
const inject = vi.hoisted(() => ({ failAt: 0, calls: 0 }));
vi.mock("@/modules/importacao/confirm-write", async (orig) => {
  const real = await orig<typeof import("@/modules/importacao/confirm-write")>();
  return {
    ...real,
    insertRevisions: (...a: Parameters<typeof real.insertRevisions>) => {
      inject.calls += 1;
      if (inject.failAt && inject.calls === inject.failAt) throw new Error("falha injetada");
      return real.insertRevisions(...a);
    },
  };
});

const db = testDb();
const NOW = "2026-10-12T15:00:00Z"; // fechamento dia 25: fatura aberta = 2026-10
const HASH = "b".repeat(64);
let fx: FamilyFixture;
let card: CardFixture;
let acc: AccountFixture;
let baseTx = 0; // lançamentos da própria fixture (saldo inicial)
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const memberId = (n: string) => fx.byName[n]?.memberId as string;
const path = (id = card.id) => `/api/v1/cards/${id}/invoice-imports`;

const catId = async (name: string, f = fx) =>
  (await db.category.findFirstOrThrow({ where: { familyId: f.family.id, name } })).id;

const token = (o: { hash?: string; cardId?: string; at?: string; familyId?: string } = {}) =>
  issueImportToken(
    {
      familyId: o.familyId ?? fx.family.id,
      cardId: o.cardId ?? card.id,
      fileHash: o.hash ?? HASH,
      source: "CSV",
    },
    new Date(o.at ?? NOW),
  );

let n = 0;
const item = async (o: Record<string, unknown> = {}) => ({
  idx: n++,
  occurrence: 1,
  date: "2026-10-03",
  description: `Compra ${n}`,
  amountInCents: "10000",
  kind: "PURCHASE",
  installment: null,
  categoryId: await catId("Supermercado"),
  payerMemberId: memberId("Mariana"),
  ...o,
});

type Send = {
  as?: ReturnType<typeof mariana>;
  key?: string | null;
  ref?: string;
  now?: string;
  tok?: string;
  cardId?: string;
  extra?: Record<string, unknown>;
};
const send = async (items: unknown[], o: Send = {}) =>
  withClock(o.now ?? NOW, () =>
    call(
      o.as === undefined ? mariana() : o.as,
      "POST",
      path(o.cardId),
      { importToken: o.tok ?? token(), invoiceRef: o.ref ?? "2026-10", items, ...o.extra },
      { idempotencyKey: o.key === undefined ? randomUUID() : o.key },
    ),
  );

const counts = async () => ({
  tx: (await db.transaction.count()) - baseTx,
  plans: await db.installmentPlan.count(),
  batches: await db.importBatch.count(),
  revisions: await db.transactionRevision.count(),
  events: await db.familyEvent.count({ where: { type: "INVOICE_IMPORTED" } }),
});

beforeEach(async () => {
  vi.stubEnv("INVOICE_IMPORT_ENABLED", "true");
  inject.failAt = 0;
  inject.calls = 0;
  await resetDb();
  n = 0;
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "Itaú", owner: "Mariana", openingBalanceInCents: 500000 });
  card = await makeCard(fx, {
    name: "Nubank",
    owner: "Mariana",
    closingDay: 25,
    dueDay: 5,
    limitInCents: 500000,
  });
  baseTx = await db.transaction.count();
});
afterEach(() => vi.unstubAllEnvs());

describe("US-068 gravação do lote (AC 1, 2, 8)", () => {
  it("grava exatamente os itens, Só meu, origin INVOICE_IMPORT, revisão CREATE; acerto não muda; limite sobe", async () => {
    await makeCardPurchase(fx, {
      card,
      amountInCents: 5000,
      occurredOn: "2026-10-01",
      shared: true,
    });
    const settleBefore = (await withClock(NOW, () => call(mariana(), "GET", "/api/v1/settlement")))
      .body;
    const res = await send([
      await item({ amountInCents: "12345", description: "Mercado Bom Preço" }),
      await item({ amountInCents: "250", kind: "FEE", description: "IOF" }),
    ]);
    expect(res.status).toBe(201);
    const body = res.body;
    expect(body.batch).toMatchObject({ itemCount: 2, totalInCents: 12595, source: "CSV" });
    expect(body.transactions).toHaveLength(2);
    expect(body.invoice).toMatchObject({ ref: "2026-10", totalInCents: 5000 + 12595 });
    expect(body.card).toMatchObject({
      usedInCents: 5000 + 12595,
      availableInCents: 500000 - 17595,
    });
    expect(body.reconcileTotal.selectedTotal).toBe("12595");

    const rows = await db.transaction.findMany({ where: { importBatchId: body.batch.id } });
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r).toMatchObject({
        kind: "EXPENSE",
        accountId: null,
        cardId: card.id,
        isSharedExpense: false,
        splitMode: "NONE",
        origin: "INVOICE_IMPORT",
        authorMemberId: memberId("Mariana"),
        version: 1,
      });
      expect(r.importKey).toMatch(/^[0-9a-f]{64}$/);
    }
    expect(rows.reduce((s, r) => s + r.amountInCents, 0n)).toBe(12595n);
    expect(
      await db.transactionSplit.count({ where: { transactionId: { in: rows.map((r) => r.id) } } }),
    ).toBe(0);
    const revs = await db.transactionRevision.findMany({
      where: { transactionId: { in: rows.map((r) => r.id) } },
    });
    expect(revs.map((r) => [r.revision, r.action])).toEqual([
      [1, "CREATE"],
      [1, "CREATE"],
    ]);
    const batch = await db.importBatch.findUniqueOrThrow({ where: { id: body.batch.id } });
    expect(batch).toMatchObject({
      fileHash: HASH,
      itemCount: 2,
      totalInCents: 12595n,
      revertedAt: null,
    });

    const settleAfter = (await withClock(NOW, () => call(mariana(), "GET", "/api/v1/settlement")))
      .body;
    // o acerto não muda; só o bloco informativo "Só meu" do próprio membro passa a contar os itens
    const { personal: pAfter, ...restAfter } = settleAfter;
    const { personal: pBefore, ...restBefore } = settleBefore;
    expect(restAfter).toEqual(restBefore);
    expect(pBefore.count).toBe(0);
    expect(pAfter).toMatchObject({ count: 2, totalInCents: 12595 });

    // AC8: evento só com ids, contagem e total; nenhuma descrição em lugar nenhum
    const ev = await db.familyEvent.findFirstOrThrow({ where: { type: "INVOICE_IMPORTED" } });
    expect(Object.keys(ev.changes as object).sort()).toEqual(
      ["batchId", "cardId", "invoiceId", "itemCount", "totalInCents"].sort(),
    );
    expect(JSON.stringify(ev.changes)).not.toMatch(/Mercado|IOF/);
  });

  it("pagador Lucas por Mariana (Admin, dono com conta) = 403, nada gravado; Lucas confirma o próprio", async () => {
    const before = await counts();
    const r = await send([await item({ payerMemberId: memberId("Lucas") })]);
    expect(r.status).toBe(403);
    expect(await counts()).toEqual(before);
    const ok = await send([await item({ payerMemberId: memberId("Lucas") })], { as: lucas() });
    expect(ok.status).toBe(201);
    expect(ok.body.transactions[0].author.id).toBe(memberId("Lucas"));
  });
});

describe("US-068 idempotência e dedupe (AC 3)", () => {
  it("5 pedidos concorrentes com a mesma chave criam um lote só; a resposta é a mesma", async () => {
    const key = randomUUID();
    const items = [await item(), await item({ amountInCents: "777" })];
    const rs = await Promise.all(Array.from({ length: 5 }, () => send(items, { key })));
    expect(rs.map((r) => r.status)).toEqual([201, 201, 201, 201, 201]);
    expect(new Set(rs.map((r) => r.body.batch.id)).size).toBe(1);
    const c = await counts();
    expect(c).toMatchObject({ batches: 1, tx: 2, events: 1 });
  });

  it("chave nova com o mesmo arquivo = 409 IMPORT_ALREADY_EXISTS com importedAt", async () => {
    expect((await send([await item()])).status).toBe(201);
    const again = await send([await item()]);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("IMPORT_ALREADY_EXISTS");
    expect(again.body.error.details.importedAt).toBeTruthy();
    expect(await counts()).toMatchObject({ batches: 1, tx: 1 });
  });

  it("dois lotes concorrentes do mesmo fileHash com chaves diferentes: um 201 e um 409", async () => {
    const rs = await Promise.all([
      send([await item({ description: "Loja A" })]),
      send([await item({ description: "Loja B" })]),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(rs.find((r) => r.status === 409)?.body.error.code).toBe("IMPORT_ALREADY_EXISTS");
    expect(await counts()).toMatchObject({ batches: 1, tx: 1 });
  });

  it("lote revertido libera o arquivo, mas item ainda ativo = 409 IMPORT_ITEM_DUPLICATE com idx", async () => {
    const first = await send([await item({ description: "Loja A" })]);
    await db.importBatch.update({
      where: { id: first.body.batch.id },
      data: { revertedAt: new Date(), revertedByMemberId: memberId("Mariana") },
    });
    n = 0;
    const r = await send([
      await item({ description: "Outra", amountInCents: "999" }),
      await item({ description: "Loja A" }),
    ]);
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({ code: "IMPORT_ITEM_DUPLICATE", details: { idx: 1 } });
    expect(await counts()).toMatchObject({ batches: 1, tx: 1 });
  });

  it("sem Idempotency-Key = 400", async () => {
    const r = await send([await item()], { key: null });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
  });
});

describe("US-068 atomicidade (AC 4)", () => {
  it("categoria de outra família no 3º item: 422 com idx e nada novo gravado", async () => {
    const other = await makeFamily({ uniqueEmails: true });
    const before = await counts();
    const r = await send([
      await item(),
      await item({ amountInCents: "300", installment: { no: 2, count: 3 } }),
      await item({ categoryId: await catId("Supermercado", other), amountInCents: "400" }),
    ]);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({ code: "IMPORT_ITEM_INVALID", details: { idx: 2 } });
    expect(await counts()).toEqual(before);
  });

  it("falha DEPOIS de gravar o lote e os 2 primeiros grupos desfaz tudo (lote, planos, lançamentos, evento)", async () => {
    const before = await counts();
    inject.failAt = 3; // 1ª = à vista; 2ª = plano A; 3ª = plano B
    const r = await send([
      await item(),
      await item({
        amountInCents: "300",
        installment: { no: 2, count: 3 },
        description: "Plano A",
      }),
      await item({
        amountInCents: "400",
        installment: { no: 1, count: 2 },
        description: "Plano B",
      }),
    ]);
    expect(r.status).toBe(500);
    expect(inject.calls).toBe(3);
    expect(await counts()).toEqual(before);
    expect(await db.cardInvoice.count({ where: { referenceMonth: { gt: "2026-10" } } })).toBe(0);
    // e a mesma chave de arquivo segue livre
    inject.failAt = 0;
    expect((await send([await item()])).status).toBe(201);
  });
});

describe("US-068 fatura paga e referência (AC 5)", () => {
  it("fatura alvo paga entre a revisão e a confirmação = 422 INVOICE_PAID_LOCKED", async () => {
    const inv = await makeInvoice(fx, card, "2026-09");
    await makeCardPurchase(fx, { card, amountInCents: 1000, occurredOn: "2026-09-10" });
    await makeInvoicePayment(fx, {
      card,
      invoice: inv,
      account: acc,
      amountInCents: 1000,
      paidOn: "2026-10-05",
    });
    const before = await counts();
    const r = await send([await item({ date: "2026-09-03" })], { ref: "2026-09" });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("INVOICE_PAID_LOCKED");
    expect(await counts()).toEqual(before);
  });

  it("parcelas futuras que cairiam em fatura paga também recusam", async () => {
    const inv = await makeInvoice(fx, card, "2026-11");
    await makeInvoicePayment(fx, {
      card,
      invoice: inv,
      account: acc,
      amountInCents: 1,
      paidOn: "2026-10-10",
    });
    const before = await counts();
    const r = await send([await item({ installment: { no: 1, count: 3 } })]);
    expect(r.status).toBe(422);
    expect(r.body.error).toMatchObject({
      code: "INVOICE_PAID_LOCKED",
      details: { ref: "2026-11" },
    });
    expect(await counts()).toEqual(before);
  });

  it("fatura posterior à aberta = 422 INVOICE_REF_INVALID", async () => {
    const r = await send([await item()], { ref: "2026-11" });
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe("INVOICE_REF_INVALID");
  });
});

describe("US-068 parcelas (AC 1, 6)", () => {
  it("3/10 cria plano com paidBeforeApp 2; parcelas 3..10 nas faturas seguintes; limite sobe valor × 8", async () => {
    const r = await send([
      await item({
        amountInCents: "10000",
        installment: { no: 3, count: 10 },
        description: "Geladeira",
      }),
    ]);
    expect(r.status).toBe(201);
    const plan = await db.installmentPlan.findFirstOrThrow({ include: { parcels: true } });
    expect(plan).toMatchObject({
      installmentCount: 10,
      paidBeforeAppCount: 2,
      totalInCents: 100000n,
      cardId: card.id,
      importBatchId: r.body.batch.id,
    });
    expect(plan.parcels.map((t) => t.installmentNo).sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([
      3, 4, 5, 6, 7, 8, 9, 10,
    ]);
    expect(plan.parcels.reduce((s, t) => s + t.amountInCents, 0n)).toBe(80000n);
    expect(plan.parcels.every((t) => t.origin === "INVOICE_IMPORT" && !t.isSharedExpense)).toBe(
      true,
    );
    // só a parcela 3 (fatura alvo) tem importKey
    expect(plan.parcels.filter((t) => t.importKey).map((t) => t.installmentNo)).toEqual([3]);
    const invoices = await db.cardInvoice.findMany({
      where: { id: { in: plan.parcels.map((t) => t.invoiceId as string) } },
      orderBy: { referenceMonth: "asc" },
    });
    expect(invoices.map((i) => i.referenceMonth)).toEqual([
      "2026-10",
      "2026-11",
      "2026-12",
      "2027-01",
      "2027-02",
      "2027-03",
      "2027-04",
      "2027-05",
    ]);
    expect(r.body.batch.totalInCents).toBe(80000);
    expect(r.body.card.usedInCents).toBe(80000);
    expect(r.body.card.availableInCents).toBe(500000 - 80000);
    expect(r.body.transactions).toHaveLength(1);
    expect(r.body.transactions[0].installment).toMatchObject({ no: 3, count: 10 });
    const revs = await db.transactionRevision.count({
      where: { transactionId: { in: plan.parcels.map((t) => t.id) } },
    });
    expect(revs).toBe(8);
  });

  it("reimportar a fatura seguinte marca a 4/10 como ALREADY_POSTED_PARCEL e o servidor recusa (409 com idx)", async () => {
    await send([await item({ installment: { no: 3, count: 10 }, description: "Geladeira" })]);
    const later = "2026-11-12T15:00:00Z";
    const row = await db.creditCard.findUniqueOrThrow({ where: { id: card.id } });
    const parcel4 = { no: 4, count: 10 };
    const draft = await withClock(later, () =>
      db.$transaction((tx) =>
        buildDraft(
          tx,
          {
            userId: fx.byName.Mariana?.userId as string,
            email: "m",
            name: "Mariana",
            image: null,
            clock: { now: () => new Date(later) },
            requestId: "r",
            memberId: memberId("Mariana"),
            familyId: fx.family.id,
            role: "ADMIN",
          },
          {
            cardId: card.id,
            ownerMemberId: row.ownerMemberId,
            invoiceRef: "2026-11",
            source: "CSV",
            fileHash: "c".repeat(64),
            declared: {},
            warnings: [],
            items: [
              {
                idx: 0,
                date: "2026-08-03",
                description: "Geladeira",
                amountInCents: "10000",
                kind: "PURCHASE",
                installment: parcel4,
              },
            ],
          },
        ),
      ),
    );
    expect(draft.items[0]?.flags).toContain("ALREADY_POSTED_PARCEL");
    expect(draft.items[0]?.selected).toBe(false);
    const before = await counts();
    const r = await send(
      [await item({ date: "2026-08-03", installment: parcel4, description: "Geladeira" })],
      {
        ref: "2026-11",
        now: later,
        tok: token({ hash: "c".repeat(64), at: later }),
      },
    );
    expect(r.status).toBe(409);
    expect(r.body.error).toMatchObject({
      code: "IMPORT_ITEM_DUPLICATE",
      details: { reason: "ALREADY_POSTED_PARCEL" },
    });
    expect(await counts()).toEqual(before);
  });
});

describe("US-068 token e corpo (AC 7)", () => {
  it("token vencido, adulterado, de outro cartão ou de outra família = 422 IMPORT_TOKEN_INVALID", async () => {
    const other = await makeCard(fx, { name: "Outro", owner: "Mariana" });
    const otherFam = await makeFamily({ uniqueEmails: true });
    const good = token();
    const bad = [
      token({ at: "2026-10-12T11:00:00Z" }), // 4 h antes: vencido
      `${good.slice(0, -2)}xx`,
      token({ cardId: other.id }),
      token({ familyId: otherFam.family.id }),
    ];
    for (const tok of bad) {
      const r = await send([await item()], { tok });
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe("IMPORT_TOKEN_INVALID");
    }
    expect((await counts()).batches).toBe(0);
  });

  it("campo extra no corpo ou no item = 400; outro membro de outra família não enxerga o cartão (404)", async () => {
    expect((await send([await item()], { extra: { familyId: fx.family.id } })).status).toBe(400);
    expect((await send([await item({ origin: "APP" })])).status).toBe(400);
    expect((await send([await item({ amountInCents: "0" })])).status).toBe(400);
    const otherFam = await makeFamily({ uniqueEmails: true });
    const r = await send([await item()], { as: otherFam.byName.Mariana?.as ?? null });
    expect([404, 422]).toContain(r.status);
    expect((await counts()).tx).toBe(0);
  });

  it("flag desligada = 404", async () => {
    vi.stubEnv("INVOICE_IMPORT_ENABLED", "false");
    expect((await send([await item()])).status).toBe(404);
  });
});

describe("US-068 exportação LGPD (ADR-042 §12)", () => {
  it("importacoes[] só com metadados e origem INVOICE_IMPORT por lançamento", async () => {
    const r = await send([await item({ description: "Segredo da Loja" })]);
    const exp = await withClock(NOW, () => call(mariana(), "GET", "/api/v1/me/export"));
    expect(exp.status).toBe(200);
    const file = ExportSchema.parse(exp.body);
    expect(file.familiaAtual?.importacoes).toEqual([
      {
        id: r.body.batch.id,
        cartaoId: card.id,
        faturaId: r.body.batch.invoiceId,
        hashDoArquivo: HASH,
        fonte: "CSV",
        quantidadeDeItens: 1,
        totalEmCentavos: 10000,
        importadoPorId: memberId("Mariana"),
        importadoEm: expect.any(String),
        desfeitoEm: null,
        desfeitoPorId: null,
      },
    ]);
    expect(file.familiaAtual?.lancamentos.find((l) => l.origem === "INVOICE_IMPORT")).toBeDefined();
    const meta = JSON.stringify(file.familiaAtual?.importacoes);
    expect(meta).not.toMatch(/Segredo|descri|\.csv|\.pdf/i);
  });
});

describe("US-068 ocorrência no arquivo (A,A)", () => {
  it("só o 2º de dois idênticos confirmado grava; arquivo novo com A,A marca a 1ª e aceita a 2ª; repetir par = 422", async () => {
    const a = { description: "Padaria", amountInCents: "500" };
    const first = await send([await item({ ...a, occurrence: 1 })], {
      tok: token({ hash: "d".repeat(64) }),
    });
    expect(first.status).toBe(201); // só a 1ª do arquivo 1
    // arquivo novo A,A: rascunho marca ocorrência 1 como já importada; o membro confirma só a 2ª
    const row = await db.creditCard.findUniqueOrThrow({ where: { id: card.id } });
    const d = await db.$transaction((tx) =>
      buildDraft(
        tx,
        {
          userId: fx.byName.Mariana?.userId as string,
          email: "m",
          name: "Mariana",
          image: null,
          clock: { now: () => new Date(NOW) },
          requestId: "r",
          memberId: memberId("Mariana"),
          familyId: fx.family.id,
          role: "ADMIN",
        },
        {
          cardId: card.id,
          ownerMemberId: row.ownerMemberId,
          invoiceRef: "2026-10",
          source: "CSV",
          fileHash: "e".repeat(64),
          declared: {},
          warnings: [],
          items: [0, 1].map((idx) => ({
            idx,
            date: "2026-10-03",
            description: "Padaria",
            amountInCents: "500",
            kind: "PURCHASE" as const,
            installment: null,
          })),
        },
      ),
    );
    expect(d.items.map((i) => [i.occurrence, i.flags])).toEqual([
      [1, ["ALREADY_IMPORTED"]],
      [2, ["POSSIBLE_DUPLICATE"]], // selecionável: o membro decide
    ]);
    const tok = token({ hash: "e".repeat(64) });
    const dup = await send(
      [
        await item({ ...a, occurrence: 1, date: "2026-10-03" }),
        await item({ ...a, occurrence: 1, date: "2026-10-03" }),
      ],
      { tok },
    );
    expect(dup.status).toBe(422); // (identidade, ocorrência) repetido no corpo
    const ok = await send([await item({ ...a, occurrence: 2 })], { tok });
    expect(ok.status).toBe(201);
    // reimportar depois (outro arquivo) a 2ª: agora ela é duplicada
    const again = await send([await item({ ...a, occurrence: 2 })], {
      tok: token({ hash: "f".repeat(64) }),
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("IMPORT_ITEM_DUPLICATE");
  });
});
