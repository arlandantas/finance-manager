import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeAccount, makeFamily, makeTransaction } from "../support/factories";
import { findResidue } from "../support/pii";

// SEC-031 (revisão de LGPD 2026-10-25, D-GES-46): dados excluídos não sobrevivem em idempotency_records,
// nem nas linhas de OUTROS usuários.
const db = testDb();
const NOW = "2026-11-05T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
type Who = NonNullable<FamilyFixture["byName"][string]>["as"];
let fx: FamilyFixture;
const lucas = () => fx.byName.Lucas?.as as Who;
const mariana = () => fx.byName.Mariana?.as as Who;
const idemRows = (needle: string) =>
  db
    .$queryRawUnsafe<Array<{ n: bigint }>>(
      `SELECT count(*) AS n FROM idempotency_records WHERE "responseBody"::text ILIKE $1`,
      `%${needle}%`,
    )
    .then((r) => Number(r[0]?.n ?? 0));

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({ name: "Família Silva" });
});

describe("SEC-031 exclusão de conta limpa as respostas guardadas de outros usuários", () => {
  it("a resposta do PATCH da Mariana que cita 'Lucas Silva' some quando o Lucas exclui a conta", async () => {
    const nub = await makeAccount(fx, {
      name: "Nubank",
      owner: "Mariana",
      openingBalanceInCents: 0,
    });
    const t = await makeTransaction(fx, {
      account: nub,
      category: "Supermercado",
      amountInCents: 5000,
      occurredOn: "2026-10-10",
      author: "Lucas",
      payer: "Lucas",
      shared: true,
    });
    const patch = await at(() =>
      call(
        mariana(),
        "PATCH",
        `/api/v1/transactions/${t.id}`,
        { version: 1, amountInCents: 5100 },
        {
          idempotencyKey: randomUUID(),
        },
      ),
    );
    expect(patch.status).toBe(200);
    expect(await idemRows("Lucas Silva")).toBeGreaterThan(0); // antes: o rastro existe
    const r = await at(() =>
      call(lucas(), "POST", "/api/v1/me/delete-account", {
        confirmEmail: lucas().email,
        acknowledgeSettlement: true,
      }),
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await idemRows("Lucas Silva")).toBe(0);
    expect(await idemRows("lucas@exemplo.com")).toBe(0);
    const residue = await findResidue(["Lucas Silva", "lucas@exemplo.com"]);
    expect(Object.keys(residue).filter((k) => k.startsWith("idempotency_records"))).toEqual([]);
  });
});

describe("SEC-031 exclusão da família limpa as respostas guardadas", () => {
  it("nome da família, ids, nomes de conta e observações somem, inclusive a resposta da própria exclusão", async () => {
    const solo = await makeFamily({
      name: "Família Exclusiva Zeta",
      members: [{ email: "alice@exemplo.com", name: "Alice Zeta", role: "ADMIN" }],
    });
    const alice = solo.byName.Alice?.as as Who;
    const conta = await makeAccount(solo, {
      name: "Conta Alice Zeta",
      owner: "Alice",
      openingBalanceInCents: 1000,
    });
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: solo.family.id, name: "Supermercado" },
    });
    const create = await at(() =>
      call(
        alice,
        "POST",
        "/api/v1/transactions",
        {
          type: "EXPENSE",
          accountId: conta.id,
          categoryId: cat.id,
          amountInCents: 700,
          note: "ALICEPRIV-NOTE consulta medica",
          isSharedExpense: false,
        },
        { idempotencyKey: randomUUID() },
      ),
    );
    expect(create.status).toBe(201);
    expect(await idemRows("ALICEPRIV-NOTE")).toBeGreaterThan(0);
    const del = await at(() =>
      call(
        alice,
        "POST",
        "/api/v1/family/delete",
        { confirmFamilyName: "Família Exclusiva Zeta" },
        {
          idempotencyKey: randomUUID(),
        },
      ),
    );
    expect(del.status).toBe(200);
    for (const needle of ["ALICEPRIV-NOTE", "Conta Alice Zeta", "Exclusiva Zeta", solo.family.id]) {
      expect(await idemRows(needle)).toBe(0);
    }
    const residue = await findResidue(["ALICEPRIV-NOTE", "Exclusiva Zeta", solo.family.id]);
    expect(Object.keys(residue).filter((k) => k.startsWith("idempotency_records"))).toEqual([]);
  });
});
