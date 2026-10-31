import { randomUUID } from "node:crypto";
import { Client } from "pg";
import { beforeEach, describe, expect, it } from "vitest";
import type { RequestContext } from "@/lib/api/types";
import { withClock } from "@/lib/clock";
import { createExpenseCore } from "@/modules/transacoes/service";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
  makeTransaction,
  makeUnlinkedMember,
} from "../support/factories";

/**
 * US-093b (SDD-034 §7.3): "Só meu" e pagador/responsável com membro sem conta. Família: Mariana (ADMIN), Bia (ADMIN),
 * Lucas e Caio (MEMBER), Ana (sem conta ativa), Edu (ex-membro sem conta) e a conta "Poupança Ana" (titular Ana).
 */
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
let fx: FamilyFixture;
let main: AccountFixture;
let poupAna: AccountFixture;
let ana: { memberId: string; name: string };
let edu: { memberId: string; name: string };
const who = (n: string) => fx.byName[n]?.as ?? null;
const id = (n: string) => fx.byName[n]?.memberId as string;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const api = (n: string, method: "POST" | "PATCH", path: string, body: Record<string, unknown>) =>
  at(() => call(who(n), method, `/api/v1${path}`, body));

const ONLY_ADMIN_MSG = "Só Mariana e um Administrador podem alterar este lançamento.";

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({
    members: [
      { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" },
      { email: "bia@exemplo.com", name: "Bia Silva", role: "ADMIN" },
      { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
      { email: "caio@exemplo.com", name: "Caio Silva", role: "MEMBER" },
    ],
  });
  ana = await makeUnlinkedMember(fx, { name: "Ana", register: true });
  edu = await makeUnlinkedMember(fx, {
    name: "Edu",
    removedAt: new Date("2026-09-01"),
    register: true,
  });
  main = await makeAccount(fx, { name: "Conta", owner: "Mariana", openingBalanceInCents: 1000000 });
  poupAna = await makeAccount(fx, {
    name: "Poupança Ana",
    owner: "Ana",
    openingBalanceInCents: 100000,
  });
});

const catId = async (name: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name } })).id;
const expense = async (payer: string, shared: boolean, over: Record<string, unknown> = {}) => ({
  type: "EXPENSE",
  accountId: main.id,
  categoryId: await catId("Supermercado"),
  amountInCents: 10000,
  payerMemberId: payer,
  isSharedExpense: shared,
  ...over,
});
const planned = async (
  responsible: string,
  shared: boolean,
  over: Record<string, unknown> = {},
) => ({
  description: "Mesada",
  amountInCents: 10000,
  dueOn: "2026-10-10",
  categoryId: await catId("Moradia"),
  responsibleMemberId: responsible,
  isSharedExpense: shared,
  ...over,
});
const series = async (responsible: string, shared: boolean) => ({
  description: "Mesada",
  amountInCents: 10000,
  categoryId: await catId("Moradia"),
  responsibleMemberId: responsible,
  isSharedExpense: shared,
  paymentAccountId: main.id,
  dayOfMonth: 10,
  startMonth: "2026-10",
  end: { kind: "NONE" },
});
const row = (t: string) => db.transaction.findUniqueOrThrow({ where: { id: t } });
const mk = (payer: string, author: string, shared: boolean, account: AccountFixture = main) =>
  makeTransaction(fx, {
    account,
    category: "Supermercado",
    amountInCents: 30000,
    occurredOn: "2026-10-02",
    payer,
    author,
    shared,
  });

