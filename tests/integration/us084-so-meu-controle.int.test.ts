import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
  makeTransaction,
} from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

// US-084 / D-GES-50 (DEV-120): num "Só meu", além do pagador (dono), também o DONO DA CONTA (ou do cartão) e o
// LANÇADOR (autor) editam, excluem, restauram e estornam. Seguem valendo: visibilidade, as travas anti-captura
// (SEC-025/026/038) e "ex-membro somente leitura".
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
let accCarla: AccountFixture; // conta da Carla
let accMariana: AccountFixture;
const as = (n: string) => fx.byName[n]?.as ?? null;
const idOf = (n: string) => fx.byName[n]?.memberId as string;
const catId = async (name: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name } })).id;

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

const mk = (account: AccountFixture, payer: string, author: string, shared = false) =>
  makeTransaction(fx, {
    account,
    category: "Supermercado",
    amountInCents: 5000,
    occurredOn: "2026-10-02",
    payer,
    author,
    shared,
  });
const patch = (who: string, id: string, version: number, body: Record<string, unknown>) =>
  at(() => call(as(who), "PATCH", `/api/v1/transactions/${id}`, { version, ...body }));
const post = (who: string, path: string, body: Record<string, unknown>) =>
  at(() => call(as(who), "POST", path, body));

describe("US-084 dono da conta controla o 'Só meu' lançado na conta dele", () => {
  it("Carla edita, exclui e restaura o 'Só meu' de Lucas na conta dela; a mensagem lista quem pode", async () => {
    const t = await mk(accCarla, "Lucas", "Lucas");
    const edit = await patch("Carla", t.id, 1, { amountInCents: 6500 });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    const del = await post("Carla", `/api/v1/transactions/${t.id}/delete`, { version: 2 });
    expect(del.status).toBe(200);
    const rest = await post("Carla", `/api/v1/transactions/${t.id}/restore`, { version: 3 });
    expect(rest.status).toBe(200);
    // quem não tem relação (mesmo Admin) segue com 403 e a mensagem nomeia Lucas e Carla
    for (const who of ["Mariana", "Bia"]) {
      const res = await patch(who, t.id, 4, { amountInCents: 7000 });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
      expect(res.body.error.message).toBe("Só Lucas e Carla podem alterar este lançamento.");
    }
    const row = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(Number(row.amountInCents)).toBe(6500);
    // todos continuam vendo
    expect((await at(() => call(as("Bia"), "GET", `/api/v1/transactions/${t.id}`))).status).toBe(
      200,
    );
  });

  it("o detalhe expõe o dono da conta para a UI", async () => {
    const t = await mk(accCarla, "Lucas", "Lucas");
    const res = await at(() => call(as("Bia"), "GET", `/api/v1/transactions/${t.id}`));
    expect(res.body.transaction.accountOwnerId).toBe(idOf("Carla"));
  });

  it("aceitar sugestão de categoria num 'Só meu' alheio: dono da conta pode, terceiro não", async () => {
    const t = await mk(accCarla, "Lucas", "Lucas");
    const from = (await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).categoryId;
    const to = await catId("Lazer e restaurantes");
    const body = { transactionId: t.id, version: 1, fromCategoryId: from, toCategoryId: to };
    expect((await post("Bia", "/api/v1/category-suggestions/accept", body)).status).toBe(403);
    expect((await post("Carla", "/api/v1/category-suggestions/accept", body)).status).toBe(200);
  });
});

describe("US-084 lançador controla o que registrou", () => {
  it("Lucas lança 'Só meu' pago por Mariana na conta dela: Lucas edita, exclui e restaura; Bia não", async () => {
    const t = await mk(accMariana, "Mariana", "Lucas");
    expect((await patch("Lucas", t.id, 1, { amountInCents: 5500 })).status).toBe(200);
    expect((await patch("Bia", t.id, 2, { amountInCents: 5600 })).status).toBe(403);
    expect(
      (await post("Lucas", `/api/v1/transactions/${t.id}/delete`, { version: 2 })).status,
    ).toBe(200);
    expect(
      (await post("Lucas", `/api/v1/transactions/${t.id}/restore`, { version: 3 })).status,
    ).toBe(200);
    // o pagador (dono) continua podendo
    expect((await patch("Mariana", t.id, 4, { amountInCents: 5700 })).status).toBe(200);
  });
});

describe("US-084 dono do cartão controla a compra parcelada 'Só meu' de outro", () => {
  it("Carla (dona do cartão) exclui e restaura o plano de Lucas; Bia recebe 403", async () => {
    const card = await makeCard(fx, {
      name: "Cartão da Carla",
      owner: "Carla",
      limitInCents: 500000,
      closingDay: 25,
      dueDay: 5,
    });
    const r = await makeInstallmentPurchase(fx, {
      card,
      total: 90000,
      count: 3,
      purchaseOn: "2026-10-02",
      author: "Lucas",
    });
    const planId = r.plan.id;
    const denied = await post("Bia", `/api/v1/installment-plans/${planId}/delete`, { version: 1 });
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toBe("Só Lucas e Carla podem alterar este lançamento.");
    expect(
      (await post("Carla", `/api/v1/installment-plans/${planId}/delete`, { version: 1 })).status,
    ).toBe(200);
    expect(
      (await post("Carla", `/api/v1/installment-plans/${planId}/restore`, { version: 2 })).status,
    ).toBe(200);
  });
});

