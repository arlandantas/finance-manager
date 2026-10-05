import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { familiaRepo } from "@/modules/familia/repo";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { asUser, makeFamily } from "../support/factories";

const db = testDb();
beforeEach(async () => {
  await resetDb();
  vi.restoreAllMocks();
});

describe("US-002 Criar família com sucesso", () => {
  it("POST /families -> 201, ADMIN, 8+3 categorias exatas, regra EQUAL e padrões da família", async () => {
    const as = await asUser("mariana@exemplo.com", { name: "Mariana Silva" });
    const res = await call(as, "POST", "/api/v1/families", { name: "Família Silva" });
    expect(res.status).toBe(201);
    expect(res.body.family.name).toBe("Família Silva");
    expect(res.body.member.role).toBe("ADMIN");

    const family = await db.family.findUniqueOrThrow({ where: { id: res.body.family.id } });
    expect(family).toMatchObject({ timezone: "America/Sao_Paulo", currency: "BRL", cutDay: 1 });

    const member = await db.member.findFirstOrThrow({
      where: { userId: as.userId, removedAt: null },
    });
    expect(member).toMatchObject({ id: res.body.member.id, familyId: family.id, role: "ADMIN" });

    const cats = await db.category.findMany({
      where: { familyId: family.id },
      orderBy: { sortOrder: "asc" },
    });
    expect(cats.filter((c) => c.kind === "EXPENSE").map((c) => c.name)).toEqual([
      "Supermercado",
      "Moradia",
      "Contas e serviços",
      "Transporte",
      "Saúde",
      "Educação",
      "Lazer e restaurantes",
      "Outros",
    ]);
    expect(cats.filter((c) => c.kind === "INCOME").map((c) => c.name)).toEqual([
      "Salário",
      "Rendimentos",
      "Outras receitas",
    ]);
    expect(cats.every((c) => c.icon.length > 0 && c.archivedAt === null)).toBe(true);

    const rules = await db.splitRuleVersion.findMany({ where: { familyId: family.id } });
    expect(rules).toHaveLength(1);
    expect(rules[0]).toMatchObject({ kind: "EQUAL", createdByMemberId: member.id });
    expect(rules[0]?.effectiveFrom.toISOString().slice(0, 10)).toBe("1970-01-01");
  });

  it("GET /family devolve a família, o membro atual e a lista de membros", async () => {
    const as = await asUser("mariana@exemplo.com", { name: "Mariana Silva" });
    await call(as, "POST", "/api/v1/families", { name: "Família Silva" });
    const res = await call(as, "GET", "/api/v1/family");
    expect(res.status).toBe(200);
    expect(res.body.family.name).toBe("Família Silva");
    expect(res.body.currentRole).toBe("ADMIN");
    expect(res.body.members).toHaveLength(1);
    expect(res.body.members[0]).toMatchObject({
      name: "Mariana Silva",
      email: "mariana@exemplo.com",
      role: "ADMIN",
    });
    expect(res.body.pendingInvitations).toEqual([]);
  });
});

describe("US-002 Nome inválido", () => {
  it.each(["", " a ", "   "])("%j -> 400 e nenhuma família criada", async (name) => {
    const as = await asUser("mariana@exemplo.com");
    const res = await call(as, "POST", "/api/v1/families", { name });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Informe um nome com pelo menos 2 caracteres");
    expect(await db.family.count()).toBe(0);
    expect(await db.member.count()).toBe(0);
  });
});

describe("US-002 Duplo clique não duplica", () => {
  it("2 chamadas simultâneas com a mesma chave -> 1 família, mesma resposta", async () => {
    const as = await asUser("mariana@exemplo.com");
    const key = randomUUID();
    const [a, b] = await Promise.all([
      call(as, "POST", "/api/v1/families", { name: "Família Silva" }, { idempotencyKey: key }),
      call(as, "POST", "/api/v1/families", { name: "Família Silva" }, { idempotencyKey: key }),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect(a.body).toEqual(b.body);
    expect([a, b].filter((r) => r.headers.get("idempotent-replay") === "true")).toHaveLength(1);
    expect(await db.family.count()).toBe(1);
    expect(await db.member.count()).toBe(1);
  });

  it("2 chamadas simultâneas com chaves diferentes -> 1×201 e 1×409 ALREADY_IN_FAMILY", async () => {
    const as = await asUser("mariana@exemplo.com");
    const results = await Promise.all([
      call(as, "POST", "/api/v1/families", { name: "Família Silva" }),
      call(as, "POST", "/api/v1/families", { name: "Família Silva" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    const loser = results.find((r) => r.status === 409);
    expect(loser?.body.error).toMatchObject({
      code: "ALREADY_IN_FAMILY",
      message: "Você já faz parte de uma família.",
    });
    expect(await db.family.count()).toBe(1);
    expect(await db.category.count()).toBe(11);
  });
});

describe("US-002 Quem já tem família não refaz o onboarding", () => {
  it("POST /families por quem já é membro -> 409 ALREADY_IN_FAMILY", async () => {
    const fx = await makeFamily();
    const res = await call(fx.byName.Lucas?.as ?? null, "POST", "/api/v1/families", {
      name: "Outra Família",
    });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_IN_FAMILY");
    expect(await db.family.count()).toBe(1);
  });
});

describe("US-002 (infra) Atomicidade", () => {
  it("falha na criação das categorias desfaz família e membro", async () => {
    const as = await asUser("mariana@exemplo.com");
    vi.spyOn(familiaRepo, "insertDefaultCategories").mockRejectedValueOnce(
      new Error("falha injetada"),
    );
    const res = await call(as, "POST", "/api/v1/families", { name: "Família Silva" });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(res.body.error.message).not.toContain("falha injetada");
    expect(await db.family.count()).toBe(0);
    expect(await db.member.count()).toBe(0);
    expect(await db.category.count()).toBe(0);
    expect(await db.splitRuleVersion.count()).toBe(0);
    // sem registro de idempotência: a repetição reexecuta
    expect(await db.idempotencyRecord.count()).toBe(0);
  });
});

describe("US-002 (infra) Isolamento entre famílias", () => {
  it("GET /family de cada usuário mostra apenas a própria família", async () => {
    const a = await makeFamily({ name: "Família A", uniqueEmails: true });
    const b = await makeFamily({ name: "Família B", uniqueEmails: true });
    const ra = await call(a.members[0]?.as ?? null, "GET", "/api/v1/family");
    const rb = await call(b.members[0]?.as ?? null, "GET", "/api/v1/family");
    expect(ra.body.family.id).toBe(a.family.id);
    expect(rb.body.family.id).toBe(b.family.id);
    expect(rb.body.members.map((m: { email: string }) => m.email)).not.toContain(
      a.members[0]?.email,
    );
  });
});
