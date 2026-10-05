import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
  makeTransfer,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let poup: AccountFixture; // com histórico, saldo zero
let velha: AccountFixture; // nunca usada
let itau: AccountFixture; // saldo 300000
const mariana = () => fx.byName.Mariana?.as ?? null; // ADMIN
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const act = (as: ReturnType<typeof mariana>, id: string, a: string, version = 1, key?: string) =>
  at(() =>
    call(
      as,
      "POST",
      `/api/v1/accounts/${id}/${a}`,
      { version },
      key ? { idempotencyKey: key } : undefined,
    ),
  );
const list = (as = mariana(), qs = "") => at(() => call(as, "GET", `/api/v1/accounts${qs}`));
const cat = async (n: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: n } })).id;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  poup = await makeAccount(fx, {
    name: "Poupança",
    owner: "Mariana",
    openingBalanceInCents: 10000,
  });
  velha = await makeAccount(fx, {
    name: "Carteira antiga",
    owner: "Mariana",
    openingBalanceInCents: 0,
  });
  itau = await makeAccount(fx, {
    name: "Itaú Lucas",
    owner: "Lucas",
    openingBalanceInCents: 300000,
  });
  // histórico da poupança que zera o saldo: despesa de 10000
  await makeTransaction(fx, {
    account: poup,
    category: "Supermercado",
    amountInCents: 10000,
    occurredOn: "2026-10-03",
    author: "Mariana",
    shared: false,
  });
});

