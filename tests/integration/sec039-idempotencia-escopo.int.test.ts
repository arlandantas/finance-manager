import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";
import { findResidue } from "../support/pii";

// SEC-039 (reteste final 2026-10-25, D-GES-48): a limpeza de idempotency_records ao excluir conta/família não pode
// procurar o nome digitado em TODAS as famílias. Alcance por colunas próprias (userId dos co-membros) e UUIDs.
const db = testDb();
const NOW = "2026-11-05T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
type Who = NonNullable<FamilyFixture["byName"][string]>["as"];

const putRow = (userId: string, body: Record<string, unknown>) =>
  db.$executeRaw`INSERT INTO idempotency_records (id, "userId", key, method, path, "requestHash", "responseStatus", "responseBody", "createdAt")
    VALUES (gen_random_uuid(), ${userId}::uuid, ${randomUUID()}, 'POST', '/api/v1/x', 'h', 201, ${JSON.stringify(body)}::jsonb, now())`;
const countFor = async (userId: string) =>
  Number(
    (
      await db.$queryRaw<
        Array<{ n: bigint }>
      >`SELECT count(*) AS n FROM idempotency_records WHERE "userId" = ${userId}::uuid`
    )[0]?.n ?? 0,
  );

let fx: FamilyFixture;
let other: FamilyFixture;
beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({
    name: "Família Silva",
    members: [
      { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" },
      { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
    ],
  });
  other = await makeFamily({
    name: "Outra Casa",
    members: [{ email: "zoe@exemplo.com", name: "Zoe Outra", role: "ADMIN" }],
  });
});

describe("SEC-039 exclusão de conta", () => {
  it("outra família com nome parecido NÃO perde registros; o resíduo do titular continua zerado", async () => {
    const lucas = fx.byName.Lucas?.as as Who;
    const mariana = fx.byName.Mariana?.as as Who;
    const zoe = other.byName.Zoe?.as as Who;
    // da outra família: o texto contém o nome do titular dentro de outra palavra ("Lucas Silvana")
    await putRow(zoe.userId, { note: "Almoço com Lucas Silvana e a banana", n: 1 });
    await putRow(zoe.userId, { note: "lucas silva (xará de outra família)", n: 2 });
    // da família do titular: cita o nome, deve sumir
    await putRow(mariana.userId, { paidBy: "Lucas Silva", n: 3 });
    const r = await at(() =>
      call(lucas, "POST", "/api/v1/me/delete-account", {
        confirmEmail: lucas.email,
        acknowledgeSettlement: true,
      }),
    );
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(await countFor(zoe.userId)).toBe(2);
    expect(await countFor(mariana.userId)).toBe(0);
    const residue = await findResidue(["Lucas Silva", "lucas@exemplo.com"]);
    expect(Object.keys(residue).filter((k) => k.startsWith("idempotency_records"))).toEqual([
      "idempotency_records.responseBody",
    ]); // só as 2 linhas da outra família, que não são do titular
    expect(residue["idempotency_records.responseBody"]).toBe(2);
  });

  it("um UUID do titular em linha de qualquer usuário ainda é apagado", async () => {
    const lucas = fx.byName.Lucas?.as as Who;
    const zoe = other.byName.Zoe?.as as Who;
    await putRow(zoe.userId, { memberId: fx.byName.Lucas?.memberId });
    const r = await at(() =>
      call(lucas, "POST", "/api/v1/me/delete-account", {
        confirmEmail: lucas.email,
        acknowledgeSettlement: true,
      }),
    );
    expect(r.status).toBe(200);
    expect(await countFor(zoe.userId)).toBe(0);
  });
});

describe("SEC-039 exclusão de família", () => {
  it("outra família cujo texto contém o nome da excluída (ou trechos comuns) NÃO perde registros", async () => {
    const zoe = other.byName.Zoe?.as as Who;
    const solo = await makeFamily({
      name: "Casa",
      members: [{ email: "alice@exemplo.com", name: "Alice Solo", role: "ADMIN" }],
    });
    const alice = solo.byName.Alice?.as as Who;
    await putRow(zoe.userId, { note: "Casa de praia, família, conta, id", n: 1 });
    await putRow(alice.userId, { note: "ALICEPRIV", n: 2 });
    const del = await at(() =>
      call(
        alice,
        "POST",
        "/api/v1/family/delete",
        { confirmFamilyName: "Casa" },
        { idempotencyKey: randomUUID() },
      ),
    );
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    expect(await countFor(zoe.userId)).toBe(1);
    // a única linha que resta da Alice é a resposta da própria exclusão (sem PII); a antiga some
    const left = await findResidue(["ALICEPRIV"]);
    expect(Object.keys(left).filter((k) => k.startsWith("idempotency_records"))).toEqual([]);
  });
});
