import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  asUser,
  type CardFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makePlannedExpense,
  makeTransaction,
} from "../support/factories";

// D-GES-59 (SEC-051 + resíduo DEV-132; US-084, SDD-028 §11.3 item 14): o pagador/responsável de despesa paga por
// EX-MEMBRO que não voltou à família é imutável para todos, inclusive o Administrador, em "Só meu" e em dividida
// (lançamento, cartão, prevista e série), em qualquer PATCH. As provas do reteste da rodada 7 viram regressão.
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
let accCarla: AccountFixture;
let accMariana: AccountFixture;
let card: CardFixture;
const as = (n: string) => fx.byName[n]?.as ?? null;
const idOf = (n: string) => fx.byName[n]?.memberId as string;

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
  card = await makeCard(fx, { name: "Cartão da Carla", owner: "Carla" });
});

const removeLucas = () =>
  db.member.update({
    where: { id: idOf("Lucas") },
    data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
  });
const mk = (shared = false, description = "Farmácia") =>
  makeTransaction(fx, {
    account: accCarla,
    category: "Supermercado",
    amountInCents: 30000,
    occurredOn: "2026-10-02",
    payer: "Lucas",
    author: "Lucas",
    shared,
    description,
  });
const txRow = (id: string) => db.transaction.findUniqueOrThrow({ where: { id } });
const patch = async (who: string, id: string, body: Record<string, unknown>) =>
  at(async () =>
    call(as(who), "PATCH", `/api/v1/transactions/${id}`, {
      version: (await txRow(id)).version,
      ...body,
    }),
  );
const post = (who: string, url: string, body: Record<string, unknown>) =>
  at(() => call(as(who), "POST", url, body));
type SRow = { member: { name: string }; differenceInCents: number };
const settlement = async () => {
  const res = await at(() => call(as("Bia"), "GET", "/api/v1/settlement?period=2026-10"));
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return res.body.members as SRow[];
};
const GONE = /ex-membro e não pode ser alterado/;

