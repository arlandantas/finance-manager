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
  makeInvoicePayment,
  makeTag,
  makeTransaction,
  makeTransfer,
} from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

// US-045 (SDD-016 §8): tags livres no lançamento.
const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const catId = async (name: string, f: FamilyFixture = fx) =>
  (await db.category.findFirstOrThrow({ where: { familyId: f.family.id, name } })).id;

const post = async (body: Record<string, unknown>, as = mariana(), f: FamilyFixture = fx) =>
  at(async () =>
    call(as, "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      accountId: acc.id,
      categoryId: await catId("Supermercado", f),
      amountInCents: 80000,
      description: "Hotel",
      ...body,
    }),
  );
const patch = (id: string, body: Record<string, unknown>, as = mariana()) =>
  at(() => call(as, "PATCH", `/api/v1/transactions/${id}`, body));
const names = (res: { body: { transaction: { tags: Array<{ name: string }> } } }) =>
  res.body.transaction.tags.map((t) => t.name);
const tagRows = () => db.tag.findMany({ where: { familyId: fx.family.id } });

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 500000 });
});

describe("US-045 criar com tags", () => {
  it("sem tags: tags [] e nenhuma linha em tags", async () => {
    const res = await post({});
    expect(res.status).toBe(201);
    expect(res.body.transaction.tags).toEqual([]);
    expect(await db.tag.count()).toBe(0);
    expect(await db.transactionTag.count()).toBe(0);
  });

  it("cria ao digitar e o Extrato mostra os chips (ordem por nome)", async () => {
    const res = await post({ tags: ["viagem-nordeste", "ferias"] });
    expect(res.status).toBe(201);
    expect(names(res)).toEqual(["ferias", "viagem-nordeste"]);
    expect(await db.tag.count()).toBe(2);
    expect(await db.transactionTag.count()).toBe(2);
    const list = await at(() => call(mariana(), "GET", "/api/v1/transactions"));
    expect(list.body.items[0].tags.map((t: { name: string }) => t.name)).toEqual([
      "ferias",
      "viagem-nordeste",
    ]);
    const detail = await at(() =>
      call(mariana(), "GET", `/api/v1/transactions/${res.body.transaction.id}`),
    );
    expect(detail.body.transaction.tags).toHaveLength(2);
  });

  it("espaços internos viram hífen na gravação", async () => {
    const res = await post({ tags: ["Viagem  Nordeste"] });
    expect(names(res)).toEqual(["Viagem-Nordeste"]);
  });

  it("outra caixa/acento reaproveita a existente e mostra o nome original", async () => {
    await makeTag(fx, "Viagem");
    await makeTag(fx, "Café");
    const res = await post({ tags: ["viagem", "cafe", "VIÁGEM"] });
    expect(names(res).sort()).toEqual(["Café", "Viagem"]);
    expect(await db.tag.count()).toBe(2);
  });

  it("'viajem' não é unificada com 'viagem'", async () => {
    await post({ tags: ["viagem", "viajem"] });
    expect(await db.tag.count()).toBe(2);
  });

  it("dedupe na mesma requisição e receita aceita tags", async () => {
    const res = await at(async () =>
      call(mariana(), "POST", "/api/v1/transactions", {
        type: "INCOME",
        accountId: acc.id,
        categoryId: await catId("Salário"),
        amountInCents: 100000,
        tags: ["extra", "Extra"],
      }),
    );
    expect(res.status).toBe(201);
    expect(names(res)).toEqual(["extra"]);
  });

  it("4 e 20 tags aceitas; 21 => 400; nomes inválidos => mensagens", async () => {
    const t = (n: number) => Array.from({ length: n }, (_, i) => `tag${i}`);
    expect((await post({ tags: t(4) })).status).toBe(201);
    expect((await post({ tags: t(20) })).status).toBe(201);
    const many = await post({ tags: t(21) });
    expect(many.status).toBe(400);
    expect(many.body.error.message).toBe("Use no máximo 20 tags por lançamento");
    const short = await post({ tags: ["a"] });
    expect(short.status).toBe(400);
    expect(short.body.error.message).toBe("A tag precisa ter entre 2 e 30 caracteres");
    const chars = await post({ tags: ["viagem*"] });
    expect(chars.status).toBe(400);
    expect(chars.body.error.message).toBe(
      "A tag só pode ter letras, números, hífen, ponto e sublinhado",
    );
    expect((await post({ tags: ["a,b"] })).status).toBe(400);
  });

  it("transferência rejeita tags (400) e o gatilho barra ligação a outro tipo", async () => {
    const other = await makeAccount(fx, { name: "Itaú", owner: "Lucas" });
    const res = await at(() =>
      call(mariana(), "POST", "/api/v1/transfers", {
        fromAccountId: acc.id,
        toAccountId: other.id,
        amountInCents: 1000,
        tags: ["x1"],
      }),
    );
    expect(res.status).toBe(400);
    const leg = await makeTransfer(fx, {
      from: acc,
      to: other,
      amountInCents: 500,
      occurredOn: "2026-10-10",
    });
    const tag = await makeTag(fx, "casa");
    const legs = await db.transaction.findMany({
      where: { familyId: fx.family.id, kind: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } },
    });
    expect(legs.length).toBeGreaterThan(0);
    void leg;
    await expect(
      db.transactionTag.create({
        data: {
          transactionId: (legs[0] as { id: string }).id,
          tagId: tag.id,
          familyId: fx.family.id,
        },
      }),
    ).rejects.toThrow(/tags só valem para despesa e receita/);
  });

  it("falha ao criar (validação) não deixa tag órfã", async () => {
    const res = await post({ tags: ["orfa"], amountInCents: 0 });
    expect(res.status).toBe(400);
    expect(await db.tag.count()).toBe(0);
    const bad = await post({ tags: ["orfa"], categoryId: await catId("Salário") });
    expect(bad.status).toBe(422);
    expect(await db.tag.count()).toBe(0);
  });
});

