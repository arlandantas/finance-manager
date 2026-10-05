import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getClock, withClock } from "@/lib/clock";
import { sha256Hex } from "@/lib/ids";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { previewInvitation } from "@/modules/familia/invitations/service";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { type FamilyFixture, makeFamily } from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let mailer: InMemoryMailer;
const mariana = () => fx.byName.Mariana?.as ?? null; // ADMIN
const lucas = () => fx.byName.Lucas?.as ?? null;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const tokenOf = (url: string) => url.split("/convite/")[1] as string;
const preview = (token: string) => withClock(NOW, () => previewInvitation(token, null, getClock()));

async function invite() {
  const r = await at(() =>
    call(mariana(), "POST", "/api/v1/invitations", { email: "vovo@example.com", role: "MEMBER" }),
  );
  expect(r.status).toBe(201);
  return {
    id: r.body.invitation.id as string,
    url: r.body.inviteUrl as string,
    expiresAt: r.body.invitation.expiresAt as string,
  };
}
const link = (id: string, as = mariana()) =>
  at(() => call(as, "POST", `/api/v1/invitations/${id}/link`, {}));
const resend = (id: string, as = mariana(), key?: string) =>
  at(() =>
    call(
      as,
      "POST",
      `/api/v1/invitations/${id}/resend`,
      {},
      key ? { idempotencyKey: key } : undefined,
    ),
  );

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  mailer = new InMemoryMailer();
  setMailer(mailer);
});
afterEach(() => setMailer(null));

describe("US-039 Copiar link e Reenviar e-mail (rotação de token)", () => {
  it("copiar link: 200, novo token válido, o anterior inválido, validade original mantida, sem e-mail e sem contar", async () => {
    const inv = await invite();
    mailer.sent.length = 0;
    const r = await link(inv.id);
    expect(r.status).toBe(200);
    expect(r.body.invitation).toMatchObject({
      resendCount: 0,
      canResend: true,
      expiresAt: inv.expiresAt,
    });
    expect(await preview(tokenOf(inv.url))).toEqual({ state: "INVALID" });
    expect((await preview(tokenOf(r.body.inviteUrl))).state).toBe("NEEDS_LOGIN");
    expect(mailer.sent).toHaveLength(0);
    expect(r.body.emailStatus).toBeUndefined();
    const row = await db.invitation.findUniqueOrThrow({ where: { id: inv.id } });
    expect(row.tokenHash).toBe(sha256Hex(tokenOf(r.body.inviteUrl)));
  });

  it("reenviar: e-mail com o novo link, resendCount+1, FamilyEvent, validade original; link do e-mail anterior morre", async () => {
    const inv = await invite();
    mailer.sent.length = 0;
    const r = await resend(inv.id);
    expect(r.status).toBe(200);
    expect(r.body.emailStatus).toBe("SENT");
    expect(r.body.invitation).toMatchObject({ resendCount: 1, expiresAt: inv.expiresAt });
    expect(mailer.sent).toHaveLength(1);
    expect(JSON.stringify(mailer.sent[0])).toContain(tokenOf(r.body.inviteUrl));
    expect(await preview(tokenOf(inv.url))).toEqual({ state: "INVALID" });
    expect(await db.familyEvent.count({ where: { type: "INVITATION_RESENT" } })).toBe(1);
  });

  it("limite: o 4º reenvio => 422 RESEND_LIMIT_REACHED; copiar link ainda funciona (não conta)", async () => {
    const inv = await invite();
    for (let i = 0; i < 3; i++) expect((await resend(inv.id)).status).toBe(200);
    const fourth = await resend(inv.id);
    expect(fourth.status).toBe(422);
    expect(fourth.body.error.code).toBe("RESEND_LIMIT_REACHED");
    expect(fourth.body.error.message).toBe(
      "Limite de reenvios atingido. Cancele e crie um novo convite.",
    );
    expect((await link(inv.id)).status).toBe(200);
    const list = await at(() => call(mariana(), "GET", "/api/v1/family"));
    expect(list.body.pendingInvitations[0]).toMatchObject({ resendCount: 3, canResend: false });
  });

  it("vencido => 422 INVITATION_EXPIRED nas duas rotas; cancelado => 409", async () => {
    const inv = await invite();
    await db.invitation.update({
      where: { id: inv.id },
      data: { expiresAt: new Date("2026-10-10T00:00:00Z") },
    });
    for (const f of [link, resend]) {
      const r = await f(inv.id);
      expect(r.status).toBe(422);
      expect(r.body.error).toMatchObject({
        code: "INVITATION_EXPIRED",
        message: "Convite expirado. Cancele e crie um novo convite.",
      });
    }
    await db.invitation.update({ where: { id: inv.id }, data: { status: "CANCELED" } });
    expect((await link(inv.id)).status).toBe(409);
  });

  it("Membro => 403; outra família => 404; duplo clique com a mesma chave => 1 rotação (mesmo link)", async () => {
    const inv = await invite();
    expect((await link(inv.id, lucas())).status).toBe(403);
    expect((await resend(inv.id, lucas())).status).toBe(403);
    const other = await makeFamily({ uniqueEmails: true, name: "Souza" });
    expect((await resend(inv.id, other.members[0]?.as ?? null)).status).toBe(404);
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      resend(inv.id, mariana(), key),
      resend(inv.id, mariana(), key),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(a.body.inviteUrl).toBe(b.body.inviteUrl);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: inv.id } })).resendCount).toBe(1);
  });

  it("migração: CHECK impede resendCount fora de 0..3", async () => {
    const inv = await invite();
    await expect(
      db.invitation.update({ where: { id: inv.id }, data: { resendCount: 4 } }),
    ).rejects.toThrow();
  });
});
