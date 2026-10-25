import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { mcpTools } from "@/modules/mcp/tools";
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

// SEC-021 (D-GES-42, DEV-88): lançamento "Só meu" só é alterado pelo DONO (quem pagou). Os demais
// membros continuam vendo o lançamento, sem ações de escrita. Despesa comum segue editável por todos.
const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({
    members: [
      { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" },
      { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
      { email: "carla@exemplo.com", name: "Carla Silva", role: "MEMBER" },
    ],
  });
  acc = await makeAccount(fx, { name: "Conta", owner: "Mariana", openingBalanceInCents: 100000 });
});

const catId = async (name: string) =>
  (await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name } })).id;
const mkPersonal = (payer = "Mariana", over: Record<string, unknown> = {}) =>
  makeTransaction(fx, {
    account: acc,
    category: "Supermercado",
    amountInCents: 5000,
    occurredOn: "2026-10-02",
    payer,
    shared: false,
    ...over,
  });

describe("SEC-021 lançamento Só meu: só o dono altera", () => {
  it("reprodução do relatório: membro que não é o dono NÃO edita, exclui nem restaura", async () => {
    const t = await mkPersonal("Mariana");
    const patch = await at(() =>
      call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, {
        version: 1,
        amountInCents: 99900,
        description: "adulterado",
      }),
    );
    expect(patch.status).toBe(403);
    expect(patch.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    const del = await at(() =>
      call(lucas(), "POST", `/api/v1/transactions/${t.id}/delete`, { version: 1 }),
    );
    expect(del.status).toBe(403);
    // nada mudou
    const row = await db.transaction.findUniqueOrThrow({ where: { id: t.id } });
    expect(row).toMatchObject({ version: 1, deletedAt: null, description: "Supermercado" });
    expect(Number(row.amountInCents)).toBe(5000);
    // exclusão pelo dono, depois restauração por outro membro é recusada
    const own = await at(() =>
      call(mariana(), "POST", `/api/v1/transactions/${t.id}/delete`, { version: 1 }),
    );
    expect(own.status).toBe(200);
    const restoreOther = await at(() =>
      call(lucas(), "POST", `/api/v1/transactions/${t.id}/restore`, { version: 2 }),
    );
    expect(restoreOther.status).toBe(403);
    const restoreOwn = await at(() =>
      call(mariana(), "POST", `/api/v1/transactions/${t.id}/restore`, { version: 2 }),
    );
    expect(restoreOwn.status).toBe(200);
  });

  it("o dono edita; o outro membro ainda lê detalhe e histórico", async () => {
    const t = await mkPersonal("Mariana");
    const ok = await at(() =>
      call(mariana(), "PATCH", `/api/v1/transactions/${t.id}`, { version: 1, amountInCents: 6000 }),
    );
    expect(ok.status).toBe(200);
    expect((await at(() => call(lucas(), "GET", `/api/v1/transactions/${t.id}`))).status).toBe(200);
    expect(
      (await at(() => call(lucas(), "GET", `/api/v1/transactions/${t.id}/history`))).status,
    ).toBe(200);
  });

  it("despesa comum (dividida) continua editável por qualquer membro", async () => {
    const t = await mkPersonal("Mariana", { shared: true });
    const res = await at(() =>
      call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, { version: 1, amountInCents: 7000 }),
    );
    expect(res.status).toBe(200);
  });

  it("D-GES-50: o autor que lançou em nome de outro (e o pagador) alteram; terceiro não", async () => {
    const t = await mkPersonal("Lucas", { author: "Mariana" });
    const byAuthor = await at(() =>
      call(mariana(), "PATCH", `/api/v1/transactions/${t.id}`, {
        version: 1,
        amountInCents: 1 + 5000,
      }),
    );
    expect(byAuthor.status).toBe(200);
    const byOther = await at(() =>
      call(fx.byName.Carla?.as ?? null, "PATCH", `/api/v1/transactions/${t.id}`, {
        version: 2,
        amountInCents: 5200,
      }),
    );
    expect(byOther.status).toBe(403);
    const byPayer = await at(() =>
      call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, { version: 2, amountInCents: 5100 }),
    );
    expect(byPayer.status).toBe(200);
  });

  it("não vira 'dividida' nem troca o pagador por quem não é o dono", async () => {
    const t = await mkPersonal("Mariana");
    for (const body of [{ isSharedExpense: true }, { payerMemberId: fx.byName.Lucas?.memberId }]) {
      const res = await at(() =>
        call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, { version: 1, ...body }),
      );
      expect(res.status).toBe(403);
    }
  });

  it("quem não pagou não converte despesa dividida em 'Só meu'", async () => {
    const t = await mkPersonal("Mariana", { shared: true });
    const other = await at(() =>
      call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, {
        version: 1,
        isSharedExpense: false,
      }),
    );
    expect(other.status).toBe(403);
    const payer = await at(() =>
      call(mariana(), "PATCH", `/api/v1/transactions/${t.id}`, {
        version: 1,
        isSharedExpense: false,
      }),
    );
    expect(payer.status).toBe(200);
  });

  it("receita não é 'Só meu': segue editável pelos membros (hipótese DEV-88)", async () => {
    const t = await makeTransaction(fx, {
      account: acc,
      type: "INCOME",
      category: "Salário",
      amountInCents: 300000,
      occurredOn: "2026-10-01",
      payer: "Mariana",
    });
    const res = await at(() =>
      call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, { version: 1, amountInCents: 310000 }),
    );
    expect(res.status).toBe(200);
  });

  it("dono que saiu da família: somente leitura, exceto o Administrador (D-PO-92, D-GES-52)", async () => {
    const t = await mkPersonal("Carla");
    await db.member.update({
      where: { id: fx.byName.Carla?.memberId as string },
      data: { removedAt: new Date("2026-10-03T00:00:00Z"), removalKind: "LEFT" },
    });
    const byMember = await at(() =>
      call(lucas(), "PATCH", `/api/v1/transactions/${t.id}`, { version: 1, amountInCents: 5100 }),
    );
    expect(byMember.status).toBe(403);
    const byAdmin = await at(() =>
      call(mariana(), "PATCH", `/api/v1/transactions/${t.id}`, { version: 1, amountInCents: 5100 }),
    );
    expect(byAdmin.status).toBe(200); // D-GES-52: o Administrador dá continuidade
  });

  it("estorno do pagamento de uma prevista 'Só meu' (desfazer a baixa) é só do dono", async () => {
    const moradia = await catId("Moradia");
    const planned = await at(() =>
      call(mariana(), "POST", "/api/v1/planned-expenses", {
        description: "Condomínio",
        amountInCents: 40000,
        dueOn: "2026-10-10",
        categoryId: moradia,
        responsibleMemberId: fx.byName.Mariana?.memberId,
        isSharedExpense: false,
      }),
    );
    expect(planned.status).toBe(201);
    const pe = planned.body.plannedExpense as { id: string; version: number };
    const paid = await at(() =>
      call(mariana(), "POST", `/api/v1/planned-expenses/${pe.id}/pay`, {
        version: pe.version,
        accountId: acc.id,
      }),
    );
    expect(paid.status).toBe(201);
    const v = paid.body.plannedExpense.version as number;
    const other = await at(() =>
      call(lucas(), "POST", `/api/v1/planned-expenses/${pe.id}/undo-payment`, { version: v }),
    );
    expect(other.status).toBe(403);
    const own = await at(() =>
      call(mariana(), "POST", `/api/v1/planned-expenses/${pe.id}/undo-payment`, { version: v }),
    );
    expect(own.status).toBe(200);
  });

  it("aceitar sugestão de categoria em lançamento Só meu de outro é recusado", async () => {
    const t = await mkPersonal("Mariana");
    const from = (await db.transaction.findUniqueOrThrow({ where: { id: t.id } })).categoryId;
    const to = await catId("Lazer e restaurantes");
    const res = await at(() =>
      call(lucas(), "POST", "/api/v1/category-suggestions/accept", {
        transactionId: t.id,
        version: 1,
        fromCategoryId: from,
        toCategoryId: to,
      }),
    );
    expect(res.status).toBe(403);
  });

  it("compra parcelada (Só meu) de outro: excluir e restaurar o plano é só do dono", async () => {
    const card = await makeCard(fx, {
      name: "Nubank",
      owner: "Mariana",
      limitInCents: 500000,
      closingDay: 25,
      dueDay: 5,
    });
    const r = await makeInstallmentPurchase(fx, {
      card,
      total: 90000,
      count: 3,
      purchaseOn: "2026-10-02",
      author: "Mariana",
    });
    const planId = r.plan.id;
    const other = await at(() =>
      call(lucas(), "POST", `/api/v1/installment-plans/${planId}/delete`, { version: 1 }),
    );
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe("PERSONAL_OWNER_ONLY");
    const own = await at(() =>
      call(mariana(), "POST", `/api/v1/installment-plans/${planId}/delete`, { version: 1 }),
    );
    expect(own.status).toBe(200);
    const restoreOther = await at(() =>
      call(lucas(), "POST", `/api/v1/installment-plans/${planId}/restore`, { version: 2 }),
    );
    expect(restoreOther.status).toBe(403);
  });

  it("MCP: a única ferramenta de escrita só cria despesa do próprio membro (sem editar/excluir/pagador)", () => {
    const writers = mcpTools.filter((t) => t.scope === "write");
    expect(writers.map((t) => t.name)).toEqual(["lancar_despesa"]);
    const keys = Object.keys(
      (writers[0]?.input as unknown as { shape: Record<string, unknown> }).shape,
    );
    expect(keys).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/payer|transactionId|isShared|memberId/i)]),
    );
  });
});