describe("US-045 GET /tags (sugestão por prefixo)", () => {
  it("prefixo de nameKey, sem caixa/acento; sem q lista por uso", async () => {
    await post({ tags: ["viagem-nordeste"] });
    await post({ tags: ["viagem-nordeste", "ferias"] });
    await makeTag(fx, "Café");
    const q = await at(() => call(lucas(), "GET", "/api/v1/tags?q=VIA"));
    expect(q.status).toBe(200);
    expect(q.body.items.map((t: { name: string }) => t.name)).toEqual(["viagem-nordeste"]);
    expect(q.body.items[0].usageCount).toBe(2);
    const acento = await at(() => call(lucas(), "GET", "/api/v1/tags?q=caf%C3%A9"));
    expect(acento.body.items.map((t: { name: string }) => t.name)).toEqual(["Café"]);
    const all = await at(() => call(lucas(), "GET", "/api/v1/tags"));
    expect(all.body.items.map((t: { name: string }) => t.name)).toEqual([
      "viagem-nordeste",
      "ferias",
      "Café",
    ]);
    // curinga literal
    expect((await at(() => call(lucas(), "GET", "/api/v1/tags?q=%25"))).body.items).toEqual([]);
  });

  it("isolamento: tags de outra família nunca aparecem nem são reaproveitadas", async () => {
    const other = await makeFamily({ name: "Souza", uniqueEmails: true });
    const otherAcc = await makeAccount(other, { name: "C", owner: "Mariana" });
    await makeTag(other, "viagem");
    expect((await at(() => call(mariana(), "GET", "/api/v1/tags?q=via"))).body.items).toEqual([]);
    const res = await at(async () =>
      call(other.byName.Mariana?.as ?? null, "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        accountId: otherAcc.id,
        categoryId: await catId("Supermercado", other),
        amountInCents: 100,
        tags: ["viagem"],
      }),
    );
    expect(res.status).toBe(201);
    await post({ tags: ["viagem"] });
    expect(await db.tag.count({ where: { nameKey: "viagem" } })).toBe(2);
  });
});

describe("US-045 corrida e idempotência", () => {
  it("10 POSTs simultâneos com a mesma tag nova => 1 tag", async () => {
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        post({ tags: ["corrida", "Corrida", `outra${i % 2}`], description: `L${i}` }),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(Array(10).fill(201));
    expect(await db.tag.count({ where: { nameKey: "corrida" } })).toBe(1);
    expect(await db.tag.count()).toBe(3);
    expect(await db.transactionTag.count()).toBe(20);
  });

  it("Idempotency-Key repetida => 1 efeito", async () => {
    const send = () =>
      at(async () =>
        call(
          mariana(),
          "POST",
          "/api/v1/transactions",
          {
            type: "EXPENSE",
            accountId: acc.id,
            categoryId: await catId("Supermercado"),
            amountInCents: 5000,
            tags: ["idem"],
          },
          { idempotencyKey: "11111111-1111-4111-8111-111111111111" },
        ),
      );
    const [a, b] = [await send(), await send()];
    expect(a.status).toBe(201);
    expect(b.body.transaction.id).toBe(a.body.transaction.id);
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
    expect(await db.transactionTag.count()).toBe(1);
  });
});

