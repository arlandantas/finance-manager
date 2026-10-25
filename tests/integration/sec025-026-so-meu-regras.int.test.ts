import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
import { oauthDance, stubCimd, toolCall, useMcpEnv } from "../support/mcp-client";

// SEC-025/026 (reteste 2026-10-25, D-GES-45): só o dono (quem pagou) torna um lançamento "Só meu"; as
// previstas "Só meu" entram na mesma regra; ninguém cria "Só meu" em nome de outro membro.
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
const A = () => fx.byName.Mariana?.as ?? null; // dona da conta, ADMIN
const C = () => fx.byName.Lucas?.as ?? null; // MEMBER
const idOf = (n: string) => fx.byName[n]?.memberId as string;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const catId = async (name: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name } })).id;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({
    members: [
      { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" },
      { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
    ],
  });
  acc = await makeAccount(fx, { name: "Conta A", owner: "Mariana", openingBalanceInCents: 100000 });
});
afterEach(() => vi.unstubAllGlobals());

const patch = (as: ReturnType<typeof A>, id: string, body: Record<string, unknown>) =>
  at(async () => call(as, "PATCH", `/api/v1/transactions/${id}`, body));
const expense = async (over: Record<string, unknown> = {}) => ({
  type: "EXPENSE",
  accountId: acc.id,
  categoryId: await catId("Supermercado"),
  amountInCents: 99999,
  isSharedExpense: false,
  ...over,
});
const mkShared = () =>
  makeTransaction(fx, {
    account: acc,
    category: "Supermercado",
    amountInCents: 5000,
    occurredOn: "2026-10-02",
    payer: "Mariana",
    shared: true,
  });
const mkPlanned = async (over: Record<string, unknown> = {}) => {
  const res = await at(async () =>
    call(A(), "POST", "/api/v1/planned-expenses", {
      description: "Condomínio",
      amountInCents: 40000,
      dueOn: "2026-10-10",
      categoryId: await catId("Moradia"),
      responsibleMemberId: idOf("Mariana"),
      isSharedExpense: false,
      ...over,
    }),
  );
  expect(res.status).toBe(201);
  return res.body.plannedExpense as { id: string; version: number };
};

