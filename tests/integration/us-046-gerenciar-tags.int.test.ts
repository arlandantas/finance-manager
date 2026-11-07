import { beforeEach, describe, expect, it, vi } from "vitest";
import * as idempotency from "@/lib/api/idempotency";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  attachTags,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTag,
  makeTransaction,
} from "../support/factories";

// US-046: gerenciar tags (listar, renomear, mesclar, remover).
const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let acc: AccountFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;

const rename = (id: string, body: Record<string, unknown>, as = mariana()) =>
  call(as, "PATCH", `/api/v1/tags/${id}`, body);
const merge = (id: string, body: Record<string, unknown>, as = mariana(), key?: string) =>
  call(as, "POST", `/api/v1/tags/${id}/merge`, body, key ? { idempotencyKey: key } : {});
const remove = (id: string, body: Record<string, unknown>, as = mariana()) =>
  call(as, "POST", `/api/v1/tags/${id}/delete`, body);
const list = async (as = mariana()) =>
  (await call(as, "GET", "/api/v1/tags")).body.items as Array<{
    id: string;
    name: string;
    usageCount: number;
    version: number;
  }>;

async function spend(n: number, tags: string[], desc = "Gasto") {
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    const t = await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 1000 + i,
      occurredOn: "2026-10-05",
      description: `${desc} ${i}`,
      tags,
    });
    out.push(t.id);
  }
  return out;
}

/** Soma de verificação do ledger: hash das linhas de `transactions` + totais do Extrato. */
async function checksum() {
  const [r] = await db.$queryRaw<Array<{ h: string }>>`
    SELECT md5(string_agg(t::text, '|' ORDER BY id)) AS h FROM transactions t`;
  const totals = (await call(mariana(), "GET", "/api/v1/transactions?period=2026-10")).body.totals;
  return { h: r?.h, totals };
}

beforeEach(async () => {
  vi.restoreAllMocks();
  await resetDb();
  fx = await makeFamily();
  acc = await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 500000 });
});

describe("US-046 listar", () => {
  it("ordena por uso desc e nome asc; usageCount ignora excluídos", async () => {
    await spend(5, ["viagem"]);
    await spend(3, ["viajem"]);
    await makeTag(fx, "ferias");
    const del = await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 500,
      occurredOn: "2026-10-05",
      tags: ["viajem"],
      deleted: true,
    });
    expect(del.id).toBeTruthy();
    const items = await list();
    expect(items.map((t) => [t.name, t.usageCount])).toEqual([
      ["viagem", 5],
      ["viajem", 3],
      ["ferias", 0],
    ]);
  });
});

