import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
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
} from "../support/factories";
import { oauthDance, stubCimd, toolCall, useMcpEnv } from "../support/mcp-client";

// US-089 (SDD-030 §9.2): CreditCard.paymentAccountId só SUGERE; nada de pagamento/saldo muda.
const db = testDb();
const NOW = "2026-10-28T15:00:00Z"; // out/2026 fechada em 25/10, vence 05/11
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
let corrente: AccountFixture;
let poupanca: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const patch = (who: ReturnType<typeof mariana>, id: string, body: Record<string, unknown>) =>
  at(() => call(who, "PATCH", `/api/v1/cards/${id}`, body));
const create = (body: Record<string, unknown>) =>
  at(() =>
    call(mariana(), "POST", "/api/v1/cards", {
      name: "Nubank",
      limitInCents: 500000,
      closingDay: 25,
      dueDay: 5,
      ...body,
    }),
  );
const accountAct = (who: ReturnType<typeof mariana>, id: string, act: string, version = 1) =>
  at(() => call(who, "POST", `/api/v1/accounts/${id}/${act}`, { version }));
const events = () => db.familyEvent.findMany({ where: { type: "CARD_PAYER_ACCOUNT_CHANGED" } });

beforeEach(async () => {
  await resetDb();
  useMcpEnv();
  stubCimd();
  fx = await makeFamily();
  corrente = await makeAccount(fx, { name: "Corrente", openingBalanceInCents: 300000 });
  poupanca = await makeAccount(fx, { name: "Poupança", openingBalanceInCents: 0 });
});
afterEach(() => vi.unstubAllGlobals());

async function closedInvoiceCard(payer?: AccountFixture) {
  const card = await makeCard(fx, {
    name: "Nubank",
    closingDay: 25,
    dueDay: 5,
    ...(payer ? { paymentAccount: payer } : {}),
  });
  await makeCardPurchase(fx, { card, amountInCents: 150000, occurredOn: "2026-10-10" });
  return card;
}

describe("US-089 criar e atualizar", () => {
  it("cria sem e com pagadora; sem evento na criação", async () => {
    const a = await create({});
    expect(a.status).toBe(201);
    expect(a.body.card.paymentAccount).toBeNull();
    const b = await create({ name: "Visa", paymentAccountId: corrente.id });
    expect(b.status).toBe(201);
    expect(b.body.card.paymentAccount).toEqual({
      id: corrente.id,
      name: "Corrente",
      archived: false,
    });
    expect(await events()).toHaveLength(0);
  });

  it("PATCH define, troca e remove; version sobe só quando muda; igual = 200 sem subir", async () => {
    const card = (await create({})).body.card;
    const set = await patch(mariana(), card.id, { version: 1, paymentAccountId: corrente.id });
    expect(set.status).toBe(200);
    expect(set.body.card).toMatchObject({ version: 2, paymentAccount: { name: "Corrente" } });
    const same = await patch(mariana(), card.id, { version: 2, paymentAccountId: corrente.id });
    expect(same.status).toBe(200);
    expect(same.body.card.version).toBe(2);
    const swap = await patch(lucas(), card.id, { version: 2, paymentAccountId: poupanca.id });
    expect(swap.body.card).toMatchObject({ version: 3, paymentAccount: { name: "Poupança" } });
    const rm = await patch(mariana(), card.id, { version: 3, paymentAccountId: null });
    expect(rm.body.card).toMatchObject({ version: 4, paymentAccount: null });
    const ev = (await events()).map((e) => e.changes);
    expect(ev).toHaveLength(3);
    expect(ev[0]).toMatchObject({
      cardId: card.id,
      fromAccountId: null,
      fromAccountName: null,
      toAccountId: corrente.id,
      toAccountName: "Corrente",
    });
    expect(ev[1]).toMatchObject({ fromAccountName: "Corrente", toAccountName: "Poupança" });
    expect(ev[2]).toMatchObject({ fromAccountName: "Poupança", toAccountId: null });
    const first = await db.familyEvent.findFirstOrThrow({
      where: { type: "CARD_PAYER_ACCOUNT_CHANGED" },
      orderBy: { at: "asc" },
    });
    expect(first.actorMemberId).toBe(fx.byName.Mariana?.memberId);
  });

  it("422 INVALID_REFERENCE para conta arquivada, excluída e de outra família (criar e atualizar)", async () => {
    const velha = await makeAccount(fx, { name: "Velha", openingBalanceInCents: 0 });
    const morta = await makeAccount(fx, { name: "Morta", openingBalanceInCents: 0 });
    expect((await accountAct(mariana(), velha.id, "archive")).status).toBe(200);
    expect((await accountAct(mariana(), morta.id, "delete")).status).toBe(200);
    const other = await makeFamily({ uniqueEmails: true, name: "Outra" });
    const alheia = await makeAccount(other, { name: "Alheia" });
    const card = (await create({})).body.card;
    for (const id of [velha.id, morta.id, alheia.id]) {
      const c = await create({ name: `X${id.slice(0, 4)}`, paymentAccountId: id });
      expect(c.status).toBe(422);
      expect(c.body.error.code).toBe("INVALID_REFERENCE");
      expect(c.body.error.details[0].path).toBe("paymentAccountId");
      const u = await patch(mariana(), card.id, { version: 1, paymentAccountId: id });
      expect(u.status).toBe(422);
      expect(u.body.error.details[0].path).toBe("paymentAccountId");
    }
    expect(await db.creditCard.count({ where: { familyId: fx.family.id } })).toBe(1);
    const bad = await patch(mariana(), card.id, { version: 1, paymentAccountId: "nao-uuid" });
    expect(bad.status).toBe(400);
  });

  it("renomear cartão cuja pagadora foi arquivada => 200 (não revalida o vínculo inalterado)", async () => {
    const card = (await create({ paymentAccountId: poupanca.id })).body.card;
    await accountAct(mariana(), poupanca.id, "archive");
    const r = await patch(mariana(), card.id, {
      version: 1,
      name: "Nubank 2",
      paymentAccountId: poupanca.id,
    });
    expect(r.status).toBe(200);
    expect(r.body.card).toMatchObject({
      name: "Nubank 2",
      paymentAccount: { id: poupanca.id, archived: true },
    });
    expect(await events()).toHaveLength(0);
  });
});

