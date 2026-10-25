import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { withClock } from "@/lib/clock";
import { ExportSchema } from "@/modules/privacidade/export-schema";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  asUser,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
} from "../support/factories";

// SEC-029 e SEC-032 (revisão de LGPD 2026-10-25, D-GES-46): exportação do ex-membro e famílias grandes.
const db = testDb();
const NOW = "2026-11-05T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
const lucas = () => fx.byName.Lucas?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const mariana = () => fx.byName.Mariana?.as as NonNullable<FamilyFixture["byName"][string]>["as"];
const exp = (who: ReturnType<typeof lucas> | null) =>
  at(() => call(who, "GET", "/api/v1/me/export"));

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily({ name: "Família Silva" });
});
afterEach(() => vi.unstubAllEnvs());

describe("SEC-029 ex-membro não recebe 'Só meu' de outra pessoa", () => {
  it("lançamento dividido cadastrado por ele e depois tornado 'Só meu' pela dona: fora do arquivo (valor e observação)", async () => {
    const nub = await makeAccount(fx, {
      name: "Nubank",
      owner: "Mariana",
      openingBalanceInCents: 500000,
    });
    const t = await makeTransaction(fx, {
      account: nub,
      category: "Supermercado",
      amountInCents: 4321,
      occurredOn: "2026-10-03",
      author: "Lucas",
      payer: "Mariana",
      shared: true,
    });
    const own = await makeTransaction(fx, {
      account: nub,
      category: "Supermercado",
      amountInCents: 1234,
      occurredOn: "2026-10-04",
      author: "Lucas",
      payer: "Lucas",
      shared: true,
    });
    const patch = await at(() =>
      call(mariana(), "PATCH", `/api/v1/transactions/${t.id}`, {
        version: 1,
        isSharedExpense: false,
        note: "ALICEPRIV-NOTE consulta medica",
      }),
    );
    expect(patch.status).toBe(200);
    // ainda ativo: o arquivo do Lucas não leva o "Só meu" da Mariana
    expect(JSON.stringify((await exp(lucas())).body)).not.toContain("ALICEPRIV");
    await db.member.update({
      where: { id: fx.byName.Lucas?.memberId as string },
      data: { removedAt: new Date("2026-10-20T10:00:00Z"), removalKind: "LEFT" },
    });
    const r = await exp(await asUser("lucas@exemplo.com"));
    expect(r.status).toBe(200);
    const file = ExportSchema.parse(r.body);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain("ALICEPRIV");
    expect(text).not.toContain("4321");
    expect(file.familiasAnteriores[0]?.lancamentos.map((x) => x.id)).toEqual([own.id]);
  });
});

describe("SEC-032 exportação de famílias grandes", () => {
  async function bulkInsert(n: number) {
    const nub = await makeAccount(fx, { name: "Nubank", owner: "Lucas", openingBalanceInCents: 0 });
    const seed = await makeTransaction(fx, {
      account: nub,
      category: "Supermercado",
      amountInCents: 100,
      occurredOn: "2026-10-03",
      author: "Lucas",
      payer: "Lucas",
      shared: true,
    });
    const cols = (
      await db.$queryRaw<Array<{ column_name: string }>>`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'transactions' AND table_schema = 'public' AND column_name <> 'id'`
    ).map((c) => `"${c.column_name}"`);
    const list = cols.join(", ");
    await db.$executeRawUnsafe(
      `INSERT INTO transactions (id, ${list}) SELECT gen_random_uuid(), ${list} FROM transactions, generate_series(1, ${n}) WHERE id = '${seed.id}'`,
    );
  }

  it("33 mil lançamentos (acima do limite de parâmetros do protocolo) exportam com 200 e completos", async () => {
    await bulkInsert(33_000);
    const r = await exp(lucas());
    expect(r.status).toBe(200);
    const file = ExportSchema.parse(r.body);
    expect(file.familiaAtual?.lancamentos.length).toBeGreaterThanOrEqual(33_001);
  }, 120_000);

  it("falha (413) não consome a cota: 4 tentativas seguidas continuam 413, nunca 429", async () => {
    vi.stubEnv("PRIVACY_EXPORT_MAX_BYTES", "200");
    for (let i = 0; i < 4; i++) expect((await exp(lucas())).status).toBe(413);
    vi.unstubAllEnvs();
    expect((await exp(lucas())).status).toBe(200);
  });
});
