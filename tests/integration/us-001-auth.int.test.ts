import { PrismaAdapter } from "@auth/prisma-adapter";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { register } from "@/instrumentation";
import { lowercaseEmailAdapter } from "@/lib/auth/config";
import { endSession, findSessionUser } from "@/lib/auth/session";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { asUser, makeFamily } from "../support/factories";

const db = testDb();

beforeEach(async () => {
  await resetDb();
  vi.unstubAllEnvs();
  process.env.AUTH_DEV_LOGIN = "false";
});

const enableDevLogin = () => vi.stubEnv("AUTH_DEV_LOGIN", "true");

describe("US-001 Login de teste em desenvolvimento local (dev-login)", () => {
  it("Primeiro acesso sem família nem convite: cria User com nome, e-mail minúsculo e emailVerified, sem Member", async () => {
    enableDevLogin();
    const res = await call(null, "POST", "/api/dev/login", {
      email: "  Mariana@Exemplo.com ",
      name: "Mariana Silva",
    });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ email: "mariana@exemplo.com", name: "Mariana Silva" });

    const user = await db.user.findUnique({ where: { email: "mariana@exemplo.com" } });
    expect(user?.name).toBe("Mariana Silva");
    expect(user?.emailVerified).not.toBeNull();
    expect(await db.member.count({ where: { userId: user?.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: user?.id } })).toBe(1);
  });

  it("define o cookie de sessão do Auth.js (httpOnly, SameSite=Lax, 90 dias)", async () => {
    enableDevLogin();
    const res = await call(null, "POST", "/api/dev/login", { email: "lucas@exemplo.com" });
    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toMatch(/^authjs\.session-token=[\w-]{40,}/);
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain(`Max-Age=${60 * 60 * 24 * 90}`);
    expect(cookie).not.toContain("Secure"); // AUTH_URL é http em dev
    const user = await db.user.findUnique({ where: { email: "lucas@exemplo.com" } });
    expect(user?.name).toBe("lucas"); // parte local do e-mail quando não há nome
  });

  it("login repetido reaproveita o usuário e cria nova sessão", async () => {
    enableDevLogin();
    await call(null, "POST", "/api/dev/login", { email: "lucas@exemplo.com", name: "Lucas Silva" });
    await call(null, "POST", "/api/dev/login", { email: "LUCAS@exemplo.com" });
    expect(await db.user.count()).toBe(1);
    expect(await db.session.count()).toBe(2);
    expect((await db.user.findFirst())?.name).toBe("Lucas Silva");
  });

  it("(infra) com AUTH_DEV_LOGIN=false responde 404 de corpo vazio", async () => {
    const res = await call(null, "POST", "/api/dev/login", { email: "a@exemplo.com" });
    expect(res.status).toBe(404);
    expect(res.body).toBeNull();
    expect(await db.user.count()).toBe(0);
  });

  it("Login de teste indisponível em produção: com NODE_ENV=production responde 404", async () => {
    enableDevLogin();
    vi.stubEnv("NODE_ENV", "production");
    const res = await call(null, "POST", "/api/dev/login", { email: "a@exemplo.com" });
    expect(res.status).toBe(404);
    expect(await db.user.count()).toBe(0);
  });

  it("Login de teste indisponível em produção: a aplicação recusa subir com a flag ligada", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_DEV_LOGIN", "true");
    await expect(register()).rejects.toThrow("AUTH_DEV_LOGIN não pode estar ativo em produção");
    vi.stubEnv("AUTH_DEV_LOGIN", "false");
    await expect(register()).resolves.toBeUndefined();
  });

  it("(infra) Host fora de localhost é rejeitado com 403", async () => {
    enableDevLogin();
    const res = await call(
      null,
      "POST",
      "/api/dev/login",
      { email: "a@exemplo.com" },
      { host: "evil.com" },
    );
    expect(res.status).toBe(403);
    expect(await db.user.count()).toBe(0);
  });

  it("(infra) túnel: host de APP_PUBLIC_ORIGIN loga (cookie Secure via https); outro host segue 403", async () => {
    enableDevLogin();
    vi.stubEnv("APP_PUBLIC_ORIGIN", "https://fancy-queens-kick.loca.lt");
    const ok = await call(
      null,
      "POST",
      "/api/dev/login",
      { email: "a@exemplo.com" },
      { host: "fancy-queens-kick.loca.lt", headers: { "x-forwarded-proto": "https" } },
    );
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/^__Secure-authjs\.session-token=.*; Secure/);
    expect(await db.session.count()).toBe(1);
    const other = await call(
      null,
      "POST",
      "/api/dev/login",
      { email: "b@exemplo.com" },
      { host: "outro.loca.lt" },
    );
    expect(other.status).toBe(403);
    // produção continua bloqueando mesmo no host do túnel
    vi.stubEnv("NODE_ENV", "production");
    const prod = await call(
      null,
      "POST",
      "/api/dev/login",
      { email: "c@exemplo.com" },
      { host: "fancy-queens-kick.loca.lt" },
    );
    expect(prod.status).toBe(404);
  });

  it("(infra) endSession remove a sessão pelo cookie comum ou __Secure- (logout atrás de túnel)", async () => {
    enableDevLogin();
    for (const email of ["a@exemplo.com", "b@exemplo.com"]) {
      await call(null, "POST", "/api/dev/login", { email });
    }
    const [one, two] = await db.session.findMany({ orderBy: { expires: "asc" } });
    expect(await endSession(db, {})).toBe(0);
    expect(await endSession(db, { "authjs.session-token": one?.sessionToken as string })).toBe(1);
    expect(
      await endSession(db, { "__Secure-authjs.session-token": two?.sessionToken as string }),
    ).toBe(1);
    expect(await db.session.count()).toBe(0);
  });

  it("(infra) corpo inválido: 400 VALIDATION_ERROR sem criar usuário nem sessão", async () => {
    enableDevLogin();
    const res = await call(null, "POST", "/api/dev/login", { email: "lucas@" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    const extra = await call(null, "POST", "/api/dev/login", {
      email: "a@exemplo.com",
      admin: true,
    });
    expect(extra.status).toBe(400);
    expect(await db.user.count()).toBe(0);
    expect(await db.session.count()).toBe(0);
  });
});

