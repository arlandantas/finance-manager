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
  makePlannedExpense,
  makeTransaction,
} from "../support/factories";
import { makeInstallmentPurchase } from "../support/installment-factory";

// Reteste do "Só meu" (reteste-so-meu-2026-10-25): SEC-042..046 + D-GES-52. As provas do relatório viram regressão.
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
let accCarla: AccountFixture;
let accMariana: AccountFixture;
let accBia: AccountFixture;
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
  accBia = await makeAccount(fx, {
    name: "Conta da Bia",
    owner: "Bia",
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
const txRow = (id: string) => db.transaction.findUniqueOrThrow({ where: { id } });
const STRUCTURE = "Só quem pagou pode alterar a divisão, o pagador e a conta deste lançamento.";

// ---------------------------------------------------------------------------------------------------------------
describe("SEC-042 titular do cartão", () => {
  const card = () =>
    makeCard(fx, {
      name: "Cartão da Carla",
      owner: "Carla",
      limitInCents: 500000,
      closingDay: 25,
      dueDay: 5,
    });
  const patchCard = (who: string, id: string, body: Record<string, unknown>) =>
    at(() => call(as(who), "PATCH", `/api/v1/cards/${id}`, { version: 1, ...body }));

  it("prova do relatório: membro sem relação não troca o titular e segue sem controlar a compra de Lucas", async () => {
    const c = await card();
    const plan = (
      await makeInstallmentPurchase(fx, {
        card: c,
        total: 90000,
        count: 3,
        purchaseOn: "2026-10-02",
        author: "Lucas",
      })
    ).plan;
    const del = () => post("Bia", `/api/v1/installment-plans/${plan.id}/delete`, { version: 1 });
    expect((await del()).status).toBe(403); // passo 1
    const swap = await patchCard("Bia", c.id, { ownerMemberId: idOf("Bia") }); // passo 2
    expect(swap.status).toBe(403);
    expect(swap.body.error.code).toBe("CARD_OWNER_ONLY");
    expect(swap.body.error.message).toBe(
      "Só o titular do cartão ou o Administrador podem trocar o titular.",
    );
    expect((await del()).status).toBe(403); // passo 3: nada mudou
    const row = await db.creditCard.findUniqueOrThrow({ where: { id: c.id } });
    expect(row.ownerMemberId).toBe(idOf("Carla"));
    expect(await db.familyEvent.count({ where: { type: "CARD_OWNER_CHANGED" } })).toBe(0);
  });

  it("outros campos do cartão continuam editáveis por qualquer membro", async () => {
    const c = await card();
    const res = await patchCard("Bia", c.id, { limitInCents: 600000 });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    // reenviar o mesmo titular não é troca
    const same = await patchCard("Bia", c.id, { version: 2, ownerMemberId: idOf("Carla") });
    expect(same.status).toBe(200);
  });

  it("o titular atual troca o titular e a troca fica no histórico da família", async () => {
    const c = await card();
    const res = await patchCard("Carla", c.id, { ownerMemberId: idOf("Lucas") });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const ev = await db.familyEvent.findFirstOrThrow({ where: { type: "CARD_OWNER_CHANGED" } });
    expect(ev.actorMemberId).toBe(idOf("Carla"));
    expect(ev.targetMemberId).toBe(idOf("Lucas"));
    expect(ev.changes).toMatchObject({
      cardId: c.id,
      cardName: "Cartão da Carla",
      fromMemberId: idOf("Carla"),
      toMemberId: idOf("Lucas"),
    });
    const fam = await at(() => call(as("Bia"), "GET", "/api/v1/family"));
    expect(fam.body.events.some((e: { type: string }) => e.type === "CARD_OWNER_CHANGED")).toBe(
      true,
    );
  });

  it("o Administrador também troca o titular, com registro; o antigo titular perde a vez", async () => {
    const c = await card();
    const res = await patchCard("Mariana", c.id, { ownerMemberId: idOf("Mariana") });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const ev = await db.familyEvent.findFirstOrThrow({ where: { type: "CARD_OWNER_CHANGED" } });
    expect(ev.actorMemberId).toBe(idOf("Mariana"));
    const back = await patchCard("Carla", c.id, { version: 2, ownerMemberId: idOf("Carla") });
    expect(back.status).toBe(403);
  });

  it("conta bancária não aceita troca de titular pela API", async () => {
    const res = await at(() =>
      call(as("Bia"), "PATCH", `/api/v1/accounts/${accCarla.id}`, {
        version: 1,
        ownerMemberId: idOf("Bia"),
      }),
    );
    const row = await db.bankAccount.findUniqueOrThrow({ where: { id: accCarla.id } });
    expect(row.ownerMemberId).toBe(idOf("Carla"));
    expect([400, 403, 422]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("SEC-043 quem só controla não assume o 'Só meu' de outro", () => {
  it("prova do relatório: Carla (dona da conta) e Mariana (lançadora) não viram pagadoras; Lucas segue no controle", async () => {
    const t = await mk(accCarla, "Lucas", "Mariana", true); // dividida paga por Lucas, na conta da Carla, lançada por Mariana
    expect((await patch("Lucas", t.id, 1, { isSharedExpense: false })).status).toBe(200);
    for (const who of ["Carla", "Mariana"]) {
      const res = await patch(who, t.id, 2, { payerMemberId: idOf(who) });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
      expect(res.body.error.message).toBe(STRUCTURE);
    }
    expect((await txRow(t.id)).payerMemberId).toBe(idOf("Lucas"));
    expect((await patch("Lucas", t.id, 2, { amountInCents: 5100 })).status).toBe(200);
  });

  it("o próprio pagador não entrega a um terceiro (trava anti-captura mantida)", async () => {
    const t = await mk(accCarla, "Lucas", "Lucas");
    const res = await patch("Lucas", t.id, 1, { payerMemberId: idOf("Bia") });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
  });

  it("prevista: dono da conta 'Pagar com' e lançador não viram responsáveis; a exportação do dono não muda", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Academia",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      author: "Mariana",
      shared: false,
    });
    await db.plannedExpense.update({
      where: { id: p.id },
      data: { paymentAccountId: accCarla.id },
    });
    for (const who of ["Carla", "Mariana"]) {
      const res = await at(() =>
        call(as(who), "PATCH", `/api/v1/planned-expenses/${p.id}`, {
          version: 1,
          responsibleMemberId: idOf(who),
        }),
      );
      expect(res.status).toBe(403);
      expect(res.body.error.message).toBe(STRUCTURE);
    }
    const row = await db.plannedExpense.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.responsibleMemberId).toBe(idOf("Lucas"));
  });

  it("a baixa por quem só controla não o torna pagador", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Academia",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
    });
    await db.plannedExpense.update({
      where: { id: p.id },
      data: { paymentAccountId: accCarla.id },
    });
    const res = await post("Carla", `/api/v1/planned-expenses/${p.id}/pay`, {
      version: 1,
      accountId: accCarla.id,
      payerMemberId: idOf("Carla"),
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("SEC-044 quem só controla não muda divisão, pagador, conta nem 'Pagar com'", () => {
  it("altera valor, data, descrição, categoria e observação, exclui e restaura", async () => {
    const t = await mk(accCarla, "Lucas", "Lucas");
    const ok = await patch("Carla", t.id, 1, {
      amountInCents: 6000,
      occurredOn: "2026-10-03",
      description: "Mercado do bairro",
      categoryId: await catId("Lazer e restaurantes"),
      note: "ajustado pela dona da conta",
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(
      (await post("Carla", `/api/v1/transactions/${t.id}/delete`, { version: 2 })).status,
    ).toBe(200);
    expect(
      (await post("Carla", `/api/v1/transactions/${t.id}/restore`, { version: 3 })).status,
    ).toBe(200);
  });

  it("(a)(b)(c) entrega em dois passos, divisão e conta: tudo 403 e o item fica intacto", async () => {
    const t = await mk(accCarla, "Lucas", "Lucas");
    const attempts: Array<Record<string, unknown>> = [
      { isSharedExpense: true, payerMemberId: idOf("Bia") },
      { isSharedExpense: true },
      { accountId: accMariana.id },
      { accountId: accBia.id },
    ];
    for (const body of attempts) {
      const res = await patch("Carla", t.id, 1, body);
      expect(res.status, JSON.stringify(body)).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    }
    const row = await txRow(t.id);
    expect(row.isSharedExpense).toBe(false);
    expect(row.payerMemberId).toBe(idOf("Lucas"));
    expect(row.accountId).toBe(accCarla.id);
    expect(row.version).toBe(1);
    // reenviar o formulário inteiro com os mesmos valores não conta como mudança estrutural
    const same = await patch("Carla", t.id, 1, {
      amountInCents: 5100,
      payerMemberId: idOf("Lucas"),
      accountId: accCarla.id,
      isSharedExpense: false,
    });
    expect(same.status, JSON.stringify(same.body)).toBe(200);
  });

  it("o dono continua mudando divisão e conta do que é dele", async () => {
    const t = await mk(accCarla, "Lucas", "Lucas");
    expect((await patch("Lucas", t.id, 1, { accountId: accMariana.id })).status).toBe(200);
    expect((await patch("Lucas", t.id, 2, { isSharedExpense: true })).status).toBe(200);
  });

  it("prevista: divisão, responsável e 'Pagar com' são do responsável; descrição e valor não", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Academia",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
    });
    await db.plannedExpense.update({
      where: { id: p.id },
      data: { paymentAccountId: accCarla.id },
    });
    const url = `/api/v1/planned-expenses/${p.id}`;
    for (const body of [
      { isSharedExpense: true },
      { paymentAccountId: accBia.id },
      { responsibleMemberId: idOf("Bia") },
    ]) {
      const res = await at(() => call(as("Carla"), "PATCH", url, { version: 1, ...body }));
      expect(res.status, JSON.stringify(body)).toBe(403);
    }
    const ok = await at(() =>
      call(as("Carla"), "PATCH", url, {
        version: 1,
        description: "Academia nova",
        amountInCents: 11000,
        paymentAccountId: accCarla.id,
      }),
    );
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it("(d) baixa com conta de terceiro é recusada; com a conta do responsável ou a própria, passa", async () => {
    const mkPlanned = async () => {
      const p = await makePlannedExpense(fx, {
        description: "Condomínio",
        amountInCents: 10000,
        dueOn: "2026-10-20",
        responsible: "Lucas",
        shared: false,
      });
      await db.plannedExpense.update({
        where: { id: p.id },
        data: { paymentAccountId: accCarla.id },
      });
      return p;
    };
    const p = await mkPlanned();
    const bad = await post("Carla", `/api/v1/planned-expenses/${p.id}/pay`, {
      version: 1,
      accountId: accBia.id,
    });
    expect(bad.status).toBe(403);
    expect(bad.body.error.message).toBe(STRUCTURE);
    const ok = await post("Carla", `/api/v1/planned-expenses/${p.id}/pay`, {
      version: 1,
      accountId: accCarla.id,
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.transaction.payer.id).toBe(idOf("Lucas"));
  });

  it("(d) o estorno da baixa também exige controle sobre a prevista", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Condomínio",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
    });
    await db.plannedExpense.update({
      where: { id: p.id },
      data: { paymentAccountId: accCarla.id },
    });
    const paid = await post("Carla", `/api/v1/planned-expenses/${p.id}/pay`, {
      version: 1,
      accountId: accCarla.id,
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);
    // estado do relatório: a despesa gerada fica numa conta da Bia (que não controla a prevista)
    await db.transaction.update({
      where: { id: paid.body.transaction.id },
      data: { accountId: accBia.id },
    });
    const v = paid.body.plannedExpense.version as number;
    const undo = await post("Bia", `/api/v1/planned-expenses/${p.id}/undo-payment`, { version: v });
    expect(undo.status).toBe(403);
    expect(undo.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    expect((await txRow(paid.body.transaction.id)).deletedAt).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("SEC-045 encerrar série preserva o 'Só meu' de outro", () => {
  it("Bia encerra a série dividida: as divididas saem e a ocorrência 'Só meu' de Lucas continua", async () => {
    const created = await at(async () =>
      call(as("Mariana"), "POST", "/api/v1/recurring-expenses", {
        description: "Academia",
        amountInCents: 10000,
        categoryId: await catId("Moradia"),
        responsibleMemberId: idOf("Lucas"),
        isSharedExpense: true,
        paymentAccountId: accMariana.id,
        dayOfMonth: 5,
        startMonth: "2026-10",
        end: { kind: "COUNT", months: 3 },
      }),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const s = created.body.series as { id: string; version: number };
    const occ = await db.plannedExpense.findMany({
      where: { seriesId: s.id },
      orderBy: { dueOn: "asc" },
    });
    expect(occ.length).toBe(3);
    const nov = occ[1] as (typeof occ)[number];
    const mine = await at(() =>
      call(as("Lucas"), "PATCH", `/api/v1/planned-expenses/${nov.id}`, {
        version: nov.version,
        isSharedExpense: false,
      }),
    );
    expect(mine.status, JSON.stringify(mine.body)).toBe(200);
    // Bia não consegue mexer na ocorrência "Só meu" diretamente...
    const direct = await at(() =>
      call(as("Bia"), "PATCH", `/api/v1/planned-expenses/${nov.id}`, {
        version: 2,
        amountInCents: 1,
      }),
    );
    expect(direct.status).toBe(403);
    // ...nem pelo encerramento da série
    const end = await at(() =>
      call(as("Bia"), "POST", `/api/v1/recurring-expenses/${s.id}/end`, { version: s.version }),
    );
    expect(end.status, JSON.stringify(end.body)).toBe(200);
    expect(end.body.removedCount).toBe(2);
    const after = await db.plannedExpense.findMany({ where: { seriesId: s.id } });
    const byId = new Map(after.map((o) => [o.id, o]));
    expect(byId.get(nov.id)?.deletedAt).toBeNull();
    for (const o of occ.filter((x) => x.id !== nov.id)) {
      expect(byId.get(o.id)?.deletedAt).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("SEC-046 remoção de membro avisa quem passa a controlar", () => {
  it("a revisão traz o aviso quando há contas; sem contas, não", async () => {
    const withAcc = await at(() =>
      call(as("Mariana"), "GET", `/api/v1/members/${idOf("Carla")}/removal-review`),
    );
    expect(withAcc.status).toBe(200);
    expect(withAcc.body.reassignNotice).toContain('"Só meu"');
    expect(withAcc.body.reassignNotice).toContain("Carla");
    const none = await at(() =>
      call(as("Mariana"), "GET", `/api/v1/members/${idOf("Lucas")}/removal-review`),
    );
    expect(none.body.reassignNotice).toBeNull();
  });

  it("depois de reatribuir a conta, Mariana passa a controlar o 'Só meu' lançado nela (comportamento avisado)", async () => {
    const t = await mk(accCarla, "Lucas", "Lucas");
    const rm = await post("Mariana", `/api/v1/members/${idOf("Carla")}/remove`, {
      reassign: { accounts: { [accCarla.id]: idOf("Mariana") }, cards: {} },
    });
    expect(rm.status, JSON.stringify(rm.body)).toBe(200);
    expect((await patch("Mariana", t.id, 1, { amountInCents: 5100 })).status).toBe(200);
    expect((await patch("Bia", t.id, 2, { amountInCents: 5200 })).status).toBe(403);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("D-GES-52 Administrador altera o 'Só meu' de ex-membro", () => {
  const removeLucas = () =>
    db.member.update({
      where: { id: idOf("Lucas") },
      data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
    });

  it("Mariana (Admin) edita, exclui e restaura; Carla (dona da conta) e Bia (Membro) seguem só leitura", async () => {
    const t = await mk(accCarla, "Lucas", "Bia");
    await removeLucas();
    for (const who of ["Carla", "Bia"]) {
      const res = await patch(who, t.id, 1, { amountInCents: 5100 });
      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    }
    const edit = await patch("Mariana", t.id, 1, { amountInCents: 8500, description: "Ajuste" });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    expect(
      (await post("Mariana", `/api/v1/transactions/${t.id}/delete`, { version: 2 })).status,
    ).toBe(200);
    expect(
      (await post("Mariana", `/api/v1/transactions/${t.id}/restore`, { version: 3 })).status,
    ).toBe(200);
    expect(Number((await txRow(t.id)).amountInCents)).toBe(8500);
    // o Admin age como quem só controla: não muda divisão, pagador nem conta
    for (const body of [
      { isSharedExpense: true },
      { payerMemberId: idOf("Mariana") },
      { accountId: accMariana.id },
    ]) {
      const res = await patch("Mariana", t.id, 4, body);
      expect(res.status, JSON.stringify(body)).toBe(403);
    }
  });

  it("estorna a baixa e edita a prevista 'Só meu' de ex-membro; o membro comum não", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Condomínio",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
    });
    await db.plannedExpense.update({
      where: { id: p.id },
      data: { paymentAccountId: accCarla.id },
    });
    const paid = await post("Lucas", `/api/v1/planned-expenses/${p.id}/pay`, {
      version: 1,
      accountId: accCarla.id,
    });
    expect(paid.status, JSON.stringify(paid.body)).toBe(201);
    await removeLucas();
    const v = paid.body.plannedExpense.version as number;
    expect(
      (await post("Carla", `/api/v1/planned-expenses/${p.id}/undo-payment`, { version: v })).status,
    ).toBe(403);
    const undo = await post("Mariana", `/api/v1/planned-expenses/${p.id}/undo-payment`, {
      version: v,
    });
    expect(undo.status, JSON.stringify(undo.body)).toBe(200);
    const url = `/api/v1/planned-expenses/${p.id}`;
    const nv = undo.body.plannedExpense.version as number;
    expect(
      (await at(() => call(as("Carla"), "PATCH", url, { version: nv, amountInCents: 1 }))).status,
    ).toBe(403);
    expect(
      (await at(() => call(as("Mariana"), "PATCH", url, { version: nv, amountInCents: 12000 })))
        .status,
    ).toBe(200);
    expect(
      (
        await at(() =>
          call(as("Mariana"), "PATCH", url, { version: nv + 1, isSharedExpense: true }),
        )
      ).status,
    ).toBe(403);
  });

  it("compra parcelada 'Só meu' de ex-membro: Admin exclui; membro comum não", async () => {
    const c = await makeCard(fx, {
      name: "Cartão do Lucas",
      owner: "Lucas",
      limitInCents: 500000,
      closingDay: 25,
      dueDay: 5,
    });
    const plan = (
      await makeInstallmentPurchase(fx, {
        card: c,
        total: 90000,
        count: 3,
        purchaseOn: "2026-10-02",
        author: "Lucas",
      })
    ).plan;
    await removeLucas();
    expect(
      (await post("Bia", `/api/v1/installment-plans/${plan.id}/delete`, { version: 1 })).status,
    ).toBe(403);
    const del = await post("Mariana", `/api/v1/installment-plans/${plan.id}/delete`, {
      version: 1,
    });
    expect(del.status, JSON.stringify(del.body)).toBe(200);
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe("D-GES-52 o histórico mantém quem alterou", () => {
  it("dono da conta, lançador e dono aparecem como autores das revisões", async () => {
    const t = await mk(accCarla, "Lucas", "Bia");
    expect((await patch("Carla", t.id, 1, { amountInCents: 5100 })).status).toBe(200);
    expect((await patch("Bia", t.id, 2, { description: "pela Bia" })).status).toBe(200);
    expect((await patch("Lucas", t.id, 3, { note: "pelo dono" })).status).toBe(200);
    const hist = await at(() => call(as("Mariana"), "GET", `/api/v1/transactions/${t.id}/history`));
    expect(hist.status).toBe(200);
    const updates = (hist.body.items as Array<{ action: string; actor: { id: string } }>).filter(
      (r) => r.action === "UPDATE",
    );
    expect(updates.map((r) => r.actor.id).sort()).toEqual(
      [idOf("Carla"), idOf("Bia"), idOf("Lucas")].sort(),
    );
  });

  it("a alteração do Administrador sobre ex-membro fica com o nome dele", async () => {
    const t = await mk(accCarla, "Lucas", "Lucas");
    await db.member.update({
      where: { id: idOf("Lucas") },
      data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
    });
    expect((await patch("Mariana", t.id, 1, { amountInCents: 5100 })).status).toBe(200);
    expect(
      (await post("Mariana", `/api/v1/transactions/${t.id}/delete`, { version: 2 })).status,
    ).toBe(200);
    const hist = await at(() => call(as("Bia"), "GET", `/api/v1/transactions/${t.id}/history`));
    const actors = (hist.body.items as Array<{ action: string; actor: { id: string } }>)
      .filter((r) => r.action !== "CREATE")
      .map((r) => r.actor.id);
    expect(actors).toEqual([idOf("Mariana"), idOf("Mariana")]);
  });
});
