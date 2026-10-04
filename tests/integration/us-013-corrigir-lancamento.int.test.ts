import { beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import * as ledger from "@/modules/contas/ledger";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
let fx: FamilyFixture;
let nubank: AccountFixture;
let itau: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;
const cat = async (name: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name } })).id;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  fx = await makeFamily();
  nubank = await makeAccount(fx, {
    name: "Nubank Conjunta",
    owner: "Mariana",
    openingBalanceInCents: 100000,
  });
  itau = await makeAccount(fx, {
    name: "Itaú Mariana",
    owner: "Mariana",
    openingBalanceInCents: 50000,
  });
});

/** Despesa de 15050 criada pela API (saldo da conta 84950), com revisão CREATE. */
async function create(over: Record<string, unknown> = {}) {
  const res = await at(async () =>
    call(lucas(), "POST", "/api/v1/transactions", {
      type: "EXPENSE",
      accountId: nubank.id,
      categoryId: await cat("Supermercado"),
      amountInCents: 15050,
      ...over,
    }),
  );
  expect(res.status).toBe(201);
  return res.body.transaction as { id: string; version: number };
}
const patch = (
  as: ReturnType<typeof mariana>,
  id: string,
  body: Record<string, unknown>,
  opts = {},
) => at(() => call(as, "PATCH", `/api/v1/transactions/${id}`, body, opts));
const del = (as: ReturnType<typeof mariana>, id: string, version: number) =>
  at(() => call(as, "POST", `/api/v1/transactions/${id}/delete`, { version }));
const restore = (as: ReturnType<typeof mariana>, id: string, version: number) =>
  at(() => call(as, "POST", `/api/v1/transactions/${id}/restore`, { version }));
const balance = async (id = nubank.id) =>
  (await at(() => call(lucas(), "GET", "/api/v1/accounts"))).body.items.find(
    (a: { id: string }) => a.id === id,
  ).balanceInCents as number;