describe("US-046 renomear", () => {
  it("só caixa/acento atualiza name e mantém as ligações", async () => {
    const ids = await spend(2, ["viagem"]);
    const tag = (await list())[0];
    const res = await rename(tag?.id as string, { version: tag?.version, name: "Viágem" });
    expect(res.status).toBe(200);
    expect(res.body.tag).toMatchObject({ name: "Viágem", usageCount: 2, version: 2 });
    const row = await db.tag.findUniqueOrThrow({ where: { id: tag?.id as string } });
    expect(row.nameKey).toBe("viagem");
    expect(row.updatedByMemberId).toBe(fx.byName.Mariana?.memberId);
    const detail = await call(mariana(), "GET", `/api/v1/transactions/${ids[0]}`);
    expect(detail.body.transaction.tags.map((t: { name: string }) => t.name)).toEqual(["Viágem"]);
    expect(await db.familyEvent.count({ where: { type: "TAG_RENAMED" } })).toBe(1);
  });

  it("nome curto => 400 com a mensagem", async () => {
    const t = await makeTag(fx, "viagem");
    const res = await rename(t.id, { version: 1, name: "a" });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).toContain("A tag precisa ter entre 2 e 30 caracteres");
  });

  it("colisão => 409 TAG_NAME_EXISTS com mergeInto", async () => {
    const a = await makeTag(fx, "viajem");
    const b = await makeTag(fx, "Viagem");
    const res = await rename(a.id, { version: 1, name: "Viagem" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("TAG_NAME_EXISTS");
    expect(res.body.error.details).toEqual({ mergeIntoId: b.id, mergeIntoName: "Viagem" });
  });

  it("versão velha => 409 VERSION_CONFLICT citando Mariana", async () => {
    const t = await makeTag(fx, "viagem");
    await rename(t.id, { version: 1, name: "viagens" }, mariana());
    const res = await rename(t.id, { version: 1, name: "outra" }, lucas());
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("VERSION_CONFLICT");
    expect(res.body.error.message).toBe(
      "Esta tag foi alterada por Mariana. Recarregue para continuar.",
    );
  });

  it("MEMBER renomeia; tag de outra família => 404; body extra => 400", async () => {
    const t = await makeTag(fx, "viagem");
    expect((await rename(t.id, { version: 1, name: "viagens" }, lucas())).status).toBe(200);
    const other = await makeFamily({ uniqueEmails: true });
    const foreign = await makeTag(other, "alheia");
    expect((await rename(foreign.id, { version: 1, name: "minha" })).status).toBe(404);
    expect((await rename(t.id, { version: 2, name: "xx", extra: 1 })).status).toBe(400);
    expect(await db.tag.findUniqueOrThrow({ where: { id: foreign.id } })).toMatchObject({
      name: "alheia",
    });
  });
});

describe("US-046 mesclar", () => {
  it("leva as ligações, apaga a origem, registra o evento e não muda o ledger", async () => {
    await spend(5, ["viagem"]);
    await spend(3, ["viajem"]);
    const [viagem, viajem] = [await makeTag(fx, "viagem"), await makeTag(fx, "viajem")];
    const before = await checksum();
    const res = await merge(viajem.id, { version: viajem.version, intoId: viagem.id }, lucas());
    expect(res.status).toBe(200);
    expect(res.body.movedCount).toBe(3);
    expect(res.body.tag).toMatchObject({ name: "viagem", usageCount: 8 });
    expect(await db.tag.findUnique({ where: { id: viajem.id } })).toBeNull();
    expect(await db.transactionTag.count({ where: { tagId: viajem.id } })).toBe(0);
    const ev = await db.familyEvent.findFirstOrThrow({ where: { type: "TAG_MERGED" } });
    expect(ev.actorMemberId).toBe(fx.byName.Lucas?.memberId);
    expect(await checksum()).toEqual(before);
  });

  it("lançamento em comum não duplica (7 no destino)", async () => {
    const five = await spend(5, ["viagem"]);
    await spend(2, ["viajem"]);
    await attachTags(fx, five[0] as string, ["viajem"]);
    const [viagem, viajem] = [await makeTag(fx, "viagem"), await makeTag(fx, "viajem")];
    const res = await merge(viajem.id, { version: 1, intoId: viagem.id });
    expect(res.body.movedCount).toBe(2); // o em comum já estava no destino
    expect(res.body.tag.usageCount).toBe(7);
  });

  it("origem igual ao destino => 422; destino de outra família => 404", async () => {
    const a = await makeTag(fx, "viagem");
    const same = await merge(a.id, { version: 1, intoId: a.id });
    expect(same.status).toBe(422);
    expect(same.body.error.code).toBe("TAG_MERGE_SAME");
    const foreign = await makeTag(await makeFamily({ uniqueEmails: true }), "alheia");
    expect((await merge(a.id, { version: 1, intoId: foreign.id })).status).toBe(404);
  });

  it("falha injetada deixa tudo intacto; mesma chave = 1 efeito", async () => {
    await spend(3, ["viajem"]);
    const [viagem, viajem] = [await makeTag(fx, "viagem"), await makeTag(fx, "viajem")];
    vi.spyOn(idempotency, "saveIdempotentResponse").mockRejectedValueOnce(new Error("falha"));
    const bad = await merge(viajem.id, { version: 1, intoId: viagem.id });
    expect(bad.status).toBe(500);
    vi.restoreAllMocks();
    expect(await db.tag.count({ where: { id: viajem.id } })).toBe(1);
    expect(await db.transactionTag.count({ where: { tagId: viajem.id } })).toBe(3);
    expect(await db.familyEvent.count({ where: { type: "TAG_MERGED" } })).toBe(0);

    const key = crypto.randomUUID();
    const body = { version: 1, intoId: viagem.id };
    const r1 = await merge(viajem.id, body, mariana(), key);
    const r2 = await merge(viajem.id, body, mariana(), key);
    expect(r1.status).toBe(200);
    expect(r2.headers.get("Idempotent-Replay")).toBe("true");
    expect(await db.familyEvent.count({ where: { type: "TAG_MERGED" } })).toBe(1);
  });

  it("merge x criação de lançamento com a tag de origem nunca deixa órfã", async () => {
    await spend(2, ["viajem"]);
    const [viagem, viajem] = [await makeTag(fx, "viagem"), await makeTag(fx, "viajem")];
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Supermercado" },
    });
    const post = () =>
      withClock(NOW, () =>
        call(mariana(), "POST", "/api/v1/transactions", {
          type: "EXPENSE",
          accountId: acc.id,
          categoryId: cat.id,
          amountInCents: 9000,
          description: "Concorrente",
          tags: ["viajem"],
        }),
      );
    const [m, p] = await Promise.all([
      merge(viajem.id, { version: 1, intoId: viagem.id }),
      post(),
      post(),
    ]);
    expect(m.status).toBe(200);
    expect(p.status).toBe(201);
    const orphans = await db.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n FROM transaction_tags tt
      LEFT JOIN tags g ON g.id = tt."tagId" WHERE g.id IS NULL`;
    expect(orphans[0]?.n).toBe(0);
  });

  it("merge A->B x merge B->A não trava (deadlock)", async () => {
    const a = await makeTag(fx, "alfa");
    const b = await makeTag(fx, "beta");
    const [r1, r2] = await Promise.all([
      merge(a.id, { version: 1, intoId: b.id }),
      merge(b.id, { version: 1, intoId: a.id }),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 404]);
  });
});

describe("US-046 remover", () => {
  it("mantém os lançamentos sem a tag e não muda o ledger", async () => {
    await spend(5, ["viagem"]);
    const t = await makeTag(fx, "viagem");
    const before = await checksum();
    const res = await remove(t.id, { version: 1 }, lucas());
    expect(res.status).toBe(200);
    expect(res.body.removedFromCount).toBe(5);
    expect(await db.tag.count({ where: { id: t.id } })).toBe(0);
    expect(await db.transactionTag.count()).toBe(0);
    expect(await db.familyEvent.count({ where: { type: "TAG_DELETED" } })).toBe(1);
    expect(await checksum()).toEqual(before);
    expect(await list()).toEqual([]);
  });

  it("versão velha => 409; outra família => 404", async () => {
    const t = await makeTag(fx, "viagem");
    expect((await remove(t.id, { version: 9 })).status).toBe(409);
    const foreign = await makeTag(await makeFamily({ uniqueEmails: true }), "alheia");
    expect((await remove(foreign.id, { version: 1 })).status).toBe(404);
  });
});