describe("D-GES-59 lançamento: pagador de ex-membro é imutável para todos", () => {
  it("prova do reteste (DEV-132): o Admin assume e divide em dois pedidos ⇒ o primeiro é 403 e o acerto não muda", async () => {
    const t = await mk();
    await removeLucas();
    const before = await settlement();
    const assume = await patch("Mariana", t.id, { payerMemberId: idOf("Mariana") });
    expect(assume.status, JSON.stringify(assume.body)).toBe(403);
    expect(assume.body.error.message).toMatch(GONE);
    const withAccount = await patch("Mariana", t.id, {
      payerMemberId: idOf("Mariana"),
      accountId: accMariana.id,
    });
    expect(withAccount.status).toBe(403);
    // sem o primeiro passo, dividir não faz de Mariana a credora
    expect((await patch("Mariana", t.id, { isSharedExpense: true })).status).toBe(200);
    const row = await txRow(t.id);
    expect(row.payerMemberId).toBe(idOf("Lucas"));
    expect(row.isSharedExpense).toBe(true);
    const rows = await settlement();
    const get = (n: string) => rows.find((r) => r.member.name.startsWith(n))?.differenceInCents;
    expect(get("Lucas")).toBeGreaterThan(0);
    expect(get("Mariana")).toBeLessThan(0);
    expect(before.every((r) => r.differenceInCents === 0)).toBe(true);
  });

  it("prova do reteste (SEC-051): depois de dividir, nem o Admin nem Carla nem Bia trocam o pagador (403); o crédito e a observação ficam", async () => {
    const t = await mk();
    await db.transaction.update({ where: { id: t.id }, data: { note: "sessão sigilosa" } });
    await removeLucas();
    expect((await patch("Mariana", t.id, { isSharedExpense: true })).status).toBe(200);
    const after = await settlement();
    for (const [who, payer] of [
      ["Mariana", "Carla"],
      ["Mariana", "Mariana"],
      ["Carla", "Bia"],
      ["Carla", "Mariana"],
      ["Bia", "Carla"],
    ] as const) {
      const res = await patch(who, t.id, { payerMemberId: idOf(payer) });
      expect(res.status, `${who} -> ${payer}`).toBe(403);
      expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    }
    expect((await txRow(t.id)).payerMemberId).toBe(idOf("Lucas"));
    expect(await settlement()).toEqual(after);
    // a observação do ex-membro continua fora da exportação dos demais (SEC-050), pois o pagador não mudou
    for (const who of ["Carla", "Bia", "Mariana"]) {
      const exp = await at(() => call(as(who), "GET", "/api/v1/me/export"));
      const line = (
        exp.body.familiaAtual.lancamentos as Array<{ id: string; observacao: string | null }>
      ).find((l) => l.id === t.id);
      expect(line?.observacao, who).toBeNull();
    }
    expect((await txRow(t.id)).note).toBe("sessão sigilosa");
  });

  it("dividida criada já com pagador ex-membro: Admin, Carla e Bia também não trocam; reenviar o mesmo pagador vale", async () => {
    const t = await mk(true);
    await removeLucas();
    for (const who of ["Mariana", "Carla", "Bia"]) {
      expect((await patch(who, t.id, { payerMemberId: idOf("Carla") })).status, who).toBe(403);
    }
    const same = await patch("Carla", t.id, {
      payerMemberId: idOf("Lucas"),
      description: "Remédio",
    });
    expect(same.status, JSON.stringify(same.body)).toBe(200);
    expect((await txRow(t.id)).payerMemberId).toBe(idOf("Lucas"));
  });

  it("compra no cartão (e parcela) com pagador ex-membro: o pagador é fixo, também para o Admin", async () => {
    const solo = await makeCardPurchase(fx, {
      card,
      amountInCents: 8000,
      occurredOn: "2026-10-02",
      payer: "Lucas",
      author: "Lucas",
      shared: false,
      description: "Livro",
    });
    const dividida = await makeCardPurchase(fx, {
      card,
      amountInCents: 9000,
      occurredOn: "2026-10-02",
      payer: "Lucas",
      author: "Lucas",
      shared: true,
      description: "Cinema",
    });
    await removeLucas();
    for (const id of [solo.id, dividida.id]) {
      for (const who of ["Mariana", "Carla"]) {
        expect((await patch(who, id, { payerMemberId: idOf(who) })).status, who).toBe(403);
      }
      expect((await txRow(id)).payerMemberId).toBe(idOf("Lucas"));
    }
    // o Admin segue editando a descrição do "Só meu" do cartão
    expect((await patch("Mariana", solo.id, { description: "Livro técnico" })).status).toBe(200);
  });

  it("o Admin mantém os demais poderes sobre o 'Só meu' de ex-membro: editar, conta, dividir, excluir, restaurar", async () => {
    const t = await mk();
    await removeLucas();
    const edit = await patch("Mariana", t.id, {
      amountInCents: 31000,
      description: "Farmácia 2",
      note: "ok",
      accountId: accMariana.id,
    });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    expect((await patch("Mariana", t.id, { isSharedExpense: true })).status).toBe(200);
    const del = await post("Mariana", `/api/v1/transactions/${t.id}/delete`, {
      version: (await txRow(t.id)).version,
    });
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    const res = await post("Mariana", `/api/v1/transactions/${t.id}/restore`, {
      version: (await txRow(t.id)).version,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = await txRow(t.id);
    expect(row.accountId).toBe(accMariana.id);
    expect(row.payerMemberId).toBe(idOf("Lucas"));
  });

  it("negativos: dividida de membro ATIVO segue como antes (qualquer membro troca o pagador, validando o destino)", async () => {
    const t = await makeTransaction(fx, {
      account: accCarla,
      category: "Supermercado",
      amountInCents: 5000,
      occurredOn: "2026-10-02",
      payer: "Carla",
      author: "Carla",
      shared: true,
    });
    expect((await patch("Bia", t.id, { payerMemberId: idOf("Mariana") })).status).toBe(200);
    expect((await patch("Mariana", t.id, { payerMemberId: idOf("Bia") })).status).toBe(200);
    expect((await txRow(t.id)).payerMemberId).toBe(idOf("Bia"));
  });

  it("negativos: pagador inexistente ou de outra família continua recusado (sem IDOR)", async () => {
    const t = await mk();
    await removeLucas();
    const res = await patch("Mariana", t.id, {
      payerMemberId: "00000000-0000-4000-8000-000000000000",
    });
    expect([403, 404, 422]).toContain(res.status);
    expect((await txRow(t.id)).payerMemberId).toBe(idOf("Lucas"));
  });
});

describe("D-GES-59 quem voltou à família segue alterando (SEC-049)", () => {
  const rejoinLucas = async () => {
    const inv = await at(() =>
      call(as("Mariana"), "POST", "/api/v1/invitations", {
        email: "lucas@exemplo.com",
        role: "MEMBER",
      }),
    );
    expect(inv.status, JSON.stringify(inv.body)).toBe(201);
    const lucasAs = await asUser("lucas@exemplo.com", { name: "Lucas Silva" });
    const res = await at(() =>
      call(lucasAs, "POST", `/api/v1/me/invitations/${inv.body.invitation.id}/accept`, {}),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return lucasAs;
  };

  it("Lucas volta: divide o item antigo e troca o pagador da dividida; o Admin continua sem poder pleno", async () => {
    const t = await mk();
    await removeLucas();
    const lucas = await rejoinLucas();
    // o Admin perde o poder pleno sobre o "Só meu" de quem voltou
    expect((await patch("Mariana", t.id, { isSharedExpense: true })).status).toBe(403);
    const version = () => txRow(t.id).then((r) => r.version);
    const divide = await at(async () =>
      call(lucas, "PATCH", `/api/v1/transactions/${t.id}`, {
        version: await version(),
        isSharedExpense: true,
      }),
    );
    expect(divide.status, JSON.stringify(divide.body)).toBe(200);
    const swap = await at(async () =>
      call(lucas, "PATCH", `/api/v1/transactions/${t.id}`, {
        version: await version(),
        payerMemberId: idOf("Carla"),
      }),
    );
    expect(swap.status, JSON.stringify(swap.body)).toBe(200);
    expect((await txRow(t.id)).payerMemberId).toBe(idOf("Carla"));
  });
});

describe("D-GES-59 previstas e séries", () => {
  const planned = (shared: boolean) =>
    makePlannedExpense(fx, {
      description: "Escola",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared,
    });
  const pPatch = (who: string, id: string, body: Record<string, unknown>) =>
    at(async () => {
      const row = await db.plannedExpense.findUniqueOrThrow({ where: { id } });
      return call(as(who), "PATCH", `/api/v1/planned-expenses/${id}`, {
        version: row.version,
        ...body,
      });
    });

  it("prevista 'Só meu' e dividida de ex-membro: ninguém troca o responsável (Admin assumir/dividir inclusive)", async () => {
    const solo = await planned(false);
    const dividida = await planned(true);
    await removeLucas();
    for (const who of ["Mariana", "Carla"]) {
      for (const body of [
        { responsibleMemberId: idOf(who) },
        { responsibleMemberId: idOf("Bia"), isSharedExpense: true },
      ]) {
        const res = await pPatch(who, solo.id, body);
        expect(res.status, `${who} solo ${JSON.stringify(body)}`).toBe(403);
      }
      const res = await pPatch(who, dividida.id, { responsibleMemberId: idOf("Bia") });
      expect(res.status, `${who} dividida`).toBe(403);
    }
    // Admin assume (403) e divide em dois pedidos: o segundo pedido não existe como brecha
    expect((await pPatch("Mariana", solo.id, { isSharedExpense: true })).status).toBe(200);
    expect((await pPatch("Mariana", solo.id, { responsibleMemberId: idOf("Carla") })).status).toBe(
      403,
    );
    for (const id of [solo.id, dividida.id]) {
      expect(
        (await db.plannedExpense.findUniqueOrThrow({ where: { id } })).responsibleMemberId,
      ).toBe(idOf("Lucas"));
    }
    // demais poderes do Admin: valor/descrição
    expect((await pPatch("Mariana", solo.id, { amountInCents: 12000 })).status).toBe(200);
  });

  it("prevista de membro ATIVO dividida: qualquer membro troca o responsável como antes", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Internet",
      amountInCents: 9000,
      dueOn: "2026-10-20",
      responsible: "Carla",
      shared: true,
    });
    expect((await pPatch("Bia", p.id, { responsibleMemberId: idOf("Mariana") })).status).toBe(200);
  });

  it("série de ex-membro (Só meu e dividida): o responsável é fixo para o Admin e os demais", async () => {
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Moradia" },
    });
    const mkSeries = async (shared: boolean, description: string) => {
      const created = await at(() =>
        call(as("Lucas"), "POST", "/api/v1/recurring-expenses", {
          description,
          amountInCents: 10000,
          categoryId: cat.id,
          isSharedExpense: shared,
          dayOfMonth: 5,
          startMonth: "2026-10",
          end: { kind: "COUNT", months: 2 },
          paymentAccountId: accMariana.id,
        }),
      );
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      return created.body.series as { id: string; version: number };
    };
    const solo = await mkSeries(false, "Academia");
    const dividida = await mkSeries(true, "Streaming");
    await removeLucas();
    for (const s of [solo, dividida]) {
      for (const who of ["Mariana", "Carla"]) {
        const res = await at(() =>
          call(as(who), "PATCH", `/api/v1/recurring-expenses/${s.id}`, {
            version: s.version,
            responsibleMemberId: idOf(who),
          }),
        );
        expect(res.status, `${who} ${s.id}`).toBe(403);
      }
      const row = await db.recurringExpense.findUniqueOrThrow({ where: { id: s.id } });
      expect(row.responsibleMemberId).toBe(idOf("Lucas"));
    }
  });

  it("baixa de prevista de ex-membro (DEV-135): paga em nome de quem a realiza; outro pagador ⇒ 403; o responsável da prevista não muda", async () => {
    const solo = await planned(false);
    const dividida = await planned(true);
    await removeLucas();
    const pay = (who: string, id: string, body: Record<string, unknown>) =>
      post(who, `/api/v1/planned-expenses/${id}/pay`, { version: 1, ...body });
    // Admin em "Só meu": informar Carla ou o próprio ex-membro como pagador ⇒ 403
    for (const payer of ["Carla", "Lucas"]) {
      const res = await pay("Mariana", solo.id, {
        accountId: accMariana.id,
        payerMemberId: idOf(payer),
      });
      expect(res.status, payer).toBe(403);
    }
    const ok = await pay("Mariana", solo.id, { accountId: accMariana.id });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const t = await txRow(ok.body.transaction.id);
    expect(t.payerMemberId).toBe(idOf("Mariana"));
    expect(t.isSharedExpense).toBe(false);
    // dividida: qualquer membro paga em nome próprio; em nome do ex-membro ⇒ 403
    expect(
      (await pay("Carla", dividida.id, { accountId: accCarla.id, payerMemberId: idOf("Lucas") }))
        .status,
    ).toBe(403);
    const okShared = await pay("Carla", dividida.id, { accountId: accCarla.id });
    expect(okShared.status, JSON.stringify(okShared.body)).toBe(201);
    expect((await txRow(okShared.body.transaction.id)).payerMemberId).toBe(idOf("Carla"));
    const row = await db.plannedExpense.findUniqueOrThrow({ where: { id: dividida.id } });
    expect(row.responsibleMemberId).toBe(idOf("Lucas"));
  });
});