describe("US-084 prevista 'Só meu': dono da conta 'Pagar com' controla", () => {
  it("Carla edita, dá baixa e estorna a prevista 'Só meu' de Lucas; Bia não", async () => {
    const created = await post("Lucas", "/api/v1/planned-expenses", {
      description: "Condomínio",
      amountInCents: 40000,
      dueOn: "2026-10-10",
      categoryId: await catId("Moradia"),
      responsibleMemberId: idOf("Lucas"),
      isSharedExpense: false,
      paymentAccountId: accCarla.id,
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const pe = created.body.plannedExpense as { id: string; version: number };
    const noOne = await at(() =>
      call(as("Bia"), "PATCH", `/api/v1/planned-expenses/${pe.id}`, {
        version: pe.version,
        amountInCents: 41000,
      }),
    );
    expect(noOne.status).toBe(403);
    expect(noOne.body.error.message).toBe("Só Lucas e Carla podem alterar este lançamento.");
    const edit = await at(() =>
      call(as("Carla"), "PATCH", `/api/v1/planned-expenses/${pe.id}`, {
        version: pe.version,
        amountInCents: 41000,
      }),
    );
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    const v = edit.body.plannedExpense.version as number;
    expect(
      (
        await post("Bia", `/api/v1/planned-expenses/${pe.id}/pay`, {
          version: v,
          accountId: accCarla.id,
        })
      ).status,
    ).toBe(403);
    const paid = await post("Carla", `/api/v1/planned-expenses/${pe.id}/pay`, {
      version: v,
      accountId: accCarla.id,
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);
    // a baixa continua "Só meu" de Lucas (o pagador não muda para quem deu a baixa)
    expect(paid.body.transaction.payer.id).toBe(idOf("Lucas"));
    const v2 = paid.body.plannedExpense.version as number;
    expect(
      (await post("Bia", `/api/v1/planned-expenses/${pe.id}/undo-payment`, { version: v2 })).status,
    ).toBe(403);
    expect(
      (await post("Carla", `/api/v1/planned-expenses/${pe.id}/undo-payment`, { version: v2 }))
        .status,
    ).toBe(200);
  });

  it("a baixa por quem controla não entrega o 'Só meu' a um terceiro", async () => {
    const created = await post("Lucas", "/api/v1/planned-expenses", {
      description: "Condomínio",
      amountInCents: 40000,
      dueOn: "2026-10-10",
      categoryId: await catId("Moradia"),
      responsibleMemberId: idOf("Lucas"),
      isSharedExpense: false,
      paymentAccountId: accCarla.id,
    });
    const pe = created.body.plannedExpense as { id: string; version: number };
    const res = await post("Carla", `/api/v1/planned-expenses/${pe.id}/pay`, {
      version: pe.version,
      accountId: accCarla.id,
      payerMemberId: idOf("Bia"),
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
  });
});

describe("US-084 as travas anti-captura continuam", () => {
  it("dono da conta e lançador não tornam 'Só meu' uma despesa dividida de outro", async () => {
    const t = await mk(accCarla, "Mariana", "Lucas", true); // dividida paga por Mariana, na conta da Carla, lançada por Lucas
    for (const who of ["Carla", "Lucas"]) {
      const res = await patch(who, t.id, 1, { isSharedExpense: false });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
      expect(res.body.error.message).toBe('Só quem pagou pode tornar este lançamento "Só meu".');
    }
    expect((await patch("Mariana", t.id, 1, { isSharedExpense: false })).status).toBe(200);
  });

  it("ninguém cria 'Só meu' em nome de outro, nem o dono da conta", async () => {
    const res = await post("Carla", "/api/v1/transactions", {
      type: "EXPENSE",
      accountId: accCarla.id,
      categoryId: await catId("Supermercado"),
      amountInCents: 3000,
      occurredOn: "2026-10-03",
      payerMemberId: idOf("Mariana"),
      isSharedExpense: false,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
  });

  it("quem controla sem pagar só assume o pagamento em nome próprio, não entrega a terceiro", async () => {
    const t = await mk(accCarla, "Lucas", "Lucas");
    const toThird = await patch("Carla", t.id, 1, { payerMemberId: idOf("Bia") });
    expect(toThird.status).toBe(403);
    expect(toThird.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
    const toSelf = await patch("Carla", t.id, 1, { payerMemberId: idOf("Carla") });
    expect(toSelf.status, JSON.stringify(toSelf.body)).toBe(200);
  });

  it("despesa dividida e receita seguem editáveis por qualquer membro", async () => {
    const t = await mk(accCarla, "Mariana", "Lucas", true);
    expect((await patch("Bia", t.id, 1, { amountInCents: 5100 })).status).toBe(200);
  });
});

describe("US-084 ex-membro continua somente leitura", () => {
  it("'Só meu' cujo dono saiu: nem o dono da conta nem o lançador alteram", async () => {
    const t = await mk(accCarla, "Lucas", "Bia");
    await db.member.update({
      where: { id: idOf("Lucas") },
      data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
    });
    for (const who of ["Carla", "Bia", "Mariana"]) {
      const res = await patch(who, t.id, 1, { amountInCents: 5100 });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    }
  });

  it("dono da conta que saiu não impede o dono de agir; o lançador ativo segue valendo", async () => {
    const t = await mk(accCarla, "Lucas", "Bia");
    await db.member.update({
      where: { id: idOf("Carla") },
      data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
    });
    expect((await patch("Lucas", t.id, 1, { amountInCents: 5100 })).status).toBe(200);
    expect((await patch("Bia", t.id, 2, { amountInCents: 5200 })).status).toBe(200);
    expect((await patch("Mariana", t.id, 3, { amountInCents: 5300 })).status).toBe(403);
  });
});
