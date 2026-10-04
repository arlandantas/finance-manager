import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as ledger from "@/modules/contas/ledger";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;

beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
  fx = await makeFamily();
});

const newAccount = (as: ReturnType<typeof mariana>, body: Record<string, unknown>, opts = {}) =>
  call(as, "POST", "/api/v1/accounts", body, opts);

describe("US-004 Cadastrar conta com sucesso", () => {
  it("POST /accounts com saldo 150000: saldo derivado, OPENING CREDIT e total consolidado", async () => {
    const res = await newAccount(mariana(), {
      name: "Itaú Mariana",
      institution: "Itaú",
      type: "CHECKING",
      ownerMemberId: fx.byName.Mariana?.memberId,
      openingBalanceInCents: 150000,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: "Itaú Mariana",
      institution: "Itaú",
      type: "CHECKING",
      balanceInCents: 150000,
      version: 1,
      owner: { id: fx.byName.Mariana?.memberId, name: "Mariana Silva" },
    });

    const opening = await db.transaction.findFirstOrThrow({ where: { accountId: res.body.id } });
    expect(opening).toMatchObject({
      kind: "OPENING",
      direction: "CREDIT",
      description: "Saldo inicial",
      version: 1,
    });
    expect(opening.amountInCents).toBe(150000n);
    expect(opening.authorMemberId).toBe(fx.byName.Mariana?.memberId);
    expect(opening.categoryId).toBeNull();
    const revisions = await db.transactionRevision.findMany({
      where: { transactionId: opening.id },
    });
    expect(revisions).toHaveLength(1);
    expect(revisions[0]).toMatchObject({
      action: "CREATE",
      revision: 1,
      actorMemberId: fx.byName.Mariana?.memberId,
    });

    await newAccount(mariana(), {
      name: "Nubank Conjunta",
      type: "CHECKING",
      openingBalanceInCents: 100000,
    });
    const list = await call(mariana(), "GET", "/api/v1/accounts");
    expect(list.status).toBe(200);
    expect(list.body.items.map((a: { name: string }) => a.name)).toEqual([
      "Itaú Mariana",
      "Nubank Conjunta",
    ]);
    expect(list.body.totalBalanceInCents).toBe(250000);
  });

  it("saldo inicial padrão 0, instituição padrão Outro e data de abertura hoje (fuso da família)", async () => {
    const res = await newAccount(mariana(), { name: "Carteira", type: "CASH" });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ institution: "Outro", balanceInCents: 0 });
    const opening = await db.transaction.findFirstOrThrow({ where: { accountId: res.body.id } });
    expect(opening.amountInCents).toBe(0n);
    expect(opening.occurredOn.toISOString().slice(0, 10)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("US-004 Titular padrão", () => {
  it("sem ownerMemberId, o titular é o membro logado", async () => {
    const res = await newAccount(lucas(), { name: "Conta do Lucas", type: "CHECKING" });
    expect(res.body.owner).toMatchObject({ id: fx.byName.Lucas?.memberId, name: "Lucas Silva" });
  });

  it("titular pode ser outro membro da família", async () => {
    const res = await newAccount(lucas(), {
      name: "Conta da Mariana",
      type: "CHECKING",
      ownerMemberId: fx.byName.Mariana?.memberId,
    });
    expect(res.body.owner.id).toBe(fx.byName.Mariana?.memberId);
  });
});

describe("US-004 Saldo inicial negativo", () => {
  it("-30000 gera OPENING DEBIT de 30000 e saldo -30000", async () => {
    const res = await newAccount(mariana(), {
      name: "Cheque especial",
      type: "CHECKING",
      openingBalanceInCents: -30000,
    });
    expect(res.status).toBe(201);
    expect(res.body.balanceInCents).toBe(-30000);
    const opening = await db.transaction.findFirstOrThrow({ where: { accountId: res.body.id } });
    expect(opening).toMatchObject({ direction: "DEBIT", kind: "OPENING" });
    expect(opening.amountInCents).toBe(30000n);
    const list = await call(mariana(), "GET", "/api/v1/accounts");
    expect(list.body.totalBalanceInCents).toBe(-30000);
  });
});

describe("US-004 Campos obrigatórios", () => {
  it("sem nome e tipo: 400 com mensagens por campo e nada criado", async () => {
    const res = await newAccount(mariana(), {});
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([
        { path: "name", message: "Informe o nome da conta" },
        { path: "type", message: "Escolha o tipo da conta" },
      ]),
    );
    expect(await db.bankAccount.count()).toBe(0);
    expect(await db.transaction.count()).toBe(0);
  });

  it("(infra) .strict(): familyId no corpo é rejeitado", async () => {
    const res = await newAccount(mariana(), {
      name: "Itaú",
      type: "CHECKING",
      familyId: fx.family.id,
    });
    expect(res.status).toBe(400);
    expect(await db.bankAccount.count()).toBe(0);
  });

  it("(infra) titular de outra família: 422 INVALID_REFERENCE", async () => {
    const other = await makeFamily({ name: "Família Souza", uniqueEmails: true });
    const res = await newAccount(mariana(), {
      name: "Itaú",
      type: "CHECKING",
      ownerMemberId: other.members[0]?.memberId,
    });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVALID_REFERENCE");
    expect(res.body.error.details).toEqual([
      { path: "ownerMemberId", message: expect.any(String) },
    ]);
    expect(await db.bankAccount.count()).toBe(0);
  });

  it("(infra) data de abertura futura: 422 FUTURE_DATE_NOT_ALLOWED; passada é aceita", async () => {
    const future = await newAccount(mariana(), {
      name: "Futura",
      type: "CHECKING",
      openingDate: "2999-01-01",
    });
    expect(future.status).toBe(422);
    expect(future.body.error.code).toBe("FUTURE_DATE_NOT_ALLOWED");
    const past = await newAccount(mariana(), {
      name: "Passada",
      type: "CHECKING",
      openingDate: "2026-01-15",
    });
    expect(past.status).toBe(201);
    const opening = await db.transaction.findFirstOrThrow({ where: { accountId: past.body.id } });
    expect(opening.occurredOn.toISOString().slice(0, 10)).toBe("2026-01-15");
  });
});

describe("US-004 Nome duplicado na família", () => {
  it("mesma conta com caixa/espaços diferentes: 409 DUPLICATE_ACCOUNT_NAME com a mensagem exata", async () => {
    await newAccount(mariana(), { name: "Itaú Mariana", type: "CHECKING" });
    const dup = await newAccount(lucas(), { name: "  itaú mariana ", type: "SAVINGS" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({
      code: "DUPLICATE_ACCOUNT_NAME",
      message: "Já existe uma conta com este nome",
    });
    expect(await db.bankAccount.count()).toBe(1);
    expect(await db.transaction.count()).toBe(1); // só a abertura da primeira
  });

  it("corrida: 2 criações simultâneas (chaves diferentes) => 1×201 e 1×409", async () => {
    const results = await Promise.all([
      newAccount(mariana(), {
        name: "Conta Corrida",
        type: "CHECKING",
        openingBalanceInCents: 100,
      }),
      newAccount(lucas(), { name: "conta corrida", type: "CHECKING", openingBalanceInCents: 200 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.bankAccount.count()).toBe(1);
    expect(await db.transaction.count()).toBe(1);
  });

  it("outra família pode usar o mesmo nome", async () => {
    const other = await makeFamily({ name: "Família Souza", uniqueEmails: true });
    await newAccount(mariana(), { name: "Itaú", type: "CHECKING" });
    const res = await newAccount(other.members[0]?.as ?? null, { name: "Itaú", type: "CHECKING" });
    expect(res.status).toBe(201);
  });
});

describe("US-004 Conta visível para os dois membros", () => {
  it("Lucas lista a conta criada por Mariana com o mesmo saldo", async () => {
    await newAccount(mariana(), {
      name: "Nubank Conjunta",
      type: "CHECKING",
      openingBalanceInCents: 100000,
    });
    const res = await call(lucas(), "GET", "/api/v1/accounts");
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0]).toMatchObject({ name: "Nubank Conjunta", balanceInCents: 100000 });
  });
});

describe("US-004 Isolamento entre famílias", () => {
  it("usuário da Família B não lê nem escreve contas da Família A", async () => {
    const b = await makeFamily({ name: "Família Souza", uniqueEmails: true });
    const created = await newAccount(mariana(), {
      name: "Itaú Mariana",
      type: "CHECKING",
      openingBalanceInCents: 5000,
    });
    const asB = b.members[0]?.as ?? null;

    const list = await call(asB, "GET", "/api/v1/accounts");
    expect(list.body.items).toHaveLength(0);
    expect(list.body.totalBalanceInCents).toBe(0);

    const patch = await call(asB, "PATCH", `/api/v1/accounts/${created.body.id}`, {
      name: "Invadida",
      version: 1,
    });
    expect(patch.status).toBe(404);
    expect((await db.bankAccount.findUniqueOrThrow({ where: { id: created.body.id } })).name).toBe(
      "Itaú Mariana",
    );
  });
});

describe("US-004 Renomear conta", () => {
  it("PATCH muda o nome, mantém o saldo e incrementa a version", async () => {
    const created = await newAccount(mariana(), {
      name: "Itaú Mariana",
      type: "CHECKING",
      openingBalanceInCents: 150000,
    });
    const res = await call(mariana(), "PATCH", `/api/v1/accounts/${created.body.id}`, {
      name: "Itaú Principal",
      version: 1,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: "Itaú Principal", balanceInCents: 150000, version: 2 });
  });

  it("versão antiga: 409 VERSION_CONFLICT e o nome não muda", async () => {
    const created = await newAccount(mariana(), { name: "Itaú Mariana", type: "CHECKING" });
    await call(mariana(), "PATCH", `/api/v1/accounts/${created.body.id}`, {
      name: "Primeiro",
      version: 1,
    });
    const stale = await call(lucas(), "PATCH", `/api/v1/accounts/${created.body.id}`, {
      name: "Segundo",
      version: 1,
    });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(stale.body.error.details.currentVersion).toBe(2);
    expect((await db.bankAccount.findUniqueOrThrow({ where: { id: created.body.id } })).name).toBe(
      "Primeiro",
    );
  });

  it("dois PATCH simultâneos com a mesma version: um 200 e um 409", async () => {
    const created = await newAccount(mariana(), { name: "Itaú Mariana", type: "CHECKING" });
    const results = await Promise.all([
      call(mariana(), "PATCH", `/api/v1/accounts/${created.body.id}`, {
        name: "Nome A",
        version: 1,
      }),
      call(lucas(), "PATCH", `/api/v1/accounts/${created.body.id}`, { name: "Nome B", version: 1 }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
  });

  it("nome duplicado: 409 DUPLICATE_ACCOUNT_NAME; id inexistente ou inválido: 404", async () => {
    const a = await newAccount(mariana(), { name: "Itaú Mariana", type: "CHECKING" });
    await newAccount(mariana(), { name: "Nubank", type: "CHECKING" });
    const dup = await call(mariana(), "PATCH", `/api/v1/accounts/${a.body.id}`, {
      name: "nubank",
      version: 1,
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_ACCOUNT_NAME");
    expect(
      (
        await call(mariana(), "PATCH", `/api/v1/accounts/${randomUUID()}`, {
          name: "Qualquer",
          version: 1,
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(mariana(), "PATCH", "/api/v1/accounts/nao-e-uuid", {
          name: "Qualquer",
          version: 1,
        })
      ).status,
    ).toBe(404);
  });

  it("nome inválido: 400 e nada muda", async () => {
    const a = await newAccount(mariana(), { name: "Itaú Mariana", type: "CHECKING" });
    const res = await call(mariana(), "PATCH", `/api/v1/accounts/${a.body.id}`, {
      name: "x",
      version: 1,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Informe o nome da conta");
  });
});

describe("US-004 (infra) Atomicidade da abertura", () => {
  it("falha ao gravar a revisão desfaz conta e lançamento de abertura", async () => {
    vi.spyOn(ledger, "recordRevision").mockRejectedValueOnce(new Error("falha injetada"));
    const res = await newAccount(mariana(), {
      name: "Itaú Mariana",
      type: "CHECKING",
      openingBalanceInCents: 1000,
    });
    expect(res.status).toBe(500);
    expect(await db.bankAccount.count()).toBe(0);
    expect(await db.transaction.count()).toBe(0);
    expect(await db.transactionRevision.count()).toBe(0);
  });
});

describe("US-004 (infra) Idempotência", () => {
  it("duplo envio simultâneo com a mesma chave: 1 conta, 1 abertura, mesma resposta", async () => {
    const key = randomUUID();
    const body = { name: "Itaú Mariana", type: "CHECKING", openingBalanceInCents: 150000 };
    const [a, b] = await Promise.all([
      newAccount(mariana(), body, { idempotencyKey: key }),
      newAccount(mariana(), body, { idempotencyKey: key }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body).toEqual(b.body);
    expect(await db.bankAccount.count()).toBe(1);
    expect(await db.transaction.count()).toBe(1);
  });
});

describe("US-004 (infra) Abertura intocável e saldo derivado", () => {
  it("DELETE direto em transactions e UPDATE/DELETE em revisões são barrados por trigger", async () => {
    const res = await newAccount(mariana(), {
      name: "Itaú",
      type: "CHECKING",
      openingBalanceInCents: 1000,
    });
    await expect(
      db.$executeRawUnsafe(`DELETE FROM transactions WHERE "accountId" = '${res.body.id}'::uuid`),
    ).rejects.toThrow(/append-only/);
    await expect(
      db.$executeRawUnsafe(`UPDATE transaction_revisions SET revision = 9`),
    ).rejects.toThrow(/append-only/);
    await expect(db.$executeRawUnsafe(`DELETE FROM transaction_revisions`)).rejects.toThrow(
      /append-only/,
    );
    expect(await db.transaction.count()).toBe(1);
  });

  it("accountBalances: inclui OPENING, ignora excluídos e devolve 0 para contas sem linhas", async () => {
    const a = await newAccount(mariana(), {
      name: "Conta A",
      type: "CHECKING",
      openingBalanceInCents: 5000,
    });
    const b = await newAccount(mariana(), { name: "Conta B", type: "CHECKING" });
    const balances = await db.$transaction((tx) =>
      accountBalances(tx, fx.family.id, [a.body.id, b.body.id]),
    );
    expect(balances.get(a.body.id)).toBe(5000);
    expect(balances.get(b.body.id)).toBe(0);
    await db.transaction.updateMany({
      where: { accountId: a.body.id },
      data: {
        deletedAt: new Date(),
        deletedByMemberId: fx.byName.Mariana?.memberId ?? null,
        deletionReason: "DELETED",
      },
    });
    const after = await db.$transaction((tx) => accountBalances(tx, fx.family.id));
    expect(after.get(a.body.id) ?? 0).toBe(0);
  });

  it("autenticação: sem sessão 401; sem família 403 NO_FAMILY", async () => {
    expect((await call(null, "GET", "/api/v1/accounts")).status).toBe(401);
    const { asUser } = await import("../support/factories");
    const loner = await asUser("sozinho@exemplo.com");
    const res = await call(loner, "GET", "/api/v1/accounts");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_FAMILY");
  });
});
