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
const MSG = "Este mês já foi acertado. O saldo do acerto será recalculado.";
let sharedId: string;
let personalId: string;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  nubank = await makeAccount(fx, {
    name: "Nubank Mariana",
    owner: "Mariana",
    openingBalanceInCents: 500000,
  });
  itau = await makeAccount(fx, {
    name: "Itaú Lucas",
    owner: "Lucas",
    openingBalanceInCents: 500000,
  });
  const shared = await makeTransaction(fx, {
    account: nubank,
    category: "Supermercado",
    amountInCents: 80000,
    occurredOn: "2026-10-03",
    author: "Mariana",
    payer: "Mariana",
  });
  const personal = await makeTransaction(fx, {
    account: nubank,
    category: "Lazer e restaurantes",
    amountInCents: 5000,
    occurredOn: "2026-10-03",
    author: "Mariana",
    payer: "Mariana",
    shared: false,
  });
  sharedId = shared.id;
  personalId = personal.id;
  // acerto de outubro: Lucas -> Mariana 40000
  const res = await at(() =>
    call(lucas(), "POST", "/api/v1/settlements", {
      period: "2026-10",
      fromMemberId: mid("Lucas"),
      toMemberId: mid("Mariana"),
      amountInCents: 40000,
      fromAccountId: itau.id,
      toAccountId: nubank.id,
    }),
  );
  expect(res.status).toBe(201);
});

const patch = (id: string, body: Record<string, unknown>) =>
  at(() => call(mariana(), "PATCH", `/api/v1/transactions/${id}`, body));

describe("US-013b Aviso em mês já acertado", () => {
  it("PATCH de valor em despesa comum sem a flag => 409 com a mensagem e os períodos; com a flag => 200", async () => {
    const blocked = await patch(sharedId, { version: 1, amountInCents: 60000 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("SETTLED_PERIOD_CONFIRMATION_REQUIRED");
    expect(blocked.body.error.message).toBe(MSG);
    expect(blocked.body.error.details).toEqual({ periods: ["2026-10"] });
    expect((await db.transaction.findUniqueOrThrow({ where: { id: sharedId } })).version).toBe(1);
    const ok = await patch(sharedId, {
      version: 1,
      amountInCents: 60000,
      confirmSettledPeriod: true,
    });
    expect(ok.status).toBe(200);
    // saldo do acerto recalculado: Mariana pagou 60000 => Lucas deve 30000 - 40000 já pagos => Mariana deve 10000
    const panel = await at(() => call(lucas(), "GET", "/api/v1/settlement"));
    expect(panel.body.suggestions[0]).toMatchObject({
      from: { name: "Mariana Silva" },
      amountInCents: 10000,
    });
  });

  it("Editar só a descrição (ou despesa pessoal) não exige a flag", async () => {
    expect((await patch(sharedId, { version: 1, description: "Mercado de outubro" })).status).toBe(
      200,
    );
    expect((await patch(personalId, { version: 1, amountInCents: 6000 })).status).toBe(200);
  });

  it("Excluir/restaurar despesa comum de mês acertado exige a flag", async () => {
    const del = (body: Record<string, unknown>) =>
      at(() => call(mariana(), "POST", `/api/v1/transactions/${sharedId}/delete`, body));
    const blocked = await del({ version: 1 });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("SETTLED_PERIOD_CONFIRMATION_REQUIRED");
    expect((await del({ version: 1, confirmSettledPeriod: true })).status).toBe(200);
    const restore = (body: Record<string, unknown>) =>
      at(() => call(mariana(), "POST", `/api/v1/transactions/${sharedId}/restore`, body));
    expect((await restore({ version: 2 })).body.error.code).toBe(
      "SETTLED_PERIOD_CONFIRMATION_REQUIRED",
    );
    expect((await restore({ version: 2, confirmSettledPeriod: true })).status).toBe(200);
  });

  it("Mover a despesa para outro mês acertado/não acertado: considera o período antes e depois", async () => {
    const moved = await patch(sharedId, { version: 1, occurredOn: "2026-09-20" });
    expect(moved.status).toBe(409);
    expect(moved.body.error.details).toEqual({ periods: ["2026-10"] });
    const okMove = await patch(sharedId, {
      version: 1,
      occurredOn: "2026-09-20",
      confirmSettledPeriod: true,
    });
    expect(okMove.status).toBe(200);
    // despesa sem acerto no mês de destino/origem não pede confirmação
    const free = await makeTransaction(fx, {
      account: nubank,
      category: "Moradia",
      amountInCents: 1000,
      occurredOn: "2026-09-10",
      author: "Mariana",
      payer: "Mariana",
    });
    expect((await patch(free.id, { version: 1, amountInCents: 2000 })).status).toBe(200);
  });

  it("Desfazer o acerto remove a exigência de confirmação (mês deixa de estar acertado)", async () => {
    const group = await db.transferGroup.findFirstOrThrow({ where: { kind: "SETTLEMENT" } });
    const undo = await at(() =>
      call(lucas(), "POST", `/api/v1/transfers/${group.id}/undo`, { version: group.version }),
    );
    expect(undo.status).toBe(200);
    expect((await patch(sharedId, { version: 1, amountInCents: 60000 })).status).toBe(200);
  });

  it("Transferência e acerto não são editáveis: PATCH/delete em perna de acerto => NOT_EDITABLE", async () => {
    const leg = await db.transaction.findFirstOrThrow({ where: { kind: "TRANSFER_OUT" } });
    const res = await patch(leg.id, { version: 1, description: "xx" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("NOT_EDITABLE");
    const detail = await at(() => call(mariana(), "GET", `/api/v1/transactions/${leg.id}`));
    expect(detail.body.transaction).toMatchObject({ isSettlement: true, type: "TRANSFER_OUT" });
  });
});
