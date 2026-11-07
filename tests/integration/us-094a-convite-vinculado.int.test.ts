import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { previewInvitation } from "@/modules/familia/invitations/service";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  asUser,
  type FamilyFixture,
  makeFamily,
  makeInvitation,
  makeUnlinkedMember,
} from "../support/factories";
import { findResidue } from "../support/pii";

// US-094a (ADR-038): convite vinculado ao cadastro sem conta.
const db = testDb();
const NOW = "2026-11-07T15:00:00Z";
let fx: FamilyFixture;
let mailer: InMemoryMailer;
let ana: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;

beforeEach(async () => {
  await resetDb();
  mailer = new InMemoryMailer();
  setMailer(mailer);
  fx = await makeFamily();
  ana = (await makeUnlinkedMember(fx, { name: "Ana Secreta" })).memberId;
});
afterEach(() => setMailer(null));

const linked = (email: string, id = ana, as = mariana()) =>
  withClock(NOW, () => call(as, "POST", `/api/v1/members/${id}/invitations`, { email }));
const family = (as = mariana()) => withClock(NOW, () => call(as, "GET", "/api/v1/family"));
const quota = () => db.mcpRateBucket.count({ where: { key: { startsWith: "invite:" } } });
const anaDto = async () =>
  (await family()).body.members.find((m: { memberId: string }) => m.memberId === ana);