describe("US-089 arquivar, reativar e excluir a conta", () => {
  it("arquivar não toca o cartão; payerForCards antes; reativar restaura", async () => {
    const card = (await create({ paymentAccountId: poupanca.id })).body.card;
    const before = (await at(() => call(mariana(), "GET", "/api/v1/accounts"))).body.items.find(
      (a: { id: string }) => a.id === poupanca.id,
    );
    expect(before.payerForCards).toEqual([{ id: card.id, name: "Nubank" }]);
    await accountAct(mariana(), poupanca.id, "archive");
    const row = await db.creditCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(row.version).toBe(1);
    expect(row.paymentAccountId).toBe(poupanca.id);
    const got = await at(() => call(mariana(), "GET", `/api/v1/cards/${card.id}`));
    expect(got.body.card.paymentAccount).toEqual({
      id: poupanca.id,
      name: "Poupança",
      archived: true,
    });
    await accountAct(mariana(), poupanca.id, "unarchive", 2);
    const back = await at(() => call(mariana(), "GET", `/api/v1/cards/${card.id}`));
    expect(back.body.card.paymentAccount.archived).toBe(false);
    expect(back.body.card.version).toBe(1);
  });

  it("excluir conta com pagadora limpa o vínculo, sobe version e registra evento ACCOUNT_DELETED", async () => {
    const card = (await create({ paymentAccountId: poupanca.id })).body.card;
    const del = await accountAct(mariana(), poupanca.id, "delete");
    expect(del.status).toBe(200);
    const row = await db.creditCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(row.paymentAccountId).toBeNull();
    expect(row.version).toBe(2);
    const ev = await events();
    expect(ev).toHaveLength(1);
    expect(ev[0]?.changes).toMatchObject({
      cardId: card.id,
      fromAccountName: "Poupança",
      toAccountId: null,
      reason: "ACCOUNT_DELETED",
    });
  });

  it("excluir x PATCH concorrente termina sem deadlock", async () => {
    const card = (await create({})).body.card;
    const [a, b] = await Promise.all([
      accountAct(mariana(), poupanca.id, "delete"),
      patch(lucas(), card.id, { version: 1, paymentAccountId: poupanca.id }),
    ]);
    expect([200]).toContain(a.status);
    expect([200, 422]).toContain(b.status);
    const row = await db.creditCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(row.paymentAccountId).toBeNull(); // nunca fica vínculo morto
  });
});

describe("US-089 só sugere: o app nunca paga sozinho", () => {
  it("passa o tempo com fatura fechada e vencida: nenhum pagamento nem mudança de saldo", async () => {
    const card = await closedInvoiceCard(corrente);
    const late = "2026-11-20T15:00:00Z";
    for (const path of [
      "/api/v1/cards",
      "/api/v1/payables",
      "/api/v1/home",
      "/api/v1/month-summary",
    ]) {
      expect((await withClock(late, () => call(mariana(), "GET", path))).status).toBe(200);
    }
    expect(await db.transaction.count({ where: { kind: "INVOICE_PAYMENT" } })).toBe(0);
    const accs = (await at(() => call(mariana(), "GET", "/api/v1/accounts"))).body.items;
    expect(accs.find((a: { id: string }) => a.id === corrente.id).balanceInCents).toBe(300000);
    const noAcc = await at(() =>
      call(mariana(), "POST", `/api/v1/cards/${card.id}/invoices/2026-10/pay`, {
        expectedTotalInCents: 150000,
      }),
    );
    expect(noAcc.status).toBe(400); // Zod: accountId obrigatório (o app não escolhe sozinho)
  });

  it("pagar com outra conta mantém o vínculo; trocar a pagadora depois não muda o pago", async () => {
    const card = await closedInvoiceCard(corrente);
    const paid = await at(() =>
      call(mariana(), "POST", `/api/v1/cards/${card.id}/invoices/2026-10/pay`, {
        accountId: poupanca.id,
        expectedTotalInCents: 150000,
      }),
    );
    expect(paid.status).toBe(201);
    const pay = await db.transaction.findFirstOrThrow({ where: { kind: "INVOICE_PAYMENT" } });
    expect(pay.accountId).toBe(poupanca.id);
    expect(
      (await db.creditCard.findUniqueOrThrow({ where: { id: card.id } })).paymentAccountId,
    ).toBe(corrente.id);
    const g = await at(() => call(mariana(), "GET", `/api/v1/cards/${card.id}`));
    await patch(mariana(), card.id, { version: g.body.card.version, paymentAccountId: null });
    const after = await db.transaction.findUniqueOrThrow({ where: { id: pay.id } });
    expect(after.accountId).toBe(poupanca.id);
    expect(after.amountInCents).toBe(pay.amountInCents);
  });
});

