import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { asUser, makeFamily } from "../support/factories";

const db = testDb();
beforeEach(resetDb);
afterEach(() => vi.unstubAllEnvs());

describe("SDD-000 withApi: ordem das verificações", () => {
  it("1) CSRF: sem Origin ou com Origin de outro host -> 403 BAD_ORIGIN (antes da sessão)", async () => {
    const as = await asUser("mariana@exemplo.com");
    const a = await call(
      as,
      "POST",
      "/api/v1/families",
      { name: "Família Silva" },
      { origin: null },
    );
    expect(a.status).toBe(403);
    expect(a.body.error.code).toBe("BAD_ORIGIN");
    const b = await call(
      as,
      "POST",
      "/api/v1/families",
      { name: "Família Silva" },
      { origin: "http://evil.com" },
    );
    expect(b.body.error.code).toBe("BAD_ORIGIN");
    const c = await call(
      null,
      "POST",
      "/api/v1/families",
      { name: "Família Silva" },
      { origin: "http://evil.com" },
    );
    expect(c.body.error.code).toBe("BAD_ORIGIN");
    expect(await db.family.count()).toBe(0);
  });

  it("CSRF no túnel de teste: Origin de APP_PUBLIC_ORIGIN passa em dev, mas nunca em produção", async () => {
    const as = await asUser("mariana@exemplo.com");
    const tunnel = "https://fancy-queens-kick.loca.lt";
    const body = { name: "Família Silva" };
    vi.stubEnv("APP_PUBLIC_ORIGIN", ""); // .env.local do dev pode defini-la
    expect((await call(as, "POST", "/api/v1/families", body, { origin: tunnel })).status).toBe(403);
    vi.stubEnv("APP_PUBLIC_ORIGIN", tunnel);
    expect((await call(as, "POST", "/api/v1/families", body, { origin: tunnel })).status).toBe(201);
    const other = await call(as, "POST", "/api/v1/families", body, {
      origin: "https://outro.loca.lt",
    });
    expect(other.body.error.code).toBe("BAD_ORIGIN");
    vi.stubEnv("NODE_ENV", "production");
    const prod = await call(as, "POST", "/api/v1/families", body, { origin: tunnel });
    expect(prod.body.error.code).toBe("BAD_ORIGIN");
  });

  it("Content-Type diferente de JSON em mutação -> 403 BAD_ORIGIN", async () => {
    const as = await asUser("mariana@exemplo.com");
    const res = await call(as, "POST", "/api/v1/families", '{"name":"Família Silva"}', {
      contentType: "text/plain",
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("BAD_ORIGIN");
    expect(await db.family.count()).toBe(0);
  });

  it("2) sessão: sem sessão -> 401 antes de validar corpo", async () => {
    const res = await call(null, "POST", "/api/v1/families", { name: "x" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("3) família: usuário sem Member em rota de domínio -> 403 NO_FAMILY", async () => {
    const as = await asUser("mariana@exemplo.com");
    const res = await call(as, "GET", "/api/v1/family");
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("NO_FAMILY");
  });

  it("5) validação: corpo inválido -> 400 VALIDATION_ERROR com details; JSON quebrado -> INVALID_JSON", async () => {
    const as = await asUser("mariana@exemplo.com");
    const res = await call(as, "POST", "/api/v1/families", { name: "a" });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Informe um nome com pelo menos 2 caracteres",
      details: [{ path: "name", message: "Informe um nome com pelo menos 2 caracteres" }],
    });
    const broken = await call(as, "POST", "/api/v1/families", "{nope");
    expect(broken.status).toBe(400);
    expect(broken.body.error.code).toBe("INVALID_JSON");
  });

  it("(infra) .strict(): campos desconhecidos como familyId são rejeitados", async () => {
    const as = await asUser("mariana@exemplo.com");
    const res = await call(as, "POST", "/api/v1/families", {
      name: "Família Silva",
      familyId: randomUUID(),
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(await db.family.count()).toBe(0);
  });

  it("6) Idempotency-Key ausente ou inválida -> 400 IDEMPOTENCY_KEY_REQUIRED", async () => {
    const as = await asUser("mariana@exemplo.com");
    const none = await call(
      as,
      "POST",
      "/api/v1/families",
      { name: "Família Silva" },
      { idempotencyKey: null },
    );
    expect(none.status).toBe(400);
    expect(none.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    const bad = await call(
      as,
      "POST",
      "/api/v1/families",
      { name: "Família Silva" },
      { idempotencyKey: "abc" },
    );
    expect(bad.body.error.code).toBe("IDEMPOTENCY_KEY_REQUIRED");
    expect(await db.family.count()).toBe(0);
  });

  it("GET não exige Idempotency-Key nem Origin", async () => {
    const fx = await makeFamily();
    const res = await call(fx.byName.Mariana?.as ?? null, "GET", "/api/v1/family");
    expect(res.status).toBe(200);
  });
});

describe("ADR-009 idempotência", () => {
  it("mesma chave com corpo diferente -> 422 IDEMPOTENCY_KEY_REUSED", async () => {
    const as = await asUser("mariana@exemplo.com");
    const key = randomUUID();
    const first = await call(
      as,
      "POST",
      "/api/v1/families",
      { name: "Família Silva" },
      { idempotencyKey: key },
    );
    expect(first.status).toBe(201);
    const second = await call(
      as,
      "POST",
      "/api/v1/families",
      { name: "Outra" },
      { idempotencyKey: key },
    );
    expect(second.status).toBe(422);
    expect(second.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("repetição sequencial devolve a mesma resposta com Idempotent-Replay", async () => {
    const as = await asUser("mariana@exemplo.com");
    const key = randomUUID();
    const first = await call(
      as,
      "POST",
      "/api/v1/families",
      { name: "Família Silva" },
      { idempotencyKey: key },
    );
    const again = await call(
      as,
      "POST",
      "/api/v1/families",
      { name: "Família Silva" },
      { idempotencyKey: key },
    );
    expect(again.status).toBe(first.status);
    expect(again.body).toEqual(first.body);
    expect(again.headers.get("idempotent-replay")).toBe("true");
    expect(first.headers.get("idempotent-replay")).toBeNull();
    expect(await db.family.count()).toBe(1);
  });

  it("a chave é escopada por usuário", async () => {
    const key = randomUUID();
    const a = await asUser("mariana@exemplo.com");
    const b = await asUser("lucas@exemplo.com");
    expect(
      (await call(a, "POST", "/api/v1/families", { name: "Família A" }, { idempotencyKey: key }))
        .status,
    ).toBe(201);
    expect(
      (await call(b, "POST", "/api/v1/families", { name: "Família B" }, { idempotencyKey: key }))
        .status,
    ).toBe(201);
    expect(await db.family.count()).toBe(2);
  });

  it("erro de negócio não consome a chave (rollback): após corrigir, a mesma chave funciona", async () => {
    const as = await asUser("mariana@exemplo.com");
    const key = randomUUID();
    const bad = await call(as, "POST", "/api/v1/families", { name: "x" }, { idempotencyKey: key });
    expect(bad.status).toBe(400);
    const ok = await call(
      as,
      "POST",
      "/api/v1/families",
      { name: "Família Silva" },
      { idempotencyKey: key },
    );
    expect(ok.status).toBe(201);
  });
});