describe("US-032 arquivar, reativar e excluir conta", () => {
  it("arquivar com saldo zero: 200, some da lista padrão, aparece em ?archived=true; total ignora arquivada", async () => {
    const res = await act(mariana(), poup.id, "archive");
    expect(res.status).toBe(200);
    expect(res.body.account).toMatchObject({ archived: true, balanceInCents: 0, version: 2 });
    const active = (await list()).body;
    expect(active.items.map((a: { name: string }) => a.name)).not.toContain("Poupança");
    expect(active.totalBalanceInCents).toBe(300000);
    expect(
      (await list(mariana(), "?archived=true")).body.items.map((a: { name: string }) => a.name),
    ).toEqual(["Poupança"]);
    expect((await list(mariana(), "?archived=all")).body.items).toHaveLength(3);
    expect((await list(mariana(), "?archived=zz")).status).toBe(400);
  });

  it("saldo diferente de zero bloqueia (422 com saldo nos detalhes); nada muda", async () => {
    const res = await act(mariana(), itau.id, "archive");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("ACCOUNT_BALANCE_NOT_ZERO");
    expect(res.body.error.message).toBe(
      "Para arquivar, o saldo precisa ser zero. Transfira ou ajuste o saldo antes.",
    );
    expect(res.body.error.details.balanceInCents).toBe(300000);
    expect(
      (await db.bankAccount.findUniqueOrThrow({ where: { id: itau.id } })).archivedAt,
    ).toBeNull();
  });

  it("qualquer membro arquiva e reativa; reativar devolve a conta com o mesmo saldo", async () => {
    expect((await act(lucas(), poup.id, "archive")).status).toBe(200);
    const re = await act(lucas(), poup.id, "unarchive", 2);
    expect(re.status).toBe(200);
    expect(re.body.account).toMatchObject({ archived: false, balanceInCents: 0 });
    expect((await act(lucas(), poup.id, "unarchive", 3)).body.error.code).toBe("NOT_ARCHIVED");
  });

  it("já arquivada => 409 ALREADY_ARCHIVED; versão antiga => 409 VERSION_CONFLICT com o nome de quem alterou", async () => {
    await act(mariana(), poup.id, "archive");
    expect((await act(mariana(), poup.id, "archive", 2)).body.error.code).toBe("ALREADY_ARCHIVED");
    const stale = await act(lucas(), poup.id, "archive", 1);
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("VERSION_CONFLICT");
    expect(stale.body.error.message).toBe(
      "Esta conta foi alterada por Mariana. Recarregue para continuar.",
    );
  });

  it("excluir: só ADMIN e só conta nunca usada; some de tudo e libera o nome; arquivada ocupa o nome", async () => {
    expect((await act(lucas(), velha.id, "delete")).status).toBe(403);
    const hist = await act(mariana(), poup.id, "delete");
    expect(hist.status).toBe(422);
    expect(hist.body.error.code).toBe("ACCOUNT_HAS_HISTORY");
    expect((await act(mariana(), itau.id, "delete")).status).toBe(422);
    expect((await list()).body.items.find((a: { id: string }) => a.id === velha.id).neverUsed).toBe(
      true,
    );
    expect((await list()).body.items.find((a: { id: string }) => a.id === poup.id).neverUsed).toBe(
      false,
    );
    const del = await act(mariana(), velha.id, "delete");
    expect(del.status).toBe(200);
    expect(del.body).toEqual({ deleted: true });
    expect(
      (await list(mariana(), "?archived=all")).body.items.map((a: { name: string }) => a.name),
    ).not.toContain("Carteira antiga");
    const recreate = await at(() =>
      call(mariana(), "POST", "/api/v1/accounts", { name: "Carteira antiga", type: "CASH" }),
    );
    expect(recreate.status).toBe(201);
    await act(mariana(), poup.id, "archive");
    const dup = await at(() =>
      call(mariana(), "POST", "/api/v1/accounts", { name: "Poupança", type: "CASH" }),
    );
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("DUPLICATE_ACCOUNT_NAME");
    // conta excluída nunca reaparece nem é reativável
    expect((await act(mariana(), velha.id, "unarchive", 2)).status).toBe(404);
    // o ledger segue intacto: a abertura de zero permanece
    expect(await db.transaction.count({ where: { accountId: velha.id } })).toBe(1);
  });

  it("não aceita postagem nova em conta arquivada (despesa, receita, transferência, pagamento) => 422 INVALID_REFERENCE", async () => {
    await act(mariana(), poup.id, "archive");
    const exp = await at(async () =>
      call(mariana(), "POST", "/api/v1/transactions", {
        type: "EXPENSE",
        accountId: poup.id,
        categoryId: await cat("Supermercado"),
        amountInCents: 100,
      }),
    );
    expect(exp.status).toBe(422);
    expect(exp.body.error.code).toBe("INVALID_REFERENCE");
    const inc = await at(async () =>
      call(mariana(), "POST", "/api/v1/transactions", {
        type: "INCOME",
        accountId: poup.id,
        categoryId: await cat("Salário"),
        amountInCents: 100,
      }),
    );
    expect(inc.status).toBe(422);
    const tr = await at(() =>
      call(mariana(), "POST", "/api/v1/transfers", {
        fromAccountId: itau.id,
        toAccountId: poup.id,
        amountInCents: 100,
      }),
    );
    expect(tr.status).toBe(422);
    const tr2 = await at(() =>
      call(mariana(), "POST", "/api/v1/transfers", {
        fromAccountId: poup.id,
        toAccountId: itau.id,
        amountInCents: 100,
      }),
    );
    expect(tr2.status).toBe(422);
  });

  it("lançamento de conta arquivada fica travado: editar/excluir/restaurar => ACCOUNT_ARCHIVED_LOCKED; renomear também; leitura segue com o marcador", async () => {
    const tx = await db.transaction.findFirstOrThrow({
      where: { accountId: poup.id, kind: "EXPENSE" },
    });
    await act(mariana(), poup.id, "archive");
    const patch = await at(() =>
      call(mariana(), "PATCH", `/api/v1/transactions/${tx.id}`, {
        version: 1,
        description: "Novo nome",
      }),
    );
    expect(patch.status).toBe(422);
    expect(patch.body.error.code).toBe("ACCOUNT_ARCHIVED_LOCKED");
    expect(
      (
        await at(() =>
          call(mariana(), "POST", `/api/v1/transactions/${tx.id}/delete`, { version: 1 }),
        )
      ).body.error.code,
    ).toBe("ACCOUNT_ARCHIVED_LOCKED");
    expect(
      (
        await at(() =>
          call(mariana(), "PATCH", `/api/v1/accounts/${poup.id}`, { name: "Zzz", version: 2 }),
        )
      ).body.error.code,
    ).toBe("ACCOUNT_ARCHIVED_LOCKED");
    const ext = await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10"));
    const row = ext.body.items.find((i: { id: string }) => i.id === tx.id);
    expect(row.account).toMatchObject({ name: "Poupança", archived: true });
    expect((await at(() => call(mariana(), "GET", `/api/v1/transactions/${tx.id}`))).status).toBe(
      200,
    );
    // reativar libera a edição
    await act(mariana(), poup.id, "unarchive", 2);
    expect(
      (
        await at(() =>
          call(mariana(), "PATCH", `/api/v1/transactions/${tx.id}`, {
            version: 1,
            description: "Novo nome",
          }),
        )
      ).status,
    ).toBe(200);
  });

  it("desfazer transferência que toca conta arquivada é recusado", async () => {
    const t = await makeTransfer(fx, {
      from: itau,
      to: poup,
      amountInCents: 5000,
      occurredOn: "2026-10-04",
    });
    void t;
    // saldo da poupança agora 5000: devolve e zera para arquivar
    await makeTransfer(fx, { from: poup, to: itau, amountInCents: 5000, occurredOn: "2026-10-05" });
    await act(mariana(), poup.id, "archive");
    const group = await db.transferGroup.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
    const undo = await at(() =>
      call(mariana(), "POST", `/api/v1/transfers/${group.id}/undo`, { version: 1 }),
    );
    expect(undo.status).toBe(422);
    expect(undo.body.error.code).toBe("ACCOUNT_ARCHIVED_LOCKED");
  });

  it("corrida: arquivar × postar nas duas ordens nunca deixa conta arquivada com saldo ≠ 0", async () => {
    for (let i = 0; i < 6; i++) {
      await resetDb();
      fx = await makeFamily();
      const acc = await makeAccount(fx, {
        name: "Corrida",
        owner: "Mariana",
        openingBalanceInCents: 0,
      });
      await makeAccount(fx, { name: "Outra", owner: "Mariana", openingBalanceInCents: 50000 });
      const income = await cat("Salário");
      const doPost = () =>
        at(() =>
          call(lucas(), "POST", "/api/v1/transactions", {
            type: "INCOME",
            accountId: acc.id,
            categoryId: income,
            amountInCents: 1000,
          }),
        );
      const doArchive = () => act(mariana(), acc.id, "archive");
      const [a, b] =
        i % 2 === 0
          ? await Promise.all([doPost(), doArchive()])
          : await Promise.all([doArchive(), doPost()]);
      const row = await db.bankAccount.findUniqueOrThrow({ where: { id: acc.id } });
      const balance = Number(
        (
          await db.transaction.aggregate({
            where: { accountId: acc.id, deletedAt: null, direction: "CREDIT" },
            _sum: { amountInCents: true },
          })
        )._sum.amountInCents ?? 0n,
      );
      if (row.archivedAt) expect(balance, `iteração ${i}: arquivada com saldo ${balance}`).toBe(0);
      expect([a.status, b.status].some((s) => s === 201 || s === 200)).toBe(true);
    }
  }, 120_000);

  it("duplo clique: mesma chave => 1 arquivamento; isolamento: conta de outra família => 404", async () => {
    const key = crypto.randomUUID();
    const [x, y] = await Promise.all([
      act(mariana(), poup.id, "archive", 1, key),
      act(mariana(), poup.id, "archive", 1, key),
    ]);
    expect([x.status, y.status].every((s) => s === 200)).toBe(true);
    expect((await db.bankAccount.findUniqueOrThrow({ where: { id: poup.id } })).version).toBe(2);
    const other = await makeFamily({ uniqueEmails: true, name: "Souza" });
    expect((await act(other.members[0]?.as ?? null, poup.id, "archive")).status).toBe(404);
  });

  it("regressão: Σ saldos e extrato idênticos antes e depois de arquivar", async () => {
    const before = (await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10")))
      .body.totals;
    await act(mariana(), poup.id, "archive");
    const after = (await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10")))
      .body.totals;
    expect(after).toEqual(before);
  });
});