describe("1. criar 'Só meu' em nome de Ana (SEC-026c, exceção do Admin)", () => {
  it("à vista: Mariana 201 (autora Mariana, pagadora Ana); Lucas, Bia-com-conta e ex-membro: não", async () => {
    const ok = await api("Mariana", "POST", "/transactions", await expense(ana.memberId, false));
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const r = await row(ok.body.transaction.id);
    expect(r).toMatchObject({
      payerMemberId: ana.memberId,
      authorMemberId: id("Mariana"),
      isSharedExpense: false,
    });
    const lucas = await api("Lucas", "POST", "/transactions", await expense(ana.memberId, false));
    expect(lucas.status).toBe(403);
    expect(lucas.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
    const lucasForSelf = await api(
      "Mariana",
      "POST",
      "/transactions",
      await expense(id("Lucas"), false),
    );
    expect(lucasForSelf.status).toBe(403);
    expect(lucasForSelf.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
    const gone = await api("Mariana", "POST", "/transactions", await expense(edu.memberId, false));
    expect(gone.status).not.toBe(201);
    expect(await db.transaction.count({ where: { kind: "EXPENSE", isSharedExpense: false } })).toBe(
      1,
    );
  });

  it("cartão: Mariana 201; Lucas 403", async () => {
    const card = await makeCard(fx, { name: "Cartão", owner: "Mariana" });
    const body = async (payer: string) => ({
      type: "EXPENSE",
      cardId: card.id,
      categoryId: await catId("Supermercado"),
      amountInCents: 5000,
      payerMemberId: payer,
      isSharedExpense: false,
    });
    expect((await api("Mariana", "POST", "/transactions", await body(ana.memberId))).status).toBe(
      201,
    );
    const denied = await api("Lucas", "POST", "/transactions", await body(ana.memberId));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
  });

  it("parcelado: Mariana 201; Lucas 403", async () => {
    const card = await makeCard(fx, { name: "Cartão", owner: "Mariana" });
    const body = async (payer: string) => ({
      type: "EXPENSE",
      cardId: card.id,
      categoryId: await catId("Supermercado"),
      amountInCents: 30000,
      installments: 3,
      payerMemberId: payer,
      isSharedExpense: false,
    });
    const ok = await api("Mariana", "POST", "/transactions", await body(ana.memberId));
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    const denied = await api("Lucas", "POST", "/transactions", await body(ana.memberId));
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
  });

  it("prevista e série: Mariana 201; Lucas 403; Mariana para Lucas (com conta) 403", async () => {
    const p = await api("Mariana", "POST", "/planned-expenses", await planned(ana.memberId, false));
    expect(p.status, JSON.stringify(p.body)).toBe(201);
    expect(p.body.plannedExpense.responsible).toMatchObject({ id: ana.memberId, unlinked: true });
    for (const [path, mkBody] of [
      ["/planned-expenses", planned],
      ["/recurring-expenses", series],
    ] as const) {
      const lucas = await api("Lucas", "POST", path, await mkBody(ana.memberId, false));
      expect(lucas.status).toBe(403);
      expect(lucas.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
      const toLucas = await api("Mariana", "POST", path, await mkBody(id("Lucas"), false));
      expect(toLucas.status).toBe(403);
      expect(toLucas.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
    }
    const s = await api(
      "Mariana",
      "POST",
      "/recurring-expenses",
      await series(ana.memberId, false),
    );
    expect(s.status, JSON.stringify(s.body)).toBe(201);
  });

  it("MCP (opts.assistant): recusa mesmo para Admin e dono sem conta; sem assistente o mesmo núcleo aceita", async () => {
    const ctx = {
      userId: fx.byName.Mariana?.userId,
      email: "mariana@exemplo.com",
      name: "Mariana Silva",
      image: null,
      requestId: randomUUID(),
      memberId: id("Mariana"),
      familyId: fx.family.id,
      role: "ADMIN",
      clock: { now: () => new Date(NOW) },
    } as unknown as RequestContext;
    const input = {
      type: "EXPENSE",
      accountId: main.id,
      categoryId: await catId("Supermercado"),
      amountInCents: 1000,
      payerMemberId: ana.memberId,
      isSharedExpense: false,
      installments: 1,
    } as never;
    await expect(
      db.$transaction((tx) =>
        createExpenseCore(tx, ctx, input, {
          assistant: { grantId: randomUUID(), idemKey: null, label: "Claude" },
        }),
      ),
    ).rejects.toMatchObject({ code: "PERSONAL_ON_BEHALF_FORBIDDEN" });
    await expect(
      db.$transaction((tx) => createExpenseCore(tx, ctx, input, {})),
    ).resolves.toBeTruthy();
  });
});

describe("2. controle do 'Só meu' de Ana (tutor)", () => {
  it("lançado por Mariana: Lucas 403 com 'um Administrador' (sem 'Ana'); Mariana e Bia (ADMIN) editam, excluem e restauram", async () => {
    const t = await mk("Ana", "Mariana", false, poupAna);
    const denied = await api("Lucas", "PATCH", `/transactions/${t.id}`, {
      version: 1,
      amountInCents: 99900,
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    expect(denied.body.error.message).toBe(ONLY_ADMIN_MSG);
    expect(denied.body.error.message).not.toContain("Ana");
    const del = await api("Lucas", "POST", `/transactions/${t.id}/delete`, { version: 1 });
    expect(del.status).toBe(403);
    expect(
      (await api("Mariana", "PATCH", `/transactions/${t.id}`, { version: 1, amountInCents: 12000 }))
        .status,
    ).toBe(200);
    const bia = await api("Bia", "PATCH", `/transactions/${t.id}`, {
      version: 2,
      amountInCents: 13000,
    });
    expect(bia.status, JSON.stringify(bia.body)).toBe(200);
    expect(
      (await api("Mariana", "POST", `/transactions/${t.id}/delete`, { version: 3 })).status,
    ).toBe(200);
    expect(
      (await api("Lucas", "POST", `/transactions/${t.id}/restore`, { version: 4 })).status,
    ).toBe(403);
    expect((await api("Bia", "POST", `/transactions/${t.id}/restore`, { version: 4 })).status).toBe(
      200,
    );
  });

  it("lançado por Lucas na 'Poupança Ana': Lucas (lançador) edita; Caio (membro) não; a mensagem cita só Lucas e o Admin", async () => {
    const t = await mk("Ana", "Lucas", false, poupAna);
    expect(
      (await api("Lucas", "PATCH", `/transactions/${t.id}`, { version: 1, amountInCents: 12000 }))
        .status,
    ).toBe(200);
    const caio = await api("Caio", "PATCH", `/transactions/${t.id}`, {
      version: 2,
      amountInCents: 5000,
    });
    expect(caio.status).toBe(403);
    expect(caio.body.error.message).toBe(
      "Só Lucas e um Administrador podem alterar este lançamento.",
    );
  });

  it("prevista 'Só meu' de Ana lançada por Mariana: Lucas 403; Mariana e Bia editam; baixa pelo Admin mantém Ana como pagadora", async () => {
    const created = await api(
      "Mariana",
      "POST",
      "/planned-expenses",
      await planned(ana.memberId, false),
    );
    const p = created.body.plannedExpense as { id: string; version: number };
    const denied = await api("Lucas", "PATCH", `/planned-expenses/${p.id}`, {
      version: p.version,
      amountInCents: 5000,
    });
    expect(denied.status).toBe(403);
    expect(denied.body.error.message).toBe(ONLY_ADMIN_MSG);
    expect(
      (
        await api("Bia", "PATCH", `/planned-expenses/${p.id}`, {
          version: p.version,
          amountInCents: 5000,
        })
      ).status,
    ).toBe(200);
    const pay = await api("Bia", "POST", `/planned-expenses/${p.id}/pay`, {
      version: p.version + 1,
      accountId: main.id,
    });
    expect([200, 201], JSON.stringify(pay.body)).toContain(pay.status);
    const plannedRow = await db.plannedExpense.findUniqueOrThrow({ where: { id: p.id } });
    const paid = await db.transaction.findUniqueOrThrow({
      where: { id: plannedRow.paidTransactionId as string },
    });
    expect(paid.payerMemberId).toBe(ana.memberId);
  });

  it("baixa do 'Só meu' de Ana pelo Admin: pagador diferente de Ana => 403 (para si: UNLINKED_PAYER_FORBIDDEN; terceiro: PERSONAL_ON_BEHALF)", async () => {
    const created = await api(
      "Mariana",
      "POST",
      "/planned-expenses",
      await planned(ana.memberId, false),
    );
    const p = created.body.plannedExpense as { id: string; version: number };
    const pay = (payerMemberId: string) =>
      api("Bia", "POST", `/planned-expenses/${p.id}/pay`, {
        version: p.version,
        accountId: main.id,
        payerMemberId,
      });
    const self = await pay(id("Bia"));
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe("UNLINKED_PAYER_FORBIDDEN");
    const third = await pay(id("Lucas"));
    expect(third.status).toBe(403);
    expect(third.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
    expect((await pay(ana.memberId)).status).toBeLessThan(300);
  });

  it("série 'Só meu' de Ana: Lucas 403; Bia (Admin) edita", async () => {
    const created = await api(
      "Mariana",
      "POST",
      "/recurring-expenses",
      await series(ana.memberId, false),
    );
    const s = created.body.series as { id: string; version: number };
    expect(
      (
        await api("Lucas", "PATCH", `/recurring-expenses/${s.id}`, {
          version: s.version,
          amountInCents: 5000,
        })
      ).status,
    ).toBe(403);
    expect(
      (
        await api("Bia", "PATCH", `/recurring-expenses/${s.id}`, {
          version: s.version,
          amountInCents: 5000,
        })
      ).status,
    ).toBe(200);
  });
});

describe("3. pagador/responsável para ou de Ana (SEC-059a)", () => {
  it("dividida de 300 paga por Ana, lançada por Mariana (lançamento)", async () => {
    const t = await mk("Ana", "Mariana", true);
    const toSelf = await api("Lucas", "PATCH", `/transactions/${t.id}`, {
      version: 1,
      payerMemberId: id("Lucas"),
    });
    expect(toSelf.status).toBe(403);
    expect(toSelf.body.error.code).toBe("UNLINKED_PAYER_FORBIDDEN");
    expect(toSelf.body.error.message).toBe(
      "Apenas quem lançou ou o Administrador pode definir este pagador.",
    );
    expect(
      (
        await api("Lucas", "PATCH", `/transactions/${t.id}`, {
          version: 1,
          payerMemberId: id("Caio"),
        })
      ).body.error.code,
    ).toBe("UNLINKED_PAYER_FORBIDDEN");
    const adminSelf = await api("Bia", "PATCH", `/transactions/${t.id}`, {
      version: 1,
      payerMemberId: id("Bia"),
    });
    expect(adminSelf.status).toBe(403);
    expect(adminSelf.body.error.code).toBe("UNLINKED_PAYER_FORBIDDEN");
    expect(adminSelf.body.error.message).toContain("Você não pode se colocar como pagador");
    const toLucas = await api("Bia", "PATCH", `/transactions/${t.id}`, {
      version: 1,
      payerMemberId: id("Lucas"),
    });
    expect(toLucas.status, JSON.stringify(toLucas.body)).toBe(200);
    expect((await row(t.id)).payerMemberId).toBe(id("Lucas"));
    expect((await row(t.id)).updatedByMemberId).toBe(id("Bia"));
    const t2 = await mk("Ana", "Mariana", true);
    expect(
      (
        await api("Mariana", "PATCH", `/transactions/${t2.id}`, {
          version: 1,
          payerMemberId: id("Mariana"),
        })
      ).status,
    ).toBe(200);
  });

  it("dividida paga por Lucas e lançada por Lucas: Caio não põe Ana; Lucas (autor) põe", async () => {
    const t = await mk("Lucas", "Lucas", true);
    const caio = await api("Caio", "PATCH", `/transactions/${t.id}`, {
      version: 1,
      payerMemberId: ana.memberId,
    });
    expect(caio.status).toBe(403);
    expect(caio.body.error.code).toBe("UNLINKED_PAYER_FORBIDDEN");
    expect(
      (
        await api("Lucas", "PATCH", `/transactions/${t.id}`, {
          version: 1,
          payerMemberId: ana.memberId,
        })
      ).status,
    ).toBe(200);
  });

  it("prevista dividida de Ana (responsável): mesmas regras", async () => {
    const created = await api(
      "Mariana",
      "POST",
      "/planned-expenses",
      await planned(ana.memberId, true),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const p = created.body.plannedExpense as { id: string; version: number };
    const patch = (n: string, responsibleMemberId: string, version = p.version) =>
      api(n, "PATCH", `/planned-expenses/${p.id}`, { version, responsibleMemberId });
    expect((await patch("Lucas", id("Lucas"))).body.error.code).toBe("UNLINKED_PAYER_FORBIDDEN");
    const adminSelf = await patch("Bia", id("Bia"));
    expect(adminSelf.status).toBe(403);
    expect(adminSelf.body.error.code).toBe("UNLINKED_PAYER_FORBIDDEN");
    expect(adminSelf.body.error.message).toContain("Você não pode se colocar");
    expect((await patch("Bia", id("Lucas"))).status).toBe(200);
  });

  it("série dividida de Ana (responsável): mesmas regras", async () => {
    const created = await api(
      "Mariana",
      "POST",
      "/recurring-expenses",
      await series(ana.memberId, true),
    );
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const s = created.body.series as { id: string; version: number };
    const patch = (n: string, responsibleMemberId: string, version = s.version) =>
      api(n, "PATCH", `/recurring-expenses/${s.id}`, { version, responsibleMemberId });
    expect((await patch("Lucas", id("Lucas"))).body.error.code).toBe("UNLINKED_PAYER_FORBIDDEN");
    expect((await patch("Bia", id("Bia"))).body.error.code).toBe("UNLINKED_PAYER_FORBIDDEN");
    expect((await patch("Bia", id("Lucas"))).status).toBe(200);
  });
});

describe("4. captura (Q-TL-U2) e 5. tutor sem assumir", () => {
  it("ninguém torna 'Só meu' a dividida paga por Ana; dois passos barrados no primeiro", async () => {
    const t = await mk("Ana", "Mariana", true);
    for (const n of ["Mariana", "Lucas", "Bia"]) {
      const r = await api(n, "PATCH", `/transactions/${t.id}`, {
        version: 1,
        isSharedExpense: false,
      });
      expect(r.status, n).toBe(403);
      expect(r.body.error.code, n).toBe("PERSONAL_OWNER_ONLY");
    }
    const step1 = await api("Bia", "PATCH", `/transactions/${t.id}`, {
      version: 1,
      payerMemberId: id("Bia"),
    });
    expect(step1.status).toBe(403);
    expect(step1.body.error.code).toBe("UNLINKED_PAYER_FORBIDDEN");
  });

  it("Admin no 'Só meu' de Ana muda divisão e conta; pagador para si => ADMIN_SELF; para Lucas => PERSONAL_ON_BEHALF", async () => {
    const t = await mk("Ana", "Mariana", false, poupAna);
    const acct = await api("Bia", "PATCH", `/transactions/${t.id}`, {
      version: 1,
      accountId: main.id,
    });
    expect(acct.status, JSON.stringify(acct.body)).toBe(200);
    const self = await api("Bia", "PATCH", `/transactions/${t.id}`, {
      version: 2,
      payerMemberId: id("Bia"),
    });
    expect(self.status).toBe(403);
    expect(self.body.error.code).toBe("UNLINKED_PAYER_FORBIDDEN");
    const third = await api("Bia", "PATCH", `/transactions/${t.id}`, {
      version: 2,
      payerMemberId: id("Lucas"),
    });
    expect(third.status).toBe(403);
    expect(third.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
    const share = await api("Bia", "PATCH", `/transactions/${t.id}`, {
      version: 2,
      isSharedExpense: true,
    });
    expect(share.status, JSON.stringify(share.body)).toBe(200);
    expect((await row(t.id)).payerMemberId).toBe(ana.memberId);
  });
});

describe("6. acerto com credor sem conta: destino livre (Q-TL-93-1 = c, caracterização)", () => {
  it("U1; Mariana (devedora) registra para Ana com destino em conta dela, na Poupança Ana ou na de um terceiro: 201", async () => {
    await mk("Ana", "Mariana", true);
    const outraMariana = await makeAccount(fx, {
      name: "Conta 2 Mariana",
      owner: "Mariana",
      openingBalanceInCents: 0,
    });
    const lucasAcc = await makeAccount(fx, {
      name: "Conta Lucas",
      owner: "Lucas",
      openingBalanceInCents: 0,
    });
    const panel = await at(() => call(who("Mariana"), "GET", "/api/v1/settlement"));
    const balOf = (n: string) =>
      panel.body.members.find((m: { member: { id: string } }) => m.member.id === id(n))
        .balanceInCents;
    expect([balOf("Ana"), balOf("Mariana")]).toEqual([24000, -6000]); // 5 membros ativos: 300,00 / 5 = 60,00 (Edu saiu em set)
    for (const to of [outraMariana, poupAna, lucasAcc]) {
      const res = await api("Mariana", "POST", "/settlements", {
        period: "2026-10",
        fromMemberId: id("Mariana"),
        toMemberId: ana.memberId,
        amountInCents: 2000,
        fromAccountId: main.id,
        toAccountId: to.id,
      });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }
  });
});

describe("7. concorrência: aceite simulado × Admin criando 'Só meu' (SEC-066b)", () => {
  async function simulateAccept(hold: Promise<void>, started: () => void) {
    const user = await db.user.create({
      data: {
        email: `ana-${randomUUID()}@exemplo.com`,
        name: "Ana Real",
        emailVerified: new Date(),
      },
    });
    await db.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.link_member', ${ana.memberId}, true)`;
        await tx.$executeRaw`UPDATE members SET "userId" = ${user.id}::uuid, "linkedAt" = now(), name = 'Ana Real' WHERE id = ${ana.memberId}::uuid`;
        started();
        await hold;
      },
      { timeout: 30000 },
    );
  }

  it("T1 (aceite) grava e não confirma; T2 (Admin) espera o FOR SHARE e, ao confirmar o aceite, recebe 403", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => {
      release = r;
    });
    let started!: () => void;
    const startedP = new Promise<void>((r) => {
      started = r;
    });
    const t1 = simulateAccept(hold, started);
    await startedP;
    let t2Done = false;
    const t2 = api("Mariana", "POST", "/transactions", await expense(ana.memberId, false)).then(
      (r) => {
        t2Done = true;
        return r;
      },
    );
    await new Promise((r) => setTimeout(r, 600));
    expect(t2Done).toBe(false); // bloqueada no FOR SHARE
    release();
    await t1;
    const res = await t2;
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
  }, 60000);

  it("ordem inversa: o 'Só meu' confirma primeiro; o aceite espera e o item passa a ser de Ana com conta; sem deadlock em 50 repetições", async () => {
    for (let i = 0; i < 50; i++) {
      const [mine] = await Promise.all([
        api("Mariana", "POST", "/transactions", await expense(ana.memberId, false)),
        (async () => {
          const user = await db.user.create({
            data: {
              email: `ana-${randomUUID()}@exemplo.com`,
              name: "Ana Real",
              emailVerified: new Date(),
            },
          });
          await db.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.link_member', ${ana.memberId}, true)`;
            await tx.$executeRaw`UPDATE members SET "userId" = ${user.id}::uuid, "linkedAt" = now(), name = 'Ana Real' WHERE id = ${ana.memberId}::uuid`;
          });
        })(),
      ]);
      expect([201, 403]).toContain(mine.status);
      // restaura o estado para a próxima repetição (fora do gatilho: o teste só reabre a linha)
      await db.$executeRaw`ALTER TABLE members DISABLE TRIGGER members_link_guard`;
      await db.$executeRaw`UPDATE members SET "userId" = NULL, "linkedAt" = NULL, name = 'Ana' WHERE id = ${ana.memberId}::uuid`;
      await db.$executeRaw`ALTER TABLE members ENABLE TRIGGER members_link_guard`;
      await db.transaction.deleteMany({
        where: { payerMemberId: ana.memberId, kind: "EXPENSE", isSharedExpense: false },
      });
    }
  }, 300000);
});

describe("8. regressão: ex-membro sem conta (Edu) segue as regras de ex-membro", () => {
  it("dividida paga por Edu: pagador imutável para todos (inclusive Admin), mensagem antiga", async () => {
    const t = await mk("Edu", "Mariana", true);
    const r = await api("Mariana", "PATCH", `/transactions/${t.id}`, {
      version: 1,
      payerMemberId: id("Lucas"),
    });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    expect(r.body.error.message).toBe(
      "O pagador é um ex-membro e não pode ser alterado. Para outro pagador, exclua e lance de novo.",
    );
  });
  it("'Só meu' de Edu: Admin com poderes plenos; Lucas não escreve; mensagem sem 'um Administrador'", async () => {
    const t = await mk("Edu", "Lucas", false);
    expect(
      (await api("Bia", "PATCH", `/transactions/${t.id}`, { version: 1, amountInCents: 5000 }))
        .status,
    ).toBe(200);
    const lucas = await api("Lucas", "PATCH", `/transactions/${t.id}`, {
      version: 2,
      amountInCents: 6000,
    });
    expect(lucas.status).toBe(403);
    expect(lucas.body.error.message).not.toContain("um Administrador");
  });
});

describe("9. ordem de travas: edição/baixa de 'Só meu' × remoção do membro dono da conta (sem deadlock, R2)", () => {
  const N = 20;
  for (const kind of ["edição", "baixa"] as const) {
    it(`${kind} do 'Só meu' de Lucas (conta dele) × Admin removendo Lucas: nenhum 500/40P01, ${N} repetições`, async () => {
      for (let i = 0; i < N; i++) {
        const f = await makeFamily({ uniqueEmails: true });
        const acc = await makeAccount(f, {
          name: "Itaú Lucas",
          owner: "Lucas",
          openingBalanceInCents: 100000,
        });
        const lucasAs = f.byName.Lucas?.as ?? null;
        const mar = f.byName.Mariana?.as ?? null;
        let attempt: Promise<{ status: number }>;
        if (kind === "edição") {
          const t = await makeTransaction(f, {
            account: acc,
            category: "Supermercado",
            amountInCents: 5000,
            occurredOn: "2026-10-02",
            payer: "Lucas",
            shared: false,
          });
          attempt = at(() =>
            call(lucasAs, "PATCH", `/api/v1/transactions/${t.id}`, {
              version: 1,
              amountInCents: 6000,
            }),
          );
        } else {
          const pe = await db.plannedExpense.create({
            data: {
              familyId: f.family.id,
              description: "Plano",
              amountInCents: BigInt(5000),
              dueOn: new Date("2026-10-10T00:00:00Z"),
              categoryId: (
                await db.category.findFirstOrThrow({
                  where: { familyId: f.family.id, name: "Moradia" },
                })
              ).id,
              responsibleMemberId: f.byName.Lucas?.memberId as string,
              authorMemberId: f.byName.Lucas?.memberId as string,
              isSharedExpense: false,
              paymentAccountId: acc.id,
            },
          });
          attempt = at(() =>
            call(lucasAs, "POST", `/api/v1/planned-expenses/${pe.id}/pay`, {
              version: 1,
              accountId: acc.id,
            }),
          );
        }
        const removal = at(() =>
          call(mar, "POST", `/api/v1/members/${f.byName.Lucas?.memberId}/remove`, {}),
        );
        const [a, r] = await Promise.all([attempt, removal]);
        expect(a.status, `${kind} ${i}`).toBeLessThan(500);
        expect(r.status, `remoção ${i}`).toBeLessThan(500);
      }
    }, 300000);
  }
});

describe("9b. ordem de travas determinística (conta ➔ membro, como removal.ts)", () => {
  it("T1 (remoção simulada) trava a conta FOR UPDATE e depois faz UPDATE members; a edição do 'Só meu' do dono da conta não vira deadlock", async () => {
    const t = await makeTransaction(fx, {
      account: poupAna,
      category: "Supermercado",
      amountInCents: 5000,
      occurredOn: "2026-10-02",
      payer: "Lucas",
      author: "Lucas",
      shared: false,
    });
    const acc = await makeAccount(fx, {
      name: "Itaú Lucas",
      owner: "Lucas",
      openingBalanceInCents: 100000,
    });
    const own = await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 5000,
      occurredOn: "2026-10-02",
      payer: "Caio",
      author: "Caio",
      shared: false,
    });
    void t;
    let started!: () => void;
    const startedP = new Promise<void>((r) => {
      started = r;
    });
    const t1 = db.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM bank_accounts WHERE id = ${acc.id}::uuid FOR UPDATE`;
        started();
        await new Promise((r) => setTimeout(r, 800));
        await tx.$executeRaw`UPDATE members SET "removedAt" = now(), "removalKind" = 'REMOVED' WHERE id = ${id("Lucas")}::uuid`;
      },
      { timeout: 30000 },
    );
    await startedP;
    const t0 = Date.now();
    const edit = await api("Caio", "PATCH", `/transactions/${own.id}`, {
      version: 1,
      amountInCents: 6000,
    });
    await t1; // não pode lançar 40P01
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    expect(Date.now() - t0).toBeGreaterThan(500); // esperou a trava da conta (T1)
  }, 60000);
});

describe("9c. ordem de travas: conta (atual e nova) ANTES do dono, com a conta presa como o removal.ts faz", () => {
  const url = () => (process.env.TEST_DATABASE_URL as string).replace(/\?schema=.*$/, "");

  /**
   * A (papel do removal): BEGIN + conta X FOR UPDATE. `kick` dispara o pedido do tutor SEM aguardar; esperamos ele
   * bloquear numa trava de linha; C pega a linha do dono com FOR UPDATE NOWAIT: tem de CONSEGUIR (o pedido não pode
   * estar segurando o dono, senão o UPDATE members do removal fecharia o ciclo). Depois COMMIT em A e o pedido termina.
   */
  async function scenario(
    label: string,
    xId: string,
    ownerId: string,
    kick: () => Promise<{ status: number; body?: unknown }>,
  ) {
    const a = new Client({ connectionString: url() });
    const c = new Client({ connectionString: url() });
    await a.connect();
    await c.connect();
    try {
      await a.query("BEGIN");
      await a.query("SELECT id FROM bank_accounts WHERE id = $1 FOR UPDATE", [xId]);
      const pending = kick();
      let blocked = false;
      for (let i = 0; i < 50 && !blocked; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const q = await c.query(
          "SELECT count(*)::int AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()",
        );
        blocked = (q.rows[0]?.n ?? 0) > 0;
      }
      expect(blocked, `${label}: o pedido deveria bloquear na conta`).toBe(true);
      await c.query("BEGIN");
      await c.query("SELECT 1 FROM members WHERE id = $1 FOR UPDATE NOWAIT", [ownerId]); // lança 55P03 se o pedido segura o dono
      await c.query("ROLLBACK");
      await a.query("COMMIT");
      const res = await pending;
      expect(res.status, `${label}: ${JSON.stringify(res.body)}`).toBeLessThan(300);
    } finally {
      await a.query("ROLLBACK").catch(() => undefined);
      await c.end();
      await a.end();
    }
  }

  it("edição do lançamento: X como conta ATUAL e como conta NOVA", async () => {
    const onX = await mk("Ana", "Mariana", false, poupAna);
    await scenario("edição, X atual", poupAna.id, ana.memberId, () =>
      api("Bia", "PATCH", `/transactions/${onX.id}`, { version: 1, amountInCents: 6000 }),
    );
    const onMain = await mk("Ana", "Mariana", false, main);
    await scenario("edição, X nova", poupAna.id, ana.memberId, () =>
      api("Bia", "PATCH", `/transactions/${onMain.id}`, { version: 1, accountId: poupAna.id }),
    );
  }, 60000);

  it("baixa da prevista: X como conta atual e como conta do pagamento", async () => {
    const cat = await catId("Moradia");
    const mk2 = async (paymentAccountId: string | null) => {
      const r = await api("Mariana", "POST", "/planned-expenses", {
        ...(await planned(ana.memberId, false)),
        categoryId: cat,
        ...(paymentAccountId ? { paymentAccountId } : {}),
      });
      return r.body.plannedExpense as { id: string; version: number };
    };
    const p1 = await mk2(poupAna.id);
    await scenario("baixa, X atual", poupAna.id, ana.memberId, () =>
      api("Bia", "POST", `/planned-expenses/${p1.id}/pay`, {
        version: p1.version,
        accountId: main.id,
      }),
    );
    const p2 = await mk2(null);
    await scenario("baixa, X nova", poupAna.id, ana.memberId, () =>
      api("Bia", "POST", `/planned-expenses/${p2.id}/pay`, {
        version: p2.version,
        accountId: poupAna.id,
      }),
    );
  }, 60000);

  it("edição da prevista e da série: X como conta atual e como conta nova", async () => {
    const mkP = async (paymentAccountId: string) => {
      const r = await api("Mariana", "POST", "/planned-expenses", {
        ...(await planned(ana.memberId, false)),
        paymentAccountId,
      });
      return r.body.plannedExpense as { id: string; version: number };
    };
    const pa = await mkP(poupAna.id);
    await scenario("prevista, X atual", poupAna.id, ana.memberId, () =>
      api("Bia", "PATCH", `/planned-expenses/${pa.id}`, {
        version: pa.version,
        amountInCents: 7000,
      }),
    );
    const pb = await mkP(main.id);
    await scenario("prevista, X nova", poupAna.id, ana.memberId, () =>
      api("Bia", "PATCH", `/planned-expenses/${pb.id}`, {
        version: pb.version,
        paymentAccountId: poupAna.id,
      }),
    );
    const mkS = async (paymentAccountId: string) => {
      const r = await api("Mariana", "POST", "/recurring-expenses", {
        ...(await series(ana.memberId, false)),
        paymentAccountId,
      });
      return r.body.series as { id: string; version: number };
    };
    const sa = await mkS(poupAna.id);
    await scenario("série, X atual", poupAna.id, ana.memberId, () =>
      api("Bia", "PATCH", `/recurring-expenses/${sa.id}`, {
        version: sa.version,
        amountInCents: 7000,
      }),
    );
    const sb = await mkS(main.id);
    await scenario("série, X nova", poupAna.id, ana.memberId, () =>
      api("Bia", "PATCH", `/recurring-expenses/${sb.id}`, {
        version: sb.version,
        paymentAccountId: poupAna.id,
      }),
    );
  }, 90000);
});