describe("US-045 editar tags", () => {
  it("troca o conjunto: revisão UPDATE field tags, version + 1; mesmo conjunto => 200 sem revisão", async () => {
    const created = await post({ tags: ["viagem-nordeste"] });
    const id = created.body.transaction.id;
    const res = await patch(id, { version: 1, tags: ["ferias"] });
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(["ferias"]);
    expect(res.body.transaction.version).toBe(2);
    const revs = await db.transactionRevision.findMany({
      where: { transactionId: id, action: "UPDATE" },
    });
    expect(revs).toHaveLength(1);
    expect(revs[0]?.changes).toEqual([
      { field: "tags", from: ["viagem-nordeste"], to: ["ferias"] },
    ]);
    // mesmo conjunto (outra caixa) não muda nada
    const same = await patch(id, { version: 2, tags: ["FERIAS"] });
    expect(same.status).toBe(200);
    expect(same.body.transaction.version).toBe(2);
    expect(await db.transactionRevision.count({ where: { transactionId: id } })).toBe(2);
    // [] limpa; ausente não toca
    const cleared = await patch(id, { version: 2, tags: [] });
    expect(cleared.body.transaction.tags).toEqual([]);
    expect(cleared.body.transaction.version).toBe(3);
    const hist = await at(() => call(mariana(), "GET", `/api/v1/transactions/${id}/history`));
    expect(hist.body.items[0].changes[0]).toMatchObject({ field: "tags", label: "Tags" });
  });

  it("junto com campo financeiro: uma só revisão e um só version + 1", async () => {
    const created = await post({ tags: ["a1"] });
    const id = created.body.transaction.id;
    const res = await patch(id, { version: 1, amountInCents: 90000, tags: ["a1", "b2"] });
    expect(res.status).toBe(200);
    expect(res.body.transaction.version).toBe(2);
    const rev = await db.transactionRevision.findFirstOrThrow({
      where: { transactionId: id, action: "UPDATE" },
    });
    expect((rev.changes as Array<{ field: string }>).map((c) => c.field).sort()).toEqual([
      "amountInCents",
      "tags",
    ]);
    // só adiciona tags com valor igual ao atual: continua sendo edição de tags
    const again = await patch(id, { version: 2, amountInCents: 90000, tags: ["a1"] });
    expect(again.status).toBe(200);
    expect(names(again)).toEqual(["a1"]);
  });

  it("conflito de versão (409) desfaz as tags", async () => {
    const created = await post({ tags: ["a1"] });
    const id = created.body.transaction.id;
    expect((await patch(id, { version: 1, description: "Hotel 2" })).status).toBe(200);
    const stale = await patch(id, { version: 1, tags: ["novatag"] });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(await db.tag.count({ where: { nameKey: "novatag" } })).toBe(0);
  });

  it("21 tags no PATCH => 400; lançamento excluído => 422 TRANSACTION_DELETED", async () => {
    const created = await post({ tags: ["a1"] });
    const id = created.body.transaction.id;
    const many = await patch(id, {
      version: 1,
      tags: Array.from({ length: 21 }, (_, i) => `tag${i}`),
    });
    expect(many.status).toBe(400);
    const del = await at(() =>
      call(mariana(), "POST", `/api/v1/transactions/${id}/delete`, { version: 1 }),
    );
    expect(del.status).toBe(200);
    const res = await patch(id, { version: 2, tags: ["b2"] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("TRANSACTION_DELETED");
  });

  it("transferência não aceita editar tags", async () => {
    const other = await makeAccount(fx, { name: "Itaú", owner: "Lucas" });
    await makeTransfer(fx, { from: acc, to: other, amountInCents: 500, occurredOn: "2026-10-10" });
    const leg = await db.transaction.findFirstOrThrow({
      where: { familyId: fx.family.id, kind: "TRANSFER_OUT" },
    });
    const res = await patch(leg.id, { version: 1, tags: ["x1"] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NOT_EDITABLE");
  });

  it("'Só meu' de outra pessoa: Lucas não edita as tags (SEC-021)", async () => {
    const mine = await makeTransaction(fx, {
      account: acc,
      category: "Saúde",
      amountInCents: 5000,
      occurredOn: "2026-10-10",
      author: "Mariana",
      payer: "Mariana",
      shared: false,
    });
    const res = await patch(mine.id, { version: 1, tags: ["x1"] }, lucas());
    expect(res.status).toBe(403);
    expect(await db.tag.count()).toBe(0);
  });
});

describe("US-045 edição não financeira", () => {
  it("mês acertado: só tags => 200 sem aviso; com valor => 409", async () => {
    const itau = await makeAccount(fx, {
      name: "Itaú",
      owner: "Lucas",
      openingBalanceInCents: 500000,
    });
    const shared = await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 80000,
      occurredOn: "2026-10-03",
      author: "Mariana",
      payer: "Mariana",
    });
    const settle = await at(() =>
      call(lucas(), "POST", "/api/v1/settlements", {
        period: "2026-10",
        fromMemberId: fx.byName.Lucas?.memberId,
        toMemberId: fx.byName.Mariana?.memberId,
        amountInCents: 40000,
        fromAccountId: itau.id,
        toAccountId: acc.id,
      }),
    );
    expect(settle.status).toBe(201);
    const before = await at(() => call(lucas(), "GET", "/api/v1/settlement?period=2026-10"));
    const ok = await patch(shared.id, { version: 1, tags: ["festa"] });
    expect(ok.status).toBe(200);
    expect(names(ok)).toEqual(["festa"]);
    const after = await at(() => call(lucas(), "GET", "/api/v1/settlement?period=2026-10"));
    expect(after.body).toEqual(before.body); // tag não muda o acerto
    const blocked = await patch(shared.id, { version: 2, amountInCents: 60000, tags: ["festa"] });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("SETTLED_PERIOD_CONFIRMATION_REQUIRED");
  });

  it("fatura paga e conta arquivada: só tags => 200", async () => {
    const card: CardFixture = await makeCard(fx, {
      name: "Visa",
      owner: "Mariana",
      limitInCents: 500000,
      closingDay: 5,
      dueDay: 15,
    });
    const purchase = await makeCardPurchase(fx, {
      card,
      amountInCents: 30000,
      occurredOn: "2026-09-10",
      author: "Mariana",
    });
    const inv = await db.cardInvoice.findFirstOrThrow({ where: { cardId: card.id } });
    await makeInvoicePayment(fx, {
      card,
      invoice: { id: inv.id, cardId: card.id, ref: inv.referenceMonth },
      account: acc,
      amountInCents: 30000,
      paidOn: "2026-10-12",
    });
    const blocked = await patch(purchase.id, { version: 1, amountInCents: 1000 });
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("INVOICE_PAID_LOCKED");
    const ok = await patch(purchase.id, { version: 1, tags: ["ferias"] });
    expect(ok.status).toBe(200);
    expect(names(ok)).toEqual(["ferias"]);

    const archivedAcc = await makeAccount(fx, { name: "Velha", owner: "Mariana" });
    const onArchived = await makeTransaction(fx, {
      account: archivedAcc,
      category: "Saúde",
      amountInCents: 1000,
      occurredOn: "2026-10-02",
      author: "Mariana",
    });
    await db.bankAccount.update({
      where: { id: archivedAcc.id },
      data: { archivedAt: new Date() },
    });
    expect((await patch(onArchived.id, { version: 1, amountInCents: 2000 })).status).toBe(422);
    const tagged = await patch(onArchived.id, { version: 1, tags: ["velha"] });
    expect(tagged.status).toBe(200);
    expect(names(tagged)).toEqual(["velha"]);
  });
});

describe("US-045 compra parcelada", () => {
  let card: CardFixture;
  beforeEach(async () => {
    card = await makeCard(fx, {
      name: "Nubank Lucas",
      owner: "Lucas",
      limitInCents: 1_000_000,
      closingDay: 25,
      dueDay: 5,
    });
  });

  const buy = (tags: string[] | undefined, count = 10) =>
    at(async () =>
      call(mariana(), "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        cardId: card.id,
        categoryId: await catId("Eletrônicos").catch(() => catId("Supermercado")),
        amountInCents: 250000,
        installments: count,
        description: "Notebook",
        ...(tags ? { tags } : {}),
      }),
    );

  it("as 10 parcelas recebem a tag; criação em 1 tag e 10 ligações", async () => {
    const res = await buy(["escritorio"]);
    expect(res.status).toBe(201);
    expect(names(res)).toEqual(["escritorio"]);
    expect(res.body.plan.installments).toHaveLength(10);
    expect(await db.tag.count()).toBe(1);
    expect(await db.transactionTag.count()).toBe(10);
    const rows = await db.transaction.findMany({
      where: { installmentPlanId: res.body.plan.id },
      include: { tags: true },
    });
    expect(rows.every((r) => r.tags.length === 1)).toBe(true);
  });

  it("PATCH de tags em UMA parcela (fatura da 3/10 paga) vale para todas, com revisão e version por parcela", async () => {
    const bought = await makeInstallmentPurchase(fx, {
      card,
      total: 250000,
      count: 10,
      purchaseOn: "2026-10-01",
      description: "Notebook",
      author: "Mariana",
    });
    const rows = await db.transaction.findMany({
      where: { installmentPlanId: bought.plan.id },
      orderBy: { installmentNo: "asc" },
    });
    const third = rows[2] as (typeof rows)[number];
    const inv = await db.cardInvoice.findFirstOrThrow({ where: { id: third.invoiceId as string } });
    await makeInvoicePayment(fx, {
      card,
      invoice: { id: inv.id, cardId: card.id, ref: inv.referenceMonth },
      account: acc,
      amountInCents: 25000,
      paidOn: "2026-10-12",
    });
    const res = await patch(third.id, { version: 1, tags: ["trabalho"] });
    expect(res.status).toBe(200);
    expect(names(res)).toEqual(["trabalho"]);
    const after = await db.transaction.findMany({
      where: { installmentPlanId: bought.plan.id },
      include: { tags: { include: { tag: true } } },
    });
    expect(after).toHaveLength(10);
    for (const r of after) {
      expect(r.tags.map((l) => l.tag.name)).toEqual(["trabalho"]);
      expect(r.version).toBe(2);
    }
    expect(
      await db.transactionRevision.count({
        where: { action: "UPDATE", changes: { path: ["0", "field"], equals: "tags" } },
      }),
    ).toBe(10);
    // trocar para outra: todas mudam de novo
    const again = await patch(rows[7]?.id as string, { version: 2, tags: ["lazer", "Trabalho"] });
    expect(again.status).toBe(200);
    const sets = new Set(
      (
        await db.transaction.findMany({
          where: { installmentPlanId: bought.plan.id },
          include: { tags: { include: { tag: true } } },
        })
      ).map((r) =>
        r.tags
          .map((l) => l.tag.name)
          .sort()
          .join(","),
      ),
    );
    expect([...sets]).toEqual(["lazer,trabalho"]);
  });

  it("campo financeiro em parcela sem alcance => 400 (US-041 exige `scope`)", async () => {
    const bought = await makeInstallmentPurchase(fx, {
      card,
      total: 250000,
      count: 3,
      purchaseOn: "2026-10-01",
    });
    const res = await patch(bought.transaction.id, { version: 1, amountInCents: 1000 });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("US-045 invariantes no banco", () => {
  it("nameKey único por família e CHECK de tamanho", async () => {
    const m = fx.byName.Mariana?.memberId as string;
    await db.tag.create({
      data: { familyId: fx.family.id, name: "viagem", nameKey: "viagem", createdByMemberId: m },
    });
    await expect(
      db.tag.create({
        data: { familyId: fx.family.id, name: "Viagem", nameKey: "viagem", createdByMemberId: m },
      }),
    ).rejects.toThrow();
    await expect(
      db.tag.create({
        data: { familyId: fx.family.id, name: "a", nameKey: "a", createdByMemberId: m },
      }),
    ).rejects.toThrow();
  });
});

describe("US-045 privacidade", () => {
  it("o arquivo 'Baixar meus dados' inclui os nomes das tags de cada lançamento", async () => {
    await post({ tags: ["viagem-nordeste", "ferias"] });
    await post({});
    const res = await at(() => call(mariana(), "GET", "/api/v1/me/export"));
    expect(res.status).toBe(200);
    const withTags = res.body.familiaAtual.lancamentos.filter(
      (l: { tags?: string[] }) => l.tags !== undefined,
    );
    expect(withTags).toHaveLength(1);
    expect(withTags[0].tags).toEqual(["ferias", "viagem-nordeste"]);
  });
});
