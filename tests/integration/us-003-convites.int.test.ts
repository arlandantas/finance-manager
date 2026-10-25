import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getClock, withClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { previewInvitation } from "@/modules/familia/invitations/service";
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

type Who = Awaited<ReturnType<typeof lucasUser>>["as"];
const accept = (as: Who | null, id: string, body: Record<string, unknown> = {}, at = NOW) =>
  withClock(at, () => call(as, "POST", `/api/v1/me/invitations/${id}/accept`, body));
const decline = (as: Who | null, id: string, at = NOW) =>
  withClock(at, () => call(as, "POST", `/api/v1/me/invitations/${id}/decline`, {}));
const myList = (as: Who | null, at = NOW) =>
  withClock(at, () => call(as, "GET", "/api/v1/me/invitations"));
const entryOf = (
  user: { id: string; email: string; name: string | null; emailVerified: Date | null },
  at = NOW,
) =>
  withClock(at, () =>
    resolveAppEntry({
      userId: user.id,
      email: user.email,
      name: user.name,
      image: null,
      emailVerified: user.emailVerified,
    }),
  );

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

describe("SEC-004 Convidado precisa aceitar (sem vínculo automático)", () => {
  it("reprodução do relatório: login sem família + convite => gate manda a /convites e NÃO cria Member", async () => {
    await invite({ email: "lucas@exemplo.com", role: "ADMIN" });
    const { user, as } = await lucasUser("Lucas@Exemplo.com");
    expect(user.email).toBe("lucas@exemplo.com");
    expect(await entryOf(user)).toEqual({ redirectTo: "/convites", membership: null });
    expect(await db.member.count({ where: { userId: user.id } })).toBe(0);
    const me = await call(as, "GET", "/api/v1/me");
    expect(me.body.membership).toBeNull();
    // só no aceite
    const inv = await db.invitation.findFirstOrThrow();
    const res = await accept(as, inv.id);
    expect(res.status).toBe(200);
    expect(res.body.membership).toEqual({
      familyId: fx.family.id,
      familyName: "Família Silva",
      role: "ADMIN",
    });
    const member = await db.member.findFirstOrThrow({
      where: { userId: user.id, removedAt: null },
    });
    expect(member).toMatchObject({ familyId: fx.family.id, role: "ADMIN" });
    expect(await db.invitation.findFirstOrThrow()).toMatchObject({
      status: "ACCEPTED",
      acceptedByUserId: user.id,
    });
    const ev = await db.familyEvent.findFirstOrThrow({ where: { type: "MEMBER_JOINED" } });
    expect(ev).toMatchObject({ actorMemberId: member.id });
    expect(ev.changes).toEqual({ invitationId: inv.id, role: "ADMIN" });
  });

  it("GET do link /convite/[token] com o e-mail certo não vincula (preview READY)", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const { user } = await lucasUser();
    const preview = await withClock(NOW, () =>
      previewInvitation(tokenOf(created.body.inviteUrl), { email: user.email }, getClock()),
    );
    expect(preview).toMatchObject({ state: "READY", familyName: "Família Silva" });
    expect(await db.member.count({ where: { userId: user.id } })).toBe(0);
  });

  it("aceite com o token do link: token certo vale; divergente => 422", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const { as } = await lucasUser();
    const id = created.body.invitation.id as string;
    const bad = await accept(as, id, { token: "x".repeat(43) });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe("INVITATION_TOKEN_MISMATCH");
    const ok = await accept(as, id, { token: tokenOf(created.body.inviteUrl) });
    expect(ok.status).toBe(200);
  });

  it("outro e-mail => 404 (sem distinguir de inexistente)", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const other = await asUser("outra@exemplo.com");
    const res = await accept(other, created.body.invitation.id);
    expect(res.status).toBe(404);
    expect((await decline(other, created.body.invitation.id)).status).toBe(404);
    expect((await accept(other, randomUUID())).status).toBe(404);
    expect((await myList(other)).body.invitations).toEqual([]);
    expect(await db.member.count({ where: { userId: other.userId } })).toBe(0);
  });

  it("e-mail não verificado => 403 EMAIL_NOT_VERIFIED e lista vazia", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const { as, user } = await lucasUser();
    await db.user.update({ where: { id: user.id }, data: { emailVerified: null } });
    const res = await accept(as, created.body.invitation.id);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("EMAIL_NOT_VERIFIED");
    expect((await myList(as)).body.invitations).toEqual([]);
    expect(await entryOf({ ...user, emailVerified: null })).toEqual({
      redirectTo: "/onboarding",
      membership: null,
    });
  });

  it("quem já tem família: 409 ALREADY_IN_FAMILY, convite segue PENDING e a família fica intacta", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const souza = await makeFamily({ name: "Família Souza", uniqueEmails: true });
    const { user } = await lucasUser();
    const lucasInSouza = await db.member.create({
      data: { familyId: souza.family.id, userId: user.id, role: "MEMBER" },
    });
    const res = await accept(souza.members[0]?.as ?? null, created.body.invitation.id);
    expect(res.status).toBe(404); // outra pessoa
    const asLucas = { ...(souza.members[0]?.as as NonNullable<Who>), userId: user.id };
    void asLucas;
    const lucasAs = await asUser("lucas@exemplo.com", { name: "Lucas Silva" });
    const again = await accept(lucasAs, created.body.invitation.id);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("ALREADY_IN_FAMILY");
    expect((await db.invitation.findFirstOrThrow()).status).toBe("PENDING");
    expect(await db.member.findMany({ where: { userId: user.id, removedAt: null } })).toEqual([
      expect.objectContaining({ id: lucasInSouza.id, familyId: souza.family.id }),
    ]);
  });

  it("dois convites: a lista mostra os dois; aceitar um deixa o outro PENDING e fora da lista", async () => {
    await invite({ email: "lucas@exemplo.com" });
    const souza = await makeFamily({ name: "Família Souza", uniqueEmails: true });
    const invSouza = await withClock(NOW, () =>
      call(souza.members[0]?.as ?? null, "POST", "/api/v1/invitations", {
        email: "lucas@exemplo.com",
      }),
    );
    const { as, user } = await lucasUser();
    const list = await myList(as);
    expect(list.body.invitations).toHaveLength(2);
    expect(await entryOf(user)).toEqual({ redirectTo: "/convites", membership: null });
    const ok = await accept(as, invSouza.body.invitation.id);
    expect(ok.status).toBe(200);
    expect(ok.body.membership.familyName).toBe("Família Souza");
    expect((await myList(as)).body.invitations).toHaveLength(1);
    expect(await db.member.count({ where: { userId: user.id } })).toBe(1);
    const silva = await db.invitation.findFirstOrThrow({ where: { familyId: fx.family.id } });
    expect(silva.status).toBe("PENDING");
  });

  it("Promise.all: aceite de dois convites diferentes => exatamente 1 Member e o outro 409", async () => {
    const a = await invite({ email: "lucas@exemplo.com" });
    const souza = await makeFamily({ name: "Família Souza", uniqueEmails: true });
    const b = await withClock(NOW, () =>
      call(souza.members[0]?.as ?? null, "POST", "/api/v1/invitations", {
        email: "lucas@exemplo.com",
      }),
    );
    const { as, user } = await lucasUser();
    const res = await Promise.all([
      accept(as, a.body.invitation.id),
      accept(as, b.body.invitation.id),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.member.count({ where: { userId: user.id, removedAt: null } })).toBe(1);
  });

  it("Promise.all: mesmo aceite com a mesma chave => mesma resposta e 1 Member", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const { as, user } = await lucasUser();
    const key = randomUUID();
    const run = () =>
      withClock(NOW, () =>
        call(
          as,
          "POST",
          `/api/v1/me/invitations/${created.body.invitation.id}/accept`,
          {},
          {
            idempotencyKey: key,
          },
        ),
      );
    const [x, y] = await Promise.all([run(), run()]);
    expect(x.status).toBe(200);
    expect(y.status).toBe(200);
    expect(y.body).toEqual(x.body);
    expect(await db.member.count({ where: { userId: user.id } })).toBe(1);
  });

  it("Promise.all: mesmo convite sem chave igual => 1 Member (o outro 409)", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const { as, user } = await lucasUser();
    const res = await Promise.all([
      accept(as, created.body.invitation.id),
      accept(as, created.body.invitation.id),
    ]);
    expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(await db.member.count({ where: { userId: user.id } })).toBe(1);
  });

  it("recusar: DECLINED, sem Member; o Administrador vê Recusado e convida de novo", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const { as, user } = await lucasUser();
    const res = await decline(as, created.body.invitation.id);
    expect(res.status).toBe(200);
    expect(res.body.invitation).toEqual({ id: created.body.invitation.id, status: "DECLINED" });
    expect(await db.member.count({ where: { userId: user.id } })).toBe(0);
    const row = await db.invitation.findFirstOrThrow();
    expect(row).toMatchObject({ status: "DECLINED", declinedByUserId: user.id });
    expect(row.declinedAt).not.toBeNull();
    const family = await withClock(NOW, () => call(mariana(), "GET", "/api/v1/family"));
    expect(family.body.declinedInvitations).toHaveLength(1);
    expect(family.body.declinedInvitations[0]).toMatchObject({
      email: "lucas@exemplo.com",
      status: "DECLINED",
    });
    expect(family.body.pendingInvitations).toHaveLength(0);
    // recusar de novo => 409; aceitar o recusado => 409
    expect((await decline(as, created.body.invitation.id)).status).toBe(409);
    expect((await accept(as, created.body.invitation.id)).status).toBe(409);
    // convidar de novo funciona (índice parcial só vale para PENDING)
    expect((await invite({ email: "lucas@exemplo.com" })).status).toBe(201);
  });

  it("vencido => 410 INVITATION_EXPIRED e some da lista", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const { as } = await lucasUser();
    const late = "2026-10-11T15:00:01Z";
    expect((await myList(as, late)).body.invitations).toEqual([]);
    const res = await accept(as, created.body.invitation.id, {}, late);
    expect(res.status).toBe(410);
    expect(res.body.error.code).toBe("INVITATION_EXPIRED");
  });

  it("cancelado depois de exibido => 409 INVITATION_NOT_PENDING", async () => {
    const created = await invite({ email: "lucas@exemplo.com" });
    const { as } = await lucasUser();
    await call(mariana(), "POST", `/api/v1/invitations/${created.body.invitation.id}/cancel`, {});
    const res = await accept(as, created.body.invitation.id);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("INVITATION_NOT_PENDING");
  });

  it("limite de 20 decisões por hora por usuário (429)", async () => {
    const { as } = await lucasUser();
    for (let i = 0; i < 20; i++) expect((await decline(as, randomUUID())).status).toBe(404);
    expect((await decline(as, randomUUID())).status).toBe(429);
  });

  it("sem convite válido o gate segue a regra antiga (onboarding)", async () => {
    const { user } = await lucasUser();
    expect(await entryOf(user)).toEqual({ redirectTo: "/onboarding", membership: null });
  });

  it("sem sessão => 401", async () => {
    expect((await myList(null)).status).toBe(401);
    expect((await accept(null, randomUUID())).status).toBe(401);
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
    expect((await accept(other, created.body.invitation.id)).status).toBe(404);
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
    const { as } = await lucasUser();
    await accept(as, created.body.invitation.id);
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

    const { as, user } = await lucasUser();
    expect((await accept(as, id)).status).toBe(409);
    expect(await entryOf(user)).toEqual({ redirectTo: "/onboarding", membership: null });
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
    const { as, user } = await lucasUser();
    expect(await entryOf(user, "2026-10-11T15:00:00Z")).toEqual({
      redirectTo: "/onboarding?notice=invite_expired",
      membership: null,
    });
    expect((await accept(as, created.body.invitation.id, {}, "2026-10-11T15:00:01Z")).status).toBe(
      410,
    );
    expect(await db.member.count({ where: { userId: user.id } })).toBe(0);
    const preview = await withClock("2026-10-11T15:00:01Z", () =>
      previewInvitation(tokenOf(created.body.inviteUrl), null, getClock()),
    );
    expect(preview).toEqual({ state: "EXPIRED" });
    // um segundo antes do vencimento ainda vale
    expect((await accept(as, created.body.invitation.id, {}, "2026-10-11T14:59:59Z")).status).toBe(
      200,
    );
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

it("SEC-014: limite de convites por família: 5/hora e 10/dia (429 INVITATION_LIMIT)", async () => {
  const base = Date.now();
  const at = (offsetMs: number, i: number) =>
    withClock(new Date(base + offsetMs).toISOString(), () =>
      call(mariana(), "POST", "/api/v1/invitations", {
        email: `p${i}@exemplo.com`,
        role: "MEMBER",
      }),
    );
  for (let i = 0; i < 5; i++) expect((await at(0, i)).status).toBe(201);
  const sixth = await at(0, 5);
  expect(sixth.status).toBe(429);
  expect(sixth.body.error.code).toBe("INVITATION_LIMIT");
  // 2h depois a janela de 1h esvaziou: mais 5 até o teto diário
  for (let i = 5; i < 10; i++) expect((await at(2 * 3_600_000, i)).status).toBe(201);
  expect((await at(2 * 3_600_000, 10)).status).toBe(429);
  // 25h depois a janela diária esvaziou
  expect((await at(25 * 3_600_000, 11)).status).toBe(201);
});
