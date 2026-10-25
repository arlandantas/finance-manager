import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashSessionToken } from "@/lib/auth/session";
import { withClock } from "@/lib/clock";
import { DELETED_ACCOUNT_NAME, memberLabel } from "@/lib/deleted-account";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeAccount, makeFamily, makeTransaction } from "../support/factories";

// SEC-030 e SEC-033 (revisão de LGPD 2026-10-25, D-GES-46): conta excluída nunca autentica e o rótulo
// "conta excluída" vem de `users.deletedAt`, não do nome.
const db = testDb();
const NOW = "2026-11-05T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
type Who = NonNullable<FamilyFixture["byName"][string]>["as"];
const lucas = () => fx.byName.Lucas?.as as Who;
const mariana = () => fx.byName.Mariana?.as as Who;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({ name: "Família Silva" });
});
afterEach(() => vi.unstubAllEnvs());

async function deleteLucas() {
  const r = await at(() =>
    call(lucas(), "POST", "/api/v1/me/delete-account", {
      confirmEmail: lucas().email,
      acknowledgeSettlement: true,
    }),
  );
  expect(r.status).toBe(200);
  return db.user.findUniqueOrThrow({ where: { id: lucas().userId } });
}

describe("SEC-030 conta excluída nunca autentica", () => {
  it("sessão ainda existente de usuário excluído => 401 e a linha é apagada", async () => {
    const user = await deleteLucas();
    const token = randomUUID();
    await db.session.create({
      data: {
        tokenHash: hashSessionToken(token),
        userId: user.id,
        expires: new Date("2026-12-01T00:00:00Z"),
        createdAt: new Date("2026-11-05T14:00:00Z"),
      },
    });
    const res = await at(() =>
      call(
        { cookie: `authjs.session-token=${token}`, userId: user.id, email: user.email },
        "GET",
        "/api/v1/me",
      ),
    );
    expect(res.status).toBe(401);
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });

  it("login de teste no e-mail anonimizado => 403 ACCOUNT_DELETED; nada é regravado", async () => {
    const user = await deleteLucas();
    vi.stubEnv("AUTH_DEV_LOGIN", "true");
    const res = await call(null, "POST", "/api/dev/login", { email: user.email, name: "Zumbi" });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("ACCOUNT_DELETED");
    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.name).toBe(DELETED_ACCOUNT_NAME);
    expect(after.deletedAt).not.toBeNull();
    expect(await db.session.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("SEC-033 'conta excluída' não é decidida pelo nome", () => {
  it("membro ATIVO com o nome 'Conta excluída' aparece com o nome; a conta realmente excluída ganha deleted:true", async () => {
    await db.user.update({ where: { id: mariana().userId }, data: { name: DELETED_ACCOUNT_NAME } });
    const nub = await makeAccount(fx, {
      name: "Nubank",
      owner: "Mariana",
      openingBalanceInCents: 0,
    });
    for (const who of ["Mariana", "Lucas"] as const) {
      await makeTransaction(fx, {
        account: nub,
        category: "Supermercado",
        amountInCents: 1000,
        occurredOn: "2026-10-10",
        author: who,
        payer: who,
        shared: true,
      });
    }
    await deleteLucas();
    const r = await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10"));
    const rows = r.body.items.filter((i: { type: string }) => i.type === "EXPENSE");
    const byActive = rows.find(
      (i: { payer: { id: string } }) => i.payer.id === fx.byName.Mariana?.memberId,
    );
    const byDeleted = rows.find(
      (i: { payer: { id: string } }) => i.payer.id === fx.byName.Lucas?.memberId,
    );
    expect(byActive.payer.deleted).toBeUndefined();
    expect(memberLabel(byActive.payer)).toBe(DELETED_ACCOUNT_NAME);
    expect(byDeleted.payer.deleted).toBe(true);
    expect(memberLabel(byDeleted.payer)).toBe("ex-membro (conta excluída)");
  });
});