describe("SEC-025 despesa dividida de outro não é 'capturada' como 'Só meu'", () => {
  it("reprodução do relatório (1 PATCH): C troca o pagador para si e marca 'Só meu' => 403 e A continua editando", async () => {
    const t = await mkShared();
    const res = await patch(C(), t.id, {
      version: 1,
      isSharedExpense: false,
      payerMemberId: idOf("Lucas"),
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    const row = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(row).toMatchObject({
      isSharedExpense: true,
      payerMemberId: idOf("Mariana"),
      version: 1,
    });
    expect((await patch(A(), t.id, { version: 1, amountInCents: 5100 })).status).toBe(200);
  });

  it("reprodução do relatório (2 PATCH): trocar o pagador para si e depois 'Só meu' também é barrado", async () => {
    const t = await mkShared();
    const first = await patch(C(), t.id, { version: 1, payerMemberId: idOf("Lucas") });
    expect(first.status).toBe(403);
    const second = await patch(C(), t.id, { version: 1, isSharedExpense: false });
    expect(second.status).toBe(403);
    expect((await patch(A(), t.id, { version: 1, amountInCents: 5100 })).status).toBe(200);
  });

  it("o pagador atual (A) converte a dividida em 'Só meu' em seu próprio nome", async () => {
    const t = await mkShared();
    expect((await patch(A(), t.id, { version: 1, isSharedExpense: false })).status).toBe(200);
  });

  it("o dono não entrega um 'Só meu' seu para outro pagador", async () => {
    const t = await mkShared();
    const res = await patch(A(), t.id, {
      version: 1,
      isSharedExpense: false,
      payerMemberId: idOf("Lucas"),
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
  });
});

describe("SEC-026a/b previstas 'Só meu' são só do responsável", () => {
  it("C não edita nem exclui a prevista 'Só meu' de A; A edita e exclui", async () => {
    const p = await mkPlanned();
    const edit = await at(async () =>
      call(C(), "PATCH", `/api/v1/planned-expenses/${p.id}`, {
        version: p.version,
        amountInCents: 1,
      }),
    );
    expect(edit.status).toBe(403);
    expect(edit.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    const del = await at(async () =>
      call(C(), "POST", `/api/v1/planned-expenses/${p.id}/delete`, { version: p.version }),
    );
    expect(del.status).toBe(403);
    const row = await db.plannedExpense.findUniqueOrThrow({ where: { id: p.id } });
    expect(row.deletedAt).toBeNull();
    expect(Number(row.amountInCents)).toBe(40000);
    const own = await at(async () =>
      call(A(), "PATCH", `/api/v1/planned-expenses/${p.id}`, {
        version: p.version,
        amountInCents: 41000,
      }),
    );
    expect(own.status).toBe(200);
  });

  it("C não dá baixa na prevista 'Só meu' de A (nem pela própria conta)", async () => {
    const p = await mkPlanned();
    const contaC = await makeAccount(fx, {
      name: "Conta C",
      owner: "Lucas",
      openingBalanceInCents: 50000,
    });
    const res = await at(async () =>
      call(C(), "POST", `/api/v1/planned-expenses/${p.id}/pay`, {
        version: p.version,
        accountId: contaC.id,
      }),
    );
    expect(res.status).toBe(403);
    expect(await db.transaction.count({ where: { description: "Condomínio" } })).toBe(0);
    const ok = await at(async () =>
      call(A(), "POST", `/api/v1/planned-expenses/${p.id}/pay`, {
        version: p.version,
        accountId: acc.id,
      }),
    );
    expect(ok.status).toBe(201);
  });

  it("prevista dividida segue aberta a qualquer membro", async () => {
    const p = await mkPlanned({ isSharedExpense: true });
    const edit = await at(async () =>
      call(C(), "PATCH", `/api/v1/planned-expenses/${p.id}`, {
        version: p.version,
        amountInCents: 41000,
      }),
    );
    expect(edit.status).toBe(200);
  });

  it("C não vira a prevista 'Só meu' de A em dividida/própria nem muda o responsável", async () => {
    const p = await mkPlanned();
    const res = await at(async () =>
      call(C(), "PATCH", `/api/v1/planned-expenses/${p.id}`, {
        version: p.version,
        isSharedExpense: true,
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("SEC-026c ninguém cria 'Só meu' em nome de outro", () => {
  it("reprodução: C lança 'Só meu' com pagador A => 403 e nada é gravado", async () => {
    const res = await at(async () =>
      call(C(), "POST", "/api/v1/transactions", await expense({ payerMemberId: idOf("Mariana") })),
    );
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
    expect(await db.transaction.count({ where: { amountInCents: 99999n } })).toBe(0);
  });

  it("'Só meu' no próprio nome e dividida em nome de outro continuam permitidos", async () => {
    const own = await at(async () =>
      call(C(), "POST", "/api/v1/transactions", await expense({ payerMemberId: idOf("Lucas") })),
    );
    expect(own.status).toBe(201);
    const shared = await at(async () =>
      call(
        C(),
        "POST",
        "/api/v1/transactions",
        await expense({ payerMemberId: idOf("Mariana"), isSharedExpense: true }),
      ),
    );
    expect(shared.status).toBe(201);
  });

  it("compra no cartão 'Só meu' em nome de outro também é barrada (à vista e parcelada)", async () => {
    const card = await makeCard(fx, {
      name: "Cartão A",
      owner: "Mariana",
      limitInCents: 500000,
      closingDay: 25,
      dueDay: 5,
    });
    for (const installments of [1, 3]) {
      const res = await at(async () =>
        call(C(), "POST", "/api/v1/transactions", {
          type: "EXPENSE",
          cardId: card.id,
          categoryId: await catId("Supermercado"),
          amountInCents: 90000,
          isSharedExpense: false,
          installments,
          payerMemberId: idOf("Mariana"),
        }),
      );
      expect(res.status).toBe(403);
    }
  });

  it("prevista 'Só meu' com responsável de outro, na criação e na edição => 403", async () => {
    const create = await at(async () =>
      call(C(), "POST", "/api/v1/planned-expenses", {
        description: "Plantada",
        amountInCents: 1000,
        dueOn: "2026-10-10",
        categoryId: await catId("Moradia"),
        responsibleMemberId: idOf("Mariana"),
        isSharedExpense: false,
      }),
    );
    expect(create.status).toBe(403);
    const mine = await mkPlanned();
    const hand = await at(async () =>
      call(A(), "PATCH", `/api/v1/planned-expenses/${mine.id}`, {
        version: mine.version,
        responsibleMemberId: idOf("Lucas"),
      }),
    );
    expect(hand.status).toBe(403);
    expect(await db.plannedExpense.count({ where: { description: "Plantada" } })).toBe(0);
  });

  it("série recorrente 'Só meu' é só do responsável e não nasce em nome de outro", async () => {
    const body = {
      description: "Aluguel",
      amountInCents: 100000,
      categoryId: await catId("Moradia"),
      responsibleMemberId: idOf("Mariana"),
      isSharedExpense: false,
      paymentAccountId: acc.id,
      dayOfMonth: 5,
      startMonth: "2026-10",
      end: { kind: "COUNT", months: 3 },
    };
    expect(
      (await at(async () => call(C(), "POST", "/api/v1/recurring-expenses", body))).status,
    ).toBe(403);
    const ok = await at(async () => call(A(), "POST", "/api/v1/recurring-expenses", body));
    expect(ok.status).toBe(201);
    const s = ok.body.series as { id: string; version: number };
    const upd = await at(async () =>
      call(C(), "PATCH", `/api/v1/recurring-expenses/${s.id}`, {
        version: s.version,
        amountInCents: 1,
      }),
    );
    expect(upd.status).toBe(403);
    const end = await at(async () =>
      call(C(), "POST", `/api/v1/recurring-expenses/${s.id}/end`, { version: s.version }),
    );
    expect(end.status).toBe(403);
  });
});

describe("SEC-026 MCP", () => {
  it("lancar_despesa ignora/recusa um pagador injetado: grava sempre 'Só meu' do membro da conexão", async () => {
    useMcpEnv();
    stubCimd();
    const itau = await makeAccount(fx, {
      name: "Itaú Lucas",
      owner: "Lucas",
      openingBalanceInCents: 500000,
    });
    const token = (
      await at(async () =>
        oauthDance({
          member: C() as NonNullable<ReturnType<typeof C>>,
          scopes: ["read", "write"],
          allowWrite: true,
        }),
      )
    ).accessToken;
    const r = await at(async () =>
      toolCall(token, "lancar_despesa", {
        description: "Farmácia",
        amountInCents: 8000,
        categoryId: await catId("Saúde"),
        accountId: itau.id,
        payerMemberId: idOf("Mariana"),
        isSharedExpense: false,
      }),
    );
    expect(r.status).toBe(200);
    const rows = await db.transaction.findMany({ where: { origin: "ASSISTANT" } });
    for (const row of rows) {
      expect(row.payerMemberId).toBe(idOf("Lucas"));
      expect(row.isSharedExpense).toBe(false);
    }
  });
});
