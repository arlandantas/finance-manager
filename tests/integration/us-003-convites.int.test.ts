import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClock, withClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { acceptPendingInvitation, previewInvitation } from "@/modules/familia/invitations/service";
import { resolveAppEntry } from "@/modules/familia/service";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { asUser, type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
const NOW = "2026-10-04T15:00:00Z";
let mailer: InMemoryMailer;
let fx: FamilyFixture;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucasMember = () => fx.byName.Lucas?.as ?? null;

beforeEach(async () => {
  await resetDb();
  mailer = new InMemoryMailer();
  setMailer(mailer);
  // Mariana (ADMIN) convida alguém que ainda não é membro: família só com ela.
  fx = await makeFamily({
    members: [{ email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" }],
  });
});
afterEach(() => setMailer(null));

const invite = (body: Record<string, unknown>, as = mariana(), opts = {}) =>
  withClock(NOW, () => call(as, "POST", "/api/v1/invitations", body, opts));

afterEach(() => vi.unstubAllEnvs());

it("link do convite usa a origem de dev da requisição (IP da LAN) em dev e APP_URL em produção", async () => {
  vi.stubEnv("APP_PUBLIC_ORIGIN", "");
  const lan = "http://192.168.1.81:3100";
  const res = await invite({ email: "lucas@exemplo.com", role: "MEMBER" }, mariana(), {
    origin: lan,
  });
  expect(res.status).toBe(201);
  expect(res.body.inviteUrl.startsWith(`${lan}/convite/`)).toBe(true);
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AUTH_URL", lan); // em produção o Origin só passa por AUTH_URL; o link vem de APP_URL
  const prod = await invite({ email: "ana@exemplo.com", role: "MEMBER" }, mariana(), {
    origin: lan,
  });
  expect(prod.body.inviteUrl.startsWith("http://localhost:3100/convite/")).toBe(true);
});

const tokenOf = (inviteUrl: string) => inviteUrl.split("/convite/")[1] as string;

async function lucasUser(email = "Lucas@Exemplo.com") {
  const as = await asUser(email, { name: "Lucas Silva" });
  const user = await db.user.findUniqueOrThrow({ where: { id: as.userId } });
  return { as, user };
}

const accept = (user: { id: string; email: string; emailVerified: Date | null }, at = NOW) =>
  withClock(at, () => acceptPendingInvitation(user, getClock()));

describe("US-003 Enviar convite com sucesso", () => {
  it("201: papel padrão MEMBER, validade 7 dias, token só em hash, e-mail com o link", async () => {
    const res = await invite({ email: "lucas@exemplo.com" });
    expect(res.status).toBe(201);
    expect(res.body.emailStatus).toBe("SENT");
    expect(res.body.invitation).toMatchObject({
      email: "lucas@exemplo.com",
      role: "MEMBER",
      status: "PENDING",
      isExpired: false,
      invitedBy: { name: "Mariana Silva" },
    });
    expect(res.body.invitation.expiresAt).toBe("2026-10-11T15:00:00.000Z");
    expect(res.body.inviteUrl).toMatch(/^http:\/\/localhost:3100\/convite\/[A-Za-z0-9_-]{40,}$/);

    const row = await db.invitation.findFirstOrThrow();
    const token = tokenOf(res.body.inviteUrl);
    expect(row.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.tokenHash).not.toContain(token);
    expect(row.emailStatus).toBe("SENT");
    expect(row.expiresAt.toISOString()).toBe("2026-10-11T15:00:00.000Z");

    expect(mailer.sent).toHaveLength(1);
    const mail = mailer.sent[0];
    expect(mail?.to).toBe("lucas@exemplo.com");
    expect(mail?.subject).toBe(
      "Mariana Silva convidou você para a Família Silva no Finance Manager",
    );
    expect(mail?.text).toContain(res.body.inviteUrl);
    expect(mail?.text).toContain(
      "O convite vale por 7 dias e só funciona com a conta Google deste e-mail (lucas@exemplo.com).",
    );
    expect(mail?.html).toContain(res.body.inviteUrl);
  });

  it("e-mail é normalizado (trim + minúsculas) e papel ADMIN pode ser escolhido", async () => {
    const res = await invite({ email: "  Lucas@Exemplo.COM ", role: "ADMIN" });
    expect(res.status).toBe(201);
    expect(res.body.invitation).toMatchObject({ email: "lucas@exemplo.com", role: "ADMIN" });
  });

  it("aparece em GET /invitations e em GET /family (só para ADMIN); o link não é reexibido", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const list = await call(mariana(), "GET", "/api/v1/invitations");
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(1);
    expect(JSON.stringify(list.body)).not.toContain(tokenOf(created.body.inviteUrl));
    const family = await withClock(NOW, () => call(mariana(), "GET", "/api/v1/family"));
    expect(family.body.pendingInvitations).toHaveLength(1);
  });
});

describe("US-003 Convidado entra e é vinculado automaticamente", () => {
  it("login com Lucas@Exemplo.com: Member com o papel do convite e convite aceito", async () => {
    await invite({ email: "lucas@exemplo.com", role: "ADMIN" });
    const { user } = await lucasUser("Lucas@Exemplo.com");
    expect(user.email).toBe("lucas@exemplo.com");
    const result = await accept(user);
    expect(result).toEqual({ status: "JOINED", familyName: "Família Silva" });
    const member = await db.member.findFirstOrThrow({
      where: { userId: user.id, removedAt: null },
    });
    expect(member).toMatchObject({ familyId: fx.family.id, role: "ADMIN" });
    const inv = await db.invitation.findFirstOrThrow();
    expect(inv).toMatchObject({ status: "ACCEPTED", acceptedByUserId: user.id });
    expect(inv.acceptedAt).not.toBeNull();
    // idempotente: segunda chamada não faz nada
    expect(await accept(user)).toEqual({ status: "NONE" });
    expect(await db.member.count({ where: { userId: user.id } })).toBe(1);
  });

  it("o gate do app (resolveAppEntry) vincula e manda para /?joined=1", async () => {
    await invite({ email: "lucas@exemplo.com" });
    const { user } = await lucasUser();
    const entry = await withClock(NOW, () =>
      resolveAppEntry({
        userId: user.id,
        email: user.email,
        name: user.name,
        image: null,
        emailVerified: user.emailVerified,
      }),
    );
    expect(entry).toEqual({ redirectTo: "/?joined=1", membership: null });
    expect(await db.member.count({ where: { userId: user.id } })).toBe(1);
  });

  it("duas tentativas simultâneas: um único vínculo", async () => {
    await invite({ email: "lucas@exemplo.com" });
    const { user } = await lucasUser();
    const results = await Promise.all([accept(user), accept(user)]);
    expect(results.filter((r) => r.status === "JOINED")).toHaveLength(1);
    expect(await db.member.count({ where: { userId: user.id } })).toBe(1);
  });

  it("e-mail não verificado não vincula", async () => {
    await invite({ email: "lucas@exemplo.com" });
    const { user } = await lucasUser();
    expect(await accept({ ...user, emailVerified: null })).toEqual({ status: "NONE" });
    expect(await db.member.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe("US-003 Convite aberto com outra conta Google", () => {
  it("previewInvitation => WRONG_EMAIL e ninguém é vinculado", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const other = await asUser("outra@exemplo.com");
    const preview = await withClock(NOW, () =>
      previewInvitation(tokenOf(created.body.inviteUrl), { email: other.email }, getClock()),
    );
    expect(preview).toMatchObject({
      state: "WRONG_EMAIL",
      email: "lucas@exemplo.com",
      familyName: "Família Silva",
    });
    const user = await db.user.findUniqueOrThrow({ where: { id: other.userId } });
    expect(await accept(user)).toEqual({ status: "NONE" });
    expect(await db.member.count({ where: { userId: other.userId } })).toBe(0);
    expect((await db.invitation.findFirstOrThrow()).status).toBe("PENDING");
  });

  it("estados do preview: sem sessão, e-mail igual, token inválido, aceito", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const token = tokenOf(created.body.inviteUrl);
    const at = (session: { email: string } | null, t = token) =>
      withClock(NOW, () => previewInvitation(t, session, getClock()));
    expect(await at(null)).toMatchObject({ state: "NEEDS_LOGIN", inviterName: "Mariana Silva" });
    expect(await at({ email: "LUCAS@exemplo.com" })).toMatchObject({ state: "READY" });
    expect(await at(null, "token-que-nao-existe")).toEqual({ state: "INVALID" });
    const { user } = await lucasUser();
    await accept(user);
    expect(await at({ email: "lucas@exemplo.com" })).toEqual({ state: "ACCEPTED" });
  });
});

describe("US-003 E-mail inválido, já membro e duplicado", () => {
  it("'lucas@': 400 'Informe um e-mail válido' e nenhum convite", async () => {
    const res = await invite({ email: "lucas@" });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toBe("Informe um e-mail válido");
    expect(await db.invitation.count()).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("e-mail de quem já é membro: 409 DUPLICATE_MEMBER", async () => {
    const res = await invite({ email: "Mariana@exemplo.com" });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "DUPLICATE_MEMBER",
      message: "Esta pessoa já faz parte da família",
    });
    expect(await db.invitation.count()).toBe(0);
  });

  it("convite pendente para o mesmo e-mail: 409 DUPLICATE_INVITATION", async () => {
    await invite({ email: "lucas@exemplo.com" });
    const dup = await invite({ email: "LUCAS@exemplo.com" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({
      code: "DUPLICATE_INVITATION",
      message: "Já existe um convite pendente para este e-mail",
    });
    expect(await db.invitation.count()).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });

  it("corrida: 2 criações simultâneas (chaves diferentes) => 1×201 e 1×409", async () => {
    const results = await Promise.all([
      invite({ email: "lucas@exemplo.com" }),
      invite({ email: "lucas@exemplo.com" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.invitation.count()).toBe(1);
    expect(mailer.sent).toHaveLength(1);
  });
});

describe("US-003 Cancelar convite", () => {
  it("cancela, não cancela de novo, e o convidado cai no onboarding sem aviso", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const id = created.body.invitation.id;
    const ok = await call(mariana(), "POST", `/api/v1/invitations/${id}/cancel`, {});
    expect(ok.status).toBe(200);
    expect(ok.body.invitation.status).toBe("CANCELED");
    const again = await call(mariana(), "POST", `/api/v1/invitations/${id}/cancel`, {});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("INVITATION_NOT_PENDING");
    expect((await call(mariana(), "GET", "/api/v1/invitations")).body.items).toHaveLength(0);

    const { user } = await lucasUser();
    expect(await accept(user)).toEqual({ status: "NONE" });
    const preview = await withClock(NOW, () =>
      previewInvitation(tokenOf(created.body.inviteUrl), null, getClock()),
    );
    expect(preview).toEqual({ state: "INVALID" });
  });

  it("id inexistente ou malformado: 404", async () => {
    expect(
      (await call(mariana(), "POST", `/api/v1/invitations/${randomUUID()}/cancel`, {})).status,
    ).toBe(404);
    expect((await call(mariana(), "POST", "/api/v1/invitations/xyz/cancel", {})).status).toBe(404);
  });
});

describe("US-003 Convite expirado", () => {
  it("após 7 dias + 1 s: sem vínculo e aviso de expirado; no instante exato também expira", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const { user } = await lucasUser();
    expect(await accept(user, "2026-10-11T15:00:00Z")).toEqual({ status: "EXPIRED" });
    expect(await accept(user, "2026-10-11T15:00:01Z")).toEqual({ status: "EXPIRED" });
    expect(await db.member.count({ where: { userId: user.id } })).toBe(0);
    const preview = await withClock("2026-10-11T15:00:01Z", () =>
      previewInvitation(tokenOf(created.body.inviteUrl), null, getClock()),
    );
    expect(preview).toEqual({ state: "EXPIRED" });
    // um segundo antes do vencimento ainda vale
    expect((await accept(user, "2026-10-11T14:59:59Z")).status).toBe("JOINED");
  });

  it("reconvite após vencer: o antigo vira EXPIRED e o novo é criado", async () => {
    await invite({ email: "lucas@exemplo.com" });
    const later = await withClock("2026-10-12T15:00:00Z", () =>
      call(mariana(), "POST", "/api/v1/invitations", { email: "lucas@exemplo.com" }),
    );
    expect(later.status).toBe(201);
    const rows = await db.invitation.findMany({ orderBy: { createdAt: "asc" } });
    expect(rows.map((r) => r.status)).toEqual(["EXPIRED", "PENDING"]);
  });
});

describe("US-003 Membro comum não convida", () => {
  it("matriz de permissão: MEMBER => 403; ADMIN => sucesso; sem sessão => 401", async () => {
    const fam = await makeFamily({ name: "Família Souza", uniqueEmails: true });
    const admin = fam.members[0]?.as ?? null;
    const member = fam.members[1]?.as ?? null;
    const created = await invite({ email: "novo@exemplo.com" }, admin);
    expect(created.status).toBe(201);
    const id = created.body.invitation.id;
    expect((await invite({ email: "x@exemplo.com" }, member)).status).toBe(403);
    expect((await call(member, "GET", "/api/v1/invitations")).status).toBe(403);
    expect((await call(member, "POST", `/api/v1/invitations/${id}/cancel`, {})).status).toBe(403);
    expect((await call(admin, "GET", "/api/v1/invitations")).status).toBe(200);
    expect((await call(null, "GET", "/api/v1/invitations")).status).toBe(401);
    expect((await invite({ email: "x@exemplo.com" }, null)).status).toBe(401);
    // o membro comum não vê convites pendentes na tela Família
    const fam2 = await call(member, "GET", "/api/v1/family");
    expect(fam2.body.pendingInvitations).toEqual([]);
    expect(fam2.body.currentRole).toBe("MEMBER");
    void lucasMember;
  });
});

describe("US-003 (infra) Falha no e-mail e idempotência", () => {
  it("MailPort que lança: 201 com emailStatus FAILED e convite persistido", async () => {
    mailer.failWith = new Error("SMTP fora do ar");
    const res = await invite({ email: "lucas@exemplo.com" });
    expect(res.status).toBe(201);
    expect(res.body.emailStatus).toBe("FAILED");
    expect(res.body.inviteUrl).toContain("/convite/");
    const row = await db.invitation.findFirstOrThrow();
    expect(row.emailStatus).toBe("FAILED");
    expect(row.status).toBe("PENDING");
  });

  it("reenvio com a mesma chave: 1 e-mail, mesma resposta (inclui o emailStatus final)", async () => {
    const key = randomUUID();
    mailer.failWith = new Error("SMTP fora do ar");
    const first = await invite({ email: "lucas@exemplo.com" }, mariana(), { idempotencyKey: key });
    mailer.failWith = null;
    const replay = await invite({ email: "lucas@exemplo.com" }, mariana(), { idempotencyKey: key });
    expect(replay.status).toBe(201);
    expect(replay.body).toEqual(first.body);
    expect(replay.body.emailStatus).toBe("FAILED");
    expect(replay.headers.get("idempotent-replay")).toBe("true");
    expect(await db.invitation.count()).toBe(1);
    expect(mailer.sent).toHaveLength(0);
  });
});

describe("US-003 (infra) Isolamento", () => {
  it("Admin da Família B não vê nem cancela convites da Família A", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const other = await makeFamily({ name: "Família Souza", uniqueEmails: true });
    const adminB = other.members[0]?.as ?? null;
    expect((await call(adminB, "GET", "/api/v1/invitations")).body.items).toEqual([]);
    const cancel = await call(
      adminB,
      "POST",
      `/api/v1/invitations/${created.body.invitation.id}/cancel`,
      {},
    );
    expect(cancel.status).toBe(404);
    expect((await db.invitation.findFirstOrThrow()).status).toBe("PENDING");
    // convite de A para o mesmo e-mail em outra família não conflita
    const sameEmail = await invite({ email: "lucas@exemplo.com" }, adminB);
    expect(sameEmail.status).toBe(201);
  });
});