describe("US-089 A pagar, byAccount, MCP, export, autorização", () => {
  it("item INVOICE traz a pagadora ATIVA; arquivada => null; soma na linha da conta e reconcilia", async () => {
    await closedInvoiceCard(corrente);
    const p = (await at(() => call(mariana(), "GET", "/api/v1/payables?period=2026-11"))).body;
    const inv = p.items.find((i: { type: string }) => i.type === "INVOICE");
    expect(inv).toMatchObject({ paymentAccountId: corrente.id, paymentAccountName: "Corrente" });
    const row = p.byAccount.rows.find(
      (r: { account: { name: string } | null }) => r.account?.name === "Corrente",
    );
    expect(row).toMatchObject({ dueInCents: 150000, itemCount: 1 });
    expect(
      p.byAccount.rows.reduce((t: number, r: { dueInCents: number }) => t + r.dueInCents, 0),
    ).toBe(p.totals.dueInCents);
    await db.bankAccount.update({ where: { id: corrente.id }, data: { archivedAt: new Date() } });
    const q = (await at(() => call(mariana(), "GET", "/api/v1/payables?period=2026-11"))).body;
    const inv2 = q.items.find((i: { type: string }) => i.type === "INVOICE");
    expect(inv2).toMatchObject({ paymentAccountId: null, paymentAccountName: null });
    expect(q.byAccount.rows.find((r: { account: unknown }) => r.account === null)).toMatchObject({
      dueInCents: 150000,
    });
  });

  it("MCP previstas_do_mes: fatura com pagadora não expõe payWith", async () => {
    await closedInvoiceCard(corrente);
    const token = (await at(() => oauthDance({ member: mariana() as never }))).accessToken;
    const r = await at(() => toolCall(token, "previstas_do_mes", { period: "2026-11" }));
    const items = r.body.result.structuredContent.items as Array<{
      kind: string;
      payWith: unknown;
    }>;
    const inv = items.find((i) => i.kind === "INVOICE");
    expect(inv).toBeDefined();
    expect(inv?.payWith).toBeNull();
  });

  it("não-titular edita a pagadora (200) mas não troca o titular (403 CARD_OWNER_ONLY)", async () => {
    const card = await makeCard(fx, { name: "Do Lucas", owner: "Lucas" });
    const ok = await patch(mariana(), card.id, { version: 1, paymentAccountId: corrente.id });
    expect(ok.status).toBe(200);
    const no = await patch(mariana(), card.id, {
      version: 2,
      ownerMemberId: fx.byName.Mariana?.memberId,
    });
    expect(no.status).toBe(403);
    expect(no.body.error.code).toBe("CARD_OWNER_ONLY");
  });

  it("export LGPD: cartoes[].contaPagadoraId validado pelo schema estrito", async () => {
    await makeCard(fx, { name: "Com", paymentAccount: corrente });
    await makeCard(fx, { name: "Sem" });
    const r = await at(() => call(mariana(), "GET", "/api/v1/me/export"));
    expect(r.status).toBe(200);
    const file = ExportSchema.parse(r.body);
    const byName = Object.fromEntries((file.familiaAtual?.cartoes ?? []).map((c) => [c.nome, c]));
    expect(byName.Com?.contaPagadoraId).toBe(corrente.id);
    expect(byName.Sem?.contaPagadoraId).toBeNull();
  });

  it("FK composta ON DELETE RESTRICT: conta vinculada não some do banco (exclusão da família: sec017d com cartão vinculado no seed)", async () => {
    const card: CardFixture = await makeCard(fx, { name: "Com", paymentAccount: corrente });
    const fk = await db.creditCard.findUniqueOrThrow({ where: { id: card.id } });
    expect(fk.paymentAccountId).toBe(corrente.id);
    await expect(db.bankAccount.delete({ where: { id: corrente.id } })).rejects.toThrow();
  });
});