describe("US-013a Corrigir ou excluir um lançamento", () => {
  it("Corrigir valor: saldo 84950 -> 89450, version 2, 'Editado por Mariana', revisão com o campo", async () => {
    const t = await create();
    expect(await balance()).toBe(84950);
    const res = await patch(mariana(), t.id, { version: 1, amountInCents: 10550 });
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({
      version: 2,
      amountInCents: 10550,
      editedBy: { name: "Mariana Silva" },
      updatedBy: { name: "Mariana Silva" },
    });
    expect(res.body.account).toEqual({ id: nubank.id, balanceInCents: 89450 });
    expect(await balance()).toBe(89450);
    const rev = await db.transactionRevision.findFirstOrThrow({
      where: { transactionId: t.id, action: "UPDATE" },
    });
    expect(rev).toMatchObject({ revision: 2, actorMemberId: mid("Mariana") });
    expect(rev.changes).toEqual([{ field: "amountInCents", from: 15050, to: 10550 }]);
  });

  it("Trilha de auditoria: CREATE e UPDATE com ator, campo, antes/depois e rótulos; ordem decrescente", async () => {
    const t = await create();
    await patch(mariana(), t.id, {
      version: 1,
      accountId: itau.id,
      categoryId: await cat("Transporte"),
      payerMemberId: mid("Mariana"),
      isSharedExpense: false,
    });
    const h = await at(() => call(lucas(), "GET", `/api/v1/transactions/${t.id}/history`));
    expect(h.status).toBe(200);
    expect(h.body.items.map((i: { action: string }) => i.action)).toEqual(["UPDATE", "CREATE"]);
    const upd = h.body.items[0];
    expect(upd.actor.name).toBe("Mariana Silva");
    const by = Object.fromEntries(upd.changes.map((c: { field: string }) => [c.field, c]));
    expect(by.accountId).toMatchObject({
      label: "Conta",
      fromLabel: "Nubank Conjunta",
      toLabel: "Itaú Mariana",
    });
    expect(by.categoryId).toMatchObject({
      label: "Categoria",
      fromLabel: "Supermercado",
      toLabel: "Transporte",
    });
    expect(by.payerMemberId).toMatchObject({
      label: "Quem pagou",
      fromLabel: "Lucas Silva",
      toLabel: "Mariana Silva",
    });
    expect(by.isSharedExpense).toMatchObject({
      label: "Dividir com a família",
      fromLabel: "Comum",
      toLabel: "Pessoal",
    });
    expect(h.body.items[1].actor.name).toBe("Lucas Silva");
    // trilha é append-only
    const rev = await db.transactionRevision.findFirstOrThrow({ where: { transactionId: t.id } });
    await expect(
      db.transactionRevision.update({ where: { id: rev.id }, data: { revision: 9 } }),
    ).rejects.toThrow();
    await expect(db.transactionRevision.delete({ where: { id: rev.id } })).rejects.toThrow();
  });

  it("Excluir: some do extrato padrão, aparece com includeDeleted, saldo restabelecido; repetir => ALREADY_DELETED", async () => {
    const t = await create();
    const res = await del(mariana(), t.id, 1);
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({ version: 2, deletionReason: "DELETED" });
    expect(await balance()).toBe(100000);
    const std = await at(() => call(lucas(), "GET", "/api/v1/transactions"));
    expect(std.body.items).toHaveLength(0);
    expect(std.body.totals.expenseInCents).toBe(0);
    const inc = await at(() => call(lucas(), "GET", "/api/v1/transactions?includeDeleted=true"));
    expect(inc.body.items).toHaveLength(1);
    expect(inc.body.items[0].deletedAt).not.toBeNull();
    const again = await del(mariana(), t.id, 2);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_DELETED");
    expect(
      await db.transactionRevision.count({ where: { transactionId: t.id, action: "DELETE" } }),
    ).toBe(1);
  });

  it("Restaurar: volta ao saldo e à listagem; restaurar não excluído => 422 NOT_RESTORABLE; transferência desfeita não restaura", async () => {
    const t = await create();
    expect((await restore(mariana(), t.id, 1)).body.error.code).toBe("NOT_RESTORABLE");
    await del(mariana(), t.id, 1);
    const res = await restore(lucas(), t.id, 2);
    expect(res.status).toBe(200);
    expect(res.body.transaction).toMatchObject({
      version: 3,
      deletedAt: null,
      deletionReason: null,
    });
    expect(await balance()).toBe(84950);
    expect((await at(() => call(lucas(), "GET", "/api/v1/transactions"))).body.items).toHaveLength(
      1,
    );
    expect(
      await db.transactionRevision.count({ where: { transactionId: t.id, action: "RESTORE" } }),
    ).toBe(1);
  });

  it("Conflito de edição: dois PATCH com a mesma version => 200 e 409 com a mensagem; o perdedor não grava", async () => {
    const t = await create();
    const [a, b] = await Promise.all([
      patch(mariana(), t.id, { version: 1, amountInCents: 10550 }),
      patch(lucas(), t.id, { version: 1, amountInCents: 20000 }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const loser = a.status === 409 ? a : b;
    const winnerName = a.status === 200 ? "Mariana" : "Lucas";
    expect(loser.body.error.code).toBe("VERSION_CONFLICT");
    expect(loser.body.error.message).toBe(
      `Este lançamento foi alterado por ${winnerName}. Recarregue para continuar.`,
    );
    expect(loser.body.error.details.currentVersion).toBe(2);
    const row = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.version).toBe(2);
    expect(
      await db.transactionRevision.count({ where: { transactionId: t.id, action: "UPDATE" } }),
    ).toBe(1);
  });

  it("Versão velha em PATCH/delete => 409 VERSION_CONFLICT", async () => {
    const t = await create();
    await patch(mariana(), t.id, { version: 1, description: "Mercado do mês" });
    const stale = await patch(lucas(), t.id, { version: 1, amountInCents: 1 });
    expect(stale.status).toBe(409);
    expect((await del(lucas(), t.id, 1)).body.error.code).toBe("VERSION_CONFLICT");
  });

  it("Acerto recalculado: 'Lucas deve 40000' -> excluir despesa comum de 40000 da Mariana => 'Lucas deve 20000'", async () => {
    const mk = (amount: number) =>
      makeTransaction(fx, {
        account: nubank,
        category: "Supermercado",
        amountInCents: amount,
        occurredOn: "2026-10-03",
        author: "Mariana",
        payer: "Mariana",
      });
    await mk(40000);
    const second = await mk(40000);
    const panel = () => at(() => call(lucas(), "GET", "/api/v1/settlement"));
    expect((await panel()).body.suggestions[0]).toMatchObject({
      from: { name: "Lucas Silva" },
      amountInCents: 40000,
    });
    expect((await del(mariana(), second.id, 1)).status).toBe(200);
    expect((await panel()).body.suggestions[0].amountInCents).toBe(20000);
    expect((await restore(mariana(), second.id, 2)).status).toBe(200);
    expect((await panel()).body.suggestions[0].amountInCents).toBe(40000);
  });

  it("Validações da edição: valor 0 => mensagem exata e nada gravado; categoria de receita em despesa => 422; data futura => 422", async () => {
    const t = await create();
    const zero = await patch(mariana(), t.id, { version: 1, amountInCents: 0 });
    expect(zero.status).toBe(400);
    expect(zero.body.error.message).toBe("Informe um valor maior que zero");
    const kind = await patch(mariana(), t.id, { version: 1, categoryId: await cat("Salário") });
    expect(kind.body.error.code).toBe("CATEGORY_KIND_MISMATCH");
    const future = await patch(mariana(), t.id, { version: 1, occurredOn: "2026-10-05" });
    expect(future.body.error.code).toBe("FUTURE_DATE_NOT_ALLOWED");
    expect(future.body.error.message).toBe("Para contas futuras, use Despesa prevista");
    const row = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.version).toBe(1);
    expect(row.amountInCents).toBe(15050n);
  });

  it("Sem alteração: PATCH sem diferença => 200 com version e revisões inalterados", async () => {
    const t = await create();
    const res = await patch(mariana(), t.id, {
      version: 1,
      amountInCents: 15050,
      description: "Supermercado",
    });
    expect(res.status).toBe(200);
    expect(res.body.transaction.version).toBe(1);
    expect(
      await db.transactionRevision.count({ where: { transactionId: t.id, action: "UPDATE" } }),
    ).toBe(0);
  });

  it("Edição de data e conta: mover conta move o saldo; receita rejeita isSharedExpense; excluído não edita", async () => {
    const t = await create();
    await patch(mariana(), t.id, { version: 1, accountId: itau.id, occurredOn: "2026-10-01" });
    expect(await balance(nubank.id)).toBe(100000);
    expect(await balance(itau.id)).toBe(50000 - 15050);
    const income = await at(async () =>
      call(lucas(), "POST", "/api/v1/transactions", {
        type: "INCOME",
        accountId: nubank.id,
        categoryId: await cat("Salário"),
        amountInCents: 1000,
      }),
    );
    const bad = await patch(mariana(), income.body.transaction.id, {
      version: 1,
      isSharedExpense: true,
    });
    expect(bad.status).toBe(400);
    await del(mariana(), t.id, 2);
    const deleted = await patch(mariana(), t.id, { version: 3, amountInCents: 5 });
    expect(deleted.status).toBe(422);
    expect(deleted.body.error.code).toBe("TRANSACTION_DELETED");
  });

  it("Atomicidade: falha ao gravar a revisão => a atualização não persiste", async () => {
    const t = await create();
    vi.spyOn(ledger, "recordRevision").mockRejectedValueOnce(new Error("falha injetada"));
    const res = await patch(mariana(), t.id, { version: 1, amountInCents: 10550 });
    expect(res.status).toBe(500);
    vi.restoreAllMocks();
    const row = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(row.amountInCents).toBe(15050n);
    expect(row.version).toBe(1);
  });

  it("Pernas de transferência e abertura: PATCH e delete => 422 NOT_EDITABLE", async () => {
    const { makeTransfer } = await import("../support/factories");
    await makeTransfer(fx, {
      from: nubank,
      to: itau,
      amountInCents: 1000,
      occurredOn: "2026-10-02",
    });
    const leg = await db.transaction.findFirstOrThrow({ where: { kind: "TRANSFER_OUT" } });
    const opening = await db.transaction.findFirstOrThrow({ where: { kind: "OPENING" } });
    for (const id of [leg.id, opening.id]) {
      const p = await patch(mariana(), id, { version: 1, description: "xx" });
      expect(p.status).toBe(422);
      expect(p.body.error.code).toBe("NOT_EDITABLE");
      expect(p.body.error.message).toBe(
        "Transferências e acertos não podem ser editados. Use Desfazer.",
      );
      expect((await del(mariana(), id, 1)).body.error.code).toBe("NOT_EDITABLE");
    }
  });

  it("Isolamento: GET/PATCH/delete/restore/history de outra família => 404", async () => {
    const t = await create();
    const other = await makeFamily({ uniqueEmails: true });
    const b = other.members[0]?.as ?? null;
    expect((await patch(b, t.id, { version: 1, description: "xx" })).status).toBe(404);
    expect((await del(b, t.id, 1)).status).toBe(404);
    expect((await restore(b, t.id, 1)).status).toBe(404);
    expect((await at(() => call(b, "GET", `/api/v1/transactions/${t.id}/history`))).status).toBe(
      404,
    );
    expect((await at(() => call(b, "GET", `/api/v1/transactions/${t.id}`))).status).toBe(404);
  });

  it(".strict() e idempotência: campo estranho => 400; mesma chave repete a resposta", async () => {
    const t = await create();
    expect((await patch(mariana(), t.id, { version: 1, familyId: fx.family.id })).status).toBe(400);
    const key = crypto.randomUUID();
    const a = await patch(
      mariana(),
      t.id,
      { version: 1, amountInCents: 10550 },
      { idempotencyKey: key },
    );
    const b = await patch(
      mariana(),
      t.id,
      { version: 1, amountInCents: 10550 },
      { idempotencyKey: key },
    );
    expect(a.status).toBe(200);
    expect(b.headers.get("Idempotent-Replay")).toBe("true");
    expect(
      await db.transactionRevision.count({ where: { transactionId: t.id, action: "UPDATE" } }),
    ).toBe(1);
  });
});