describe("094a convite vinculado", () => {
  it("AC1: ADMIN convida; 201, memberId, pendingEmail gravado, pendingInvitation e e-mail sem nome", async () => {
    const res = await linked("Ana@Exemplo.com");
    expect(res.status).toBe(201);
    expect(res.body.invitation).toMatchObject({ email: "ana@exemplo.com", role: "MEMBER" });
    expect(res.body.invitation.memberId).toBe(ana);
    const row = await db.invitation.findUniqueOrThrow({ where: { id: res.body.invitation.id } });
    expect(row.memberId).toBe(ana);
    expect((await db.member.findUniqueOrThrow({ where: { id: ana } })).pendingEmail).toBe(
      "ana@exemplo.com",
    );
    expect((await anaDto()).pendingInvitation).toMatchObject({ id: row.id });
    expect((await family(lucas())).body.members.some((m: object) => "pendingInvitation" in m)).toBe(
      false,
    );
    // lista "Convites pendentes" não duplica o vinculado
    expect((await family()).body.pendingInvitations).toHaveLength(0);
    // AC7: e-mail e página pública sem o nome do cadastro
    expect(mailer.sent).toHaveLength(1);
    expect(JSON.stringify(mailer.sent)).not.toContain("Secreta");
    const token = res.body.inviteUrl.split("/convite/")[1];
    const login = await asUser("ana@exemplo.com");
    const preview = await previewInvitation(
      token,
      { email: login.email },
      { now: () => new Date(NOW) },
    );
    expect(JSON.stringify(preview)).not.toContain("Secreta");
  });

  it("AC2: MEMBER 403; outra família, removido e com conta => 404 uniforme", async () => {
    expect((await linked("a@exemplo.com", ana, lucas())).status).toBe(403);
    const other = await makeFamily({ uniqueEmails: true, name: "Outra" });
    const gone = await makeUnlinkedMember(fx, { name: "Duda", removedAt: new Date("2026-10-01") });
    for (const id of [
      ana,
      gone.memberId,
      fx.byName.Lucas?.memberId as string,
      "00000000-0000-4000-8000-000000000000",
    ]) {
      const as = id === ana ? (other.byName.Mariana?.as ?? null) : mariana();
      const res = await linked("x@exemplo.com", id, as);
      expect(res.status, id).toBe(404);
      expect(res.body.error.message).toBe("Membro não encontrado.");
    }
    expect((await linked("nope", ana)).status).toBe(400);
    expect(await db.invitation.count()).toBe(0);
  });

  it("AC3: e-mail diferente do pendingEmail => 422, nada gravado e cota intacta", async () => {
    await db.member.update({ where: { id: ana }, data: { pendingEmail: "ana@exemplo.com" } });
    const res = await linked("outro@exemplo.com");
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("INVITATION_EMAIL_MISMATCH");
    expect(await db.invitation.count()).toBe(0);
    expect(await quota()).toBe(0);
    expect(mailer.sent).toHaveLength(0);
    expect((await linked("ana@exemplo.com")).status).toBe(201);
  });

  it("AC4: DUPLICATE_MEMBER, EMAIL_BELONGS_TO_OTHER_MEMBER, DUPLICATE_INVITATION e convite comum", async () => {
    const dup = await linked("lucas@exemplo.com");
    expect(dup.body.error.code).toBe("DUPLICATE_MEMBER");
    await makeUnlinkedMember(fx, { name: "Bia", pendingEmail: "bia@exemplo.com" });
    const other = await linked("bia@exemplo.com");
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("EMAIL_BELONGS_TO_OTHER_MEMBER");
    expect(await quota()).toBe(0);
    await makeInvitation(fx, { email: "pend@exemplo.com", createdAt: new Date(NOW) });
    const pend = await linked("pend@exemplo.com");
    expect(pend.body.error.code).toBe("DUPLICATE_INVITATION");
    expect((await linked("ana@exemplo.com")).status).toBe(201);
    const again = await linked("ana@exemplo.com");
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("DUPLICATE_INVITATION");
    const common = await withClock(NOW, () =>
      call(mariana(), "POST", "/api/v1/invitations", { email: "ana@exemplo.com", role: "MEMBER" }),
    );
    expect(common.body.error.code).toBe("EMAIL_BELONGS_TO_UNLINKED_MEMBER");
  });

  it("AC5: cancelar, expirar e recusar zeram pendingInvitation e permitem convidar de novo", async () => {
    const first = await linked("ana@exemplo.com");
    const id = first.body.invitation.id;
    expect(
      (await withClock(NOW, () => call(mariana(), "POST", `/api/v1/invitations/${id}/cancel`, {})))
        .status,
    ).toBe(200);
    expect((await anaDto()).pendingInvitation).toBeNull();
    const second = await linked("ana@exemplo.com");
    expect(second.status).toBe(201);
    await db.invitation.update({
      where: { id: second.body.invitation.id },
      data: { expiresAt: new Date("2026-11-01") },
    });
    expect((await anaDto()).pendingInvitation).toBeNull();
    const third = await linked("ana@exemplo.com");
    expect(third.status).toBe(201);
    await db.invitation.update({
      where: { id: third.body.invitation.id },
      data: { status: "DECLINED", declinedAt: new Date(NOW) },
    });
    expect((await anaDto()).pendingInvitation).toBeNull();
    expect((await linked("ana@exemplo.com")).status).toBe(201);
    const m = await db.member.findUniqueOrThrow({ where: { id: ana } });
    expect(m).toMatchObject({ pendingEmail: "ana@exemplo.com", removedAt: null, userId: null });
  });

  it("AC6: reenvio máx. 3, copiar link, teto; evento do reenvio sem e-mail", async () => {
    const res = await linked("ana@exemplo.com");
    const id = res.body.invitation.id;
    const post = (mode: string) =>
      withClock(NOW, () => call(mariana(), "POST", `/api/v1/invitations/${id}/${mode}`, {}));
    expect((await post("link")).status).toBe(200);
    for (let i = 0; i < 3; i++) expect((await post("resend")).status).toBe(200);
    const over = await post("resend");
    expect(over.status).toBe(422);
    expect(over.body.error.code).toBe("RESEND_LIMIT_REACHED");
    const events = await db.familyEvent.findMany({ where: { type: "INVITATION_RESENT" } });
    expect(events).toHaveLength(3);
    for (const e of events) {
      expect(e.changes).toEqual({ invitationId: id, resendCount: expect.any(Number) });
    }
    const residue = await findResidue(["ana@exemplo.com"]);
    expect(residue.family_events ?? 0).toBe(0);
  });

  it("AC6b: teto de convites por pessoa conta o vinculado (429, nada gravado)", async () => {
    for (let i = 0; i < 5; i++) {
      await withClock(NOW, () =>
        call(mariana(), "POST", "/api/v1/invitations", { email: `p${i}@exemplo.com` }),
      );
    }
    const res = await linked("ana@exemplo.com");
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe("INVITATION_LIMIT");
    expect((await db.member.findUniqueOrThrow({ where: { id: ana } })).pendingEmail).toBeNull();
  });

  it("AC8: convidar x remover => um vence, sem convite pendente para removido; dois convites => 201 e 409", async () => {
    const [inv, rem] = await Promise.all([
      linked("ana@exemplo.com"),
      withClock(NOW, () =>
        call(mariana(), "POST", `/api/v1/members/${ana}/remove`, { acknowledgeSettlement: true }),
      ),
    ]);
    expect([201, 404]).toContain(inv.status);
    expect([200, 404, 409]).toContain(rem.status);
    const m = await db.member.findUniqueOrThrow({ where: { id: ana } });
    if (m.removedAt) {
      expect(await db.invitation.count({ where: { memberId: ana, status: "PENDING" } })).toBe(0);
    }

    const bia = (await makeUnlinkedMember(fx, { name: "Bia" })).memberId;
    const pair = await Promise.all([
      linked("bia@exemplo.com", bia),
      linked("bia@exemplo.com", bia),
    ]);
    expect(pair.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.invitation.count({ where: { memberId: bia, status: "PENDING" } })).toBe(1);
  });
});