describe("US-001 sessão: GET /api/v1/me", () => {
  it("sem sessão: 401 UNAUTHENTICATED", async () => {
    const res = await call(null, "GET", "/api/v1/me");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHENTICATED");
  });

  it("Primeiro acesso: usuário autenticado sem família tem membership nulo", async () => {
    const as = await asUser("mariana@exemplo.com", { name: "Mariana Silva" });
    const res = await call(as, "GET", "/api/v1/me");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      user: { id: as.userId, name: "Mariana Silva", email: "mariana@exemplo.com", image: null },
      membership: null,
    });
  });

  it("Acesso de membro que já tem família: devolve a membership", async () => {
    const fx = await makeFamily();
    const res = await call(fx.byName.Lucas?.as ?? null, "GET", "/api/v1/me");
    expect(res.body.membership).toEqual({
      memberId: fx.byName.Lucas?.memberId,
      familyId: fx.family.id,
      familyName: "Família Silva",
      role: "MEMBER",
    });
  });

  it("Sair do sistema: sessão removida do banco => 401", async () => {
    const as = await asUser("lucas@exemplo.com");
    expect((await call(as, "GET", "/api/v1/me")).status).toBe(200);
    await db.session.deleteMany({ where: { userId: as.userId } });
    expect((await call(as, "GET", "/api/v1/me")).status).toBe(401);
  });
});

describe("US-001 Sessão persistente: findSessionUser", () => {
  it("sessão expirada não autentica", async () => {
    const as = await asUser("lucas@exemplo.com");
    await db.session.updateMany({ data: { expires: new Date(Date.now() - 1000) } });
    expect((await call(as, "GET", "/api/v1/me")).status).toBe(401);
  });

  it("janela deslizante: renova a validade só depois de updateAge (24 h)", async () => {
    const base = new Date("2026-10-04T12:00:00Z");
    const as = await asUser("lucas@exemplo.com", { now: base });
    const token = as.cookie.split("=")[1] as string;
    const original = (await db.session.findUnique({ where: { sessionToken: token } }))
      ?.expires as Date;

    await findSessionUser(db, token, new Date(base.getTime() + 60 * 60 * 1000)); // +1 h: não renova
    expect((await db.session.findUnique({ where: { sessionToken: token } }))?.expires).toEqual(
      original,
    );

    const later = new Date(base.getTime() + 25 * 60 * 60 * 1000); // +25 h: renova
    await findSessionUser(db, token, later);
    const renewed = (await db.session.findUnique({ where: { sessionToken: token } }))
      ?.expires as Date;
    expect(renewed.getTime()).toBe(later.getTime() + 90 * 24 * 60 * 60 * 1000);
  });

  it("sem token ou token desconhecido: null", async () => {
    expect(await findSessionUser(db, null)).toBeNull();
    expect(await findSessionUser(db, "inexistente")).toBeNull();
  });
});

describe("US-001 Google: adaptador Auth.js com e-mail normalizado", () => {
  it("createUser grava e-mail em minúsculas e getUserByEmail ignora caixa", async () => {
    const adapter = lowercaseEmailAdapter(PrismaAdapter(db as never));
    const created = await (adapter.createUser as NonNullable<typeof adapter.createUser>)({
      id: "ignored",
      name: "Lucas",
      email: "Lucas@Exemplo.com",
      emailVerified: new Date(),
      image: "https://example.com/foto.png",
    });
    expect(created.email).toBe("lucas@exemplo.com");
    const found = await (adapter.getUserByEmail as NonNullable<typeof adapter.getUserByEmail>)(
      "LUCAS@EXEMPLO.COM",
    );
    expect(found?.id).toBe(created.id);
    expect(found?.image).toBe("https://example.com/foto.png");
  });

  it("Usuário cancela no Google / e-mail não verificado: nada é criado enquanto o signIn nega", async () => {
    // O callback `signIn` precede `createUser` (SDD-003 §1); aqui garantimos o estado vazio.
    expect(await db.user.count()).toBe(0);
    expect(await db.session.count()).toBe(0);
  });
});
