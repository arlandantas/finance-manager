import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makePlannedExpense,
  makeTransaction,
} from "../support/factories";

// D-GES-55 (US-084, SDD-028 §11.3 item 12): o Administrador ATUAL tem poderes plenos (divisão, pagador, conta e
// "Pagar com") sobre o "Só meu" cujo dono é ex-membro. Só ele e só nesse caso.
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
let accLucas: AccountFixture;
let accCarla: AccountFixture;
let accMariana: AccountFixture;
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
  accLucas = await makeAccount(fx, {
    name: "Conta do Lucas",
    owner: "Lucas",
    openingBalanceInCents: 100000,
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

const removeLucas = () =>
  db.member.update({
    where: { id: idOf("Lucas") },
    data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
  });
const mk = (account: AccountFixture, payer: string, author = payer, shared = false) =>
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
const txRow = (id: string) => db.transaction.findUniqueOrThrow({ where: { id } });

describe("D-GES-55 lançamento 'Só meu' de ex-membro", () => {
  it("Admin torna dividido e troca a conta (o pagador continua o ex-membro, SEC-048); o histórico guarda o Admin", async () => {
    const t = await mk(accLucas, "Lucas");
    await removeLucas();
    const res = await patch("Mariana", t.id, 1, {
      isSharedExpense: true,
      accountId: accMariana.id,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = await txRow(t.id);
    expect(row.isSharedExpense).toBe(true);
    expect(row.payerMemberId).toBe(idOf("Lucas"));
    expect(row.accountId).toBe(accMariana.id);
    const hist = await at(() => call(as("Bia"), "GET", `/api/v1/transactions/${t.id}/history`));
    const actors = (hist.body.items as Array<{ action: string; actor: { id: string } }>)
      .filter((r) => r.action === "UPDATE")
      .map((r) => r.actor.id);
    expect(actors).toEqual([idOf("Mariana")]);
  });

  it("Admin continua 'Só meu' trocando a conta e assume o pagamento em nome próprio; não entrega a terceiro", async () => {
    const t = await mk(accLucas, "Lucas");
    await removeLucas();
    const toCarla = await patch("Mariana", t.id, 1, { payerMemberId: idOf("Carla") });
    expect(toCarla.status).toBe(403);
    expect(toCarla.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
    const ok = await patch("Mariana", t.id, 1, {
      payerMemberId: idOf("Mariana"),
      accountId: accMariana.id,
    });
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const row = await txRow(t.id);
    expect(row.payerMemberId).toBe(idOf("Mariana"));
    expect(row.isSharedExpense).toBe(false);
  });

  it("pagador ex-membro, inexistente ou de outra família e conta de outra família: recusados (sem IDOR)", async () => {
    const t = await mk(accLucas, "Lucas");
    await removeLucas();
    await db.member.update({
      where: { id: idOf("Bia") },
      data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
    });
    const other = await makeFamily({
      members: [{ email: "estranho@exemplo.com", name: "Estranho", role: "ADMIN" }],
    });
    const otherAcc = await makeAccount(other, { name: "Conta alheia", owner: "Estranho" });
    const otherMember = other.byName.Estranho?.memberId as string;
    for (const body of [
      { isSharedExpense: true, payerMemberId: otherMember },
      { isSharedExpense: true, payerMemberId: idOf("Bia") }, // ex-membro
      { isSharedExpense: true, payerMemberId: "00000000-0000-4000-8000-000000000000" },
      { payerMemberId: otherMember },
      { accountId: otherAcc.id },
    ]) {
      const res = await patch("Mariana", t.id, 1, body);
      expect([403, 404, 422], JSON.stringify(body)).toContain(res.status);
    }
    const row = await txRow(t.id);
    expect(row.payerMemberId).toBe(idOf("Lucas"));
    expect(row.accountId).toBe(accLucas.id);
    expect(row.isSharedExpense).toBe(false);
  });

  it("Membro, dono da conta e lançador (não Admin) seguem sem poder; nada muda", async () => {
    const t = await mk(accCarla, "Lucas", "Bia");
    await removeLucas();
    for (const who of ["Carla", "Bia"]) {
      for (const body of [
        { isSharedExpense: true },
        { payerMemberId: idOf(who) },
        { accountId: accMariana.id },
      ]) {
        const res = await patch(who, t.id, 1, body);
        expect(res.status, `${who} ${JSON.stringify(body)}`).toBe(403);
      }
    }
    const row = await txRow(t.id);
    expect(row.isSharedExpense).toBe(false);
    expect(row.payerMemberId).toBe(idOf("Lucas"));
    expect(row.accountId).toBe(accCarla.id);
  });
});

describe("D-GES-55 limites mantidos com dono ATIVO", () => {
  it("Admin sobre 'Só meu' de membro ativo, dono da conta e lançador: divisão, pagador e conta seguem 403", async () => {
    const t = await mk(accCarla, "Lucas", "Bia");
    const attempts: Array<[string, Record<string, unknown>]> = [];
    for (const who of ["Mariana", "Carla", "Bia"]) {
      attempts.push([who, { isSharedExpense: true }]);
      attempts.push([who, { payerMemberId: idOf(who) }]);
      attempts.push([who, { accountId: accMariana.id }]);
    }
    for (const [who, body] of attempts) {
      const res = await patch(who, t.id, 1, body);
      // Mariana (Admin sem relação) não pode nem editar: 403 PERSONAL_OWNER_ONLY; Carla/Bia: estrutura
      expect(res.status, `${who} ${JSON.stringify(body)}`).toBe(403);
    }
    const row = await txRow(t.id);
    expect(row.isSharedExpense).toBe(false);
    expect(row.payerMemberId).toBe(idOf("Lucas"));
    expect(row.accountId).toBe(accCarla.id);
  });

  it("Admin que é dono da conta de um 'Só meu' de membro ativo não ganha poder pleno", async () => {
    const t = await mk(accMariana, "Lucas", "Lucas");
    const res = await patch("Mariana", t.id, 1, { isSharedExpense: true });
    expect(res.status).toBe(403);
    expect(res.body.error.message).toBe(
      "Só quem pagou pode alterar a divisão, o pagador e a conta deste lançamento.",
    );
  });
});

describe("D-GES-55 prevista e série 'Só meu' de ex-membro", () => {
  it("Admin torna a prevista dividida, troca responsável e 'Pagar com'; Membro e dono da conta, não", async () => {
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
    await removeLucas();
    const url = `/api/v1/planned-expenses/${p.id}`;
    const body = { isSharedExpense: true, paymentAccountId: accMariana.id };
    for (const who of ["Carla", "Bia"]) {
      expect((await at(() => call(as(who), "PATCH", url, { version: 1, ...body }))).status).toBe(
        403,
      );
    }
    const ok = await at(() => call(as("Mariana"), "PATCH", url, { version: 1, ...body }));
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const row = await db.plannedExpense.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.isSharedExpense).toBe(true);
    expect(row.responsibleMemberId).toBe(idOf("Lucas")); // SEC-048: continua o ex-membro
    expect(row.paymentAccountId).toBe(accMariana.id);
  });

  it("Admin não entrega a prevista 'Só meu' a terceiro e responsável de outra família é recusado", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Escola",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
    });
    await removeLucas();
    const url = `/api/v1/planned-expenses/${p.id}`;
    const toBia = await at(() =>
      call(as("Mariana"), "PATCH", url, { version: 1, responsibleMemberId: idOf("Bia") }),
    );
    expect(toBia.status).toBe(403);
    const other = await makeFamily({
      members: [{ email: "estranho2@exemplo.com", name: "Estranho", role: "ADMIN" }],
    });
    const stranger = await at(() =>
      call(as("Mariana"), "PATCH", url, {
        version: 1,
        isSharedExpense: true,
        responsibleMemberId: other.byName.Estranho?.memberId,
      }),
    );
    expect([403, 404, 422]).toContain(stranger.status); // SEC-048: ao dividir, o responsável não troca
    const row = await db.plannedExpense.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.responsibleMemberId).toBe(idOf("Lucas"));
    expect(row.isSharedExpense).toBe(false);
  });

  it("prevista 'Só meu' de membro ATIVO: Admin e dono da conta seguem sem mudar divisão/responsável", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Escola",
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
    for (const who of ["Mariana", "Carla"]) {
      for (const body of [
        { isSharedExpense: true },
        { responsibleMemberId: idOf(who) },
        { paymentAccountId: accMariana.id },
      ]) {
        expect((await at(() => call(as(who), "PATCH", url, { version: 1, ...body }))).status).toBe(
          403,
        );
      }
    }
  });

  it("baixa: Admin paga a prevista 'Só meu' de ex-membro com a própria conta, em nome próprio; Membro, não", async () => {
    const p = await makePlannedExpense(fx, {
      description: "Luz",
      amountInCents: 10000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
      shared: false,
    });
    await removeLucas();
    const url = `/api/v1/planned-expenses/${p.id}/pay`;
    const body = { version: 1, accountId: accMariana.id, payerMemberId: idOf("Mariana") };
    expect(
      (
        await at(() =>
          call(as("Carla"), "POST", url, {
            ...body,
            accountId: accCarla.id,
            payerMemberId: idOf("Carla"),
          }),
        )
      ).status,
    ).toBe(403);
    const ok = await at(() => call(as("Mariana"), "POST", url, body));
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const t = await txRow(ok.body.transaction.id);
    expect(t.payerMemberId).toBe(idOf("Mariana"));
    expect(t.accountId).toBe(accMariana.id);
    expect(t.isSharedExpense).toBe(false);
  });

  it("série: Admin muda divisão e responsável do 'Só meu' de ex-membro; Bia não", async () => {
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Moradia" },
    });
    const created = await at(() =>
      call(as("Lucas"), "POST", "/api/v1/recurring-expenses", {
        description: "Academia",
        amountInCents: 10000,
        categoryId: cat.id,
        isSharedExpense: false,
        paymentAccountId: accLucas.id,
        dayOfMonth: 5,
        startMonth: "2026-10",
        end: { kind: "COUNT", months: 2 },
      }),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const s = created.body.series as { id: string; version: number };
    await removeLucas();
    const url = `/api/v1/recurring-expenses/${s.id}`;
    const body = { version: s.version, isSharedExpense: true };
    expect((await at(() => call(as("Bia"), "PATCH", url, body))).status).toBe(403);
    const ok = await at(() => call(as("Mariana"), "PATCH", url, body));
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    const row = await db.recurringExpense.findUniqueOrThrow({ where: { id: s.id } });
    expect(row.isSharedExpense).toBe(true);
    expect(row.responsibleMemberId).toBe(idOf("Lucas")); // SEC-048: continua o ex-membro
  });
});
