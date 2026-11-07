import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { contextOf } from "@/modules/split/migrate-family";
import { ownerStanding } from "@/modules/transacoes/ownership";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  asUser,
  type FamilyFixture,
  makeAccount,
  makeCard,
  makeFamily,
  makePlannedExpense,
  makeTransaction,
  makeUnlinkedMember,
} from "../support/factories";
import { findResidue } from "../support/pii";

// US-094b (ADR-038): aceite do convite vinculado ao cadastro sem conta.
const db = testDb();
const NOW = "2026-11-07T15:00:00Z";
const EMAIL = "ana@exemplo.com";
let fx: FamilyFixture;
let mailer: InMemoryMailer;
let ana: string;
let guest: Awaited<ReturnType<typeof asUser>>;
let invId: string;
const mariana = () => fx.byName.Mariana?.as ?? null;

beforeEach(async () => {
  await resetDb();
  mailer = new InMemoryMailer();
  setMailer(mailer);
  fx = await makeFamily();
  ana = (await makeUnlinkedMember(fx, { name: "Ana Rótulo", pendingEmail: EMAIL, register: true }))
    .memberId;
  const inv = await withClock(NOW, () =>
    call(mariana(), "POST", `/api/v1/members/${ana}/invitations`, { email: EMAIL }),
  );
  invId = inv.body.invitation.id;
  guest = await asUser(EMAIL, { name: "Ana Google" });
  mailer.sent.length = 0;
});
afterEach(() => setMailer(null));

const accept = (body: object = { name: "Ana Souza" }, id = invId, as = guest) =>
  withClock(NOW, () => call(as, "POST", `/api/v1/me/invitations/${id}/accept`, body));
const mine = (as = guest) => withClock(NOW, () => call(as, "GET", "/api/v1/me/invitations"));
const row = () => db.member.findUniqueOrThrow({ where: { id: ana } });
const status = async () => (await db.invitation.findUniqueOrThrow({ where: { id: invId } })).status;

describe("094b aceite vinculado", () => {
  it("AC1: prévia com rótulo e as quatro contagens; outro e-mail não recebe", async () => {
    const acc = await makeAccount(fx, { name: "Poupança", owner: "Ana" });
    await makeAccount(fx, { name: "Arquivada", owner: "Ana" }).then((a) =>
      db.bankAccount.update({ where: { id: a.id }, data: { archivedAt: new Date() } }),
    );
    await makeCard(fx, { name: "Cartão", owner: "Ana" });
    await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 1000,
      occurredOn: "2026-11-01",
      payer: "Ana",
    });
    await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 1000,
      occurredOn: "2026-11-02",
      payer: "Ana",
      deleted: true,
    });
    await makePlannedExpense(fx, {
      description: "Luz",
      amountInCents: 500,
      dueOn: "2026-11-20",
      responsible: "Ana",
    });
    const res = await mine();
    expect(res.status).toBe(200);
    expect(res.body.invitations).toHaveLength(1);
    expect(res.body.invitations[0].linked).toEqual({
      label: "Ana Rótulo",
      accounts: 1,
      cards: 1,
      transactions: 1,
      planned: 1,
      wasMemberBefore: false,
    });
    const other = await asUser("outra@exemplo.com");
    expect((await mine(other)).body.invitations).toEqual([]);
    expect((await accept({ name: "X Y" }, invId, other)).status).toBe(404);
  });

  it("AC1b: wasMemberBefore quando o mesmo usuário já foi removido da família", async () => {
    await db.member.create({
      data: {
        familyId: fx.family.id,
        userId: guest.userId,
        role: "MEMBER",
        removedAt: new Date("2026-06-01"),
        removalKind: "REMOVED",
      },
    });
    expect((await mine()).body.invitations[0].linked.wasMemberBefore).toBe(true);
  });

  it("AC2: vincula ao mesmo memberId, userId, pendingEmail nulo, nome escolhido; titular preservado", async () => {
    const acc = await makeAccount(fx, { name: "Poupança", owner: "Ana" });
    const res = await accept({ name: "  Ana   Souza " });
    expect(res.status).toBe(200);
    expect(res.body.membership).toMatchObject({ familyId: fx.family.id, role: "MEMBER" });
    const m = await row();
    expect(m).toMatchObject({
      userId: guest.userId,
      pendingEmail: null,
      name: "Ana Souza",
      removedAt: null,
    });
    expect(m.linkedAt).not.toBeNull();
    expect((await db.bankAccount.findUniqueOrThrow({ where: { id: acc.id } })).ownerMemberId).toBe(
      ana,
    );
    expect(await status()).toBe("ACCEPTED");
    // sessão existente já tem família no próximo request
    expect(
      (await withClock(NOW, () => call(guest, "GET", "/api/v1/me"))).body.membership.memberId,
    ).toBe(ana);
    const ev = await db.familyEvent.findFirstOrThrow({ where: { type: "MEMBER_LINKED" } });
    expect(ev).toMatchObject({
      actorMemberId: ana,
      targetMemberId: ana,
      changes: { invitationId: invId, nameChanged: true },
    });
  });

  it("AC4: tutor ADMIN perde os poderes de tutor sobre o cadastro", async () => {
    const ctx = {
      ...contextOf(fx.family.id, "2026-11-07"),
      memberId: fx.byName.Mariana?.memberId as string,
      userId: fx.byName.Mariana?.userId as string,
    };
    expect(await db.$transaction((tx) => ownerStanding(tx, ctx, ana))).toMatchObject({
      ownerUnlinked: true,
    });
    await accept();
    expect(await db.$transaction((tx) => ownerStanding(tx, ctx, ana))).toMatchObject({
      ownerUnlinked: false,
      ownerRemoved: false,
      ownerIsActor: false,
    });
  });

  it("AC5: sem nome 422; nome de outro membro 409; reservado 422; convite segue PENDING", async () => {
    const none = await accept({});
    expect(none.status).toBe(422);
    expect(none.body.error.code).toBe("NAME_REQUIRED");
    const taken = await accept({ name: "lucas  SILVA" });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("NAME_TAKEN");
    expect((await accept({ name: "Administrador" })).body.error.code).toBe("NAME_RESERVED");
    expect((await accept({ name: "A" })).status).toBe(422);
    expect((await accept({ name: "Ana", extra: 1 })).status).toBe(400);
    expect(await status()).toBe("PENDING");
    expect((await row()).userId).toBeNull();
    // o próprio rótulo é permitido
    expect((await accept({ name: "ana rótulo" })).status).toBe(200);
  });

  it("AC6: já tem família => 409 e PENDING; recusar não altera o cadastro", async () => {
    const other = await makeFamily({
      name: "Outra",
      members: [{ email: EMAIL, name: "Ana G", role: "ADMIN" }],
    });
    const res = await accept({ name: "Ana Souza" }, invId, other.members[0]?.as as typeof guest);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("ALREADY_IN_FAMILY");
    expect(await status()).toBe("PENDING");
    const dec = await withClock(NOW, () =>
      call(guest, "POST", `/api/v1/me/invitations/${invId}/decline`, {}),
    );
    expect(dec.status).toBe(200);
    expect(await row()).toMatchObject({ userId: null, pendingEmail: EMAIL, name: "Ana Rótulo" });
  });

  it("AC7a: dois aceites simultâneos => um 200, um 409", async () => {
    const [a, b] = await Promise.all([accept({ name: "Ana Um" }), accept({ name: "Ana Dois" })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await row()).userId).toBe(guest.userId);
  });

  it("AC7b: aceite x remoção do cadastro: nunca removido com userId novo", async () => {
    const [a, r] = await Promise.all([
      accept({ name: "Ana Souza" }),
      withClock(NOW, () => call(mariana(), "POST", `/api/v1/members/${ana}/remove`, {})),
    ]);
    const m = await row();
    // ordem serial válida: (aceite, remoção) ➔ removido COM userId; (remoção, aceite) ➔ aceite 409 e userId nulo
    expect(r.status).toBe(200);
    expect(m.removedAt).not.toBeNull();
    if (a.status === 200) expect(m.userId).toBe(guest.userId);
    else {
      expect(a.status).toBe(409);
      expect(m.userId).toBeNull();
      expect(await status()).toBe("PENDING"); // 409 desfaz o claim (mesma transação)
    }
  });

  it("AC7c: cadastro removido antes do aceite => aceite recusado e sem userId", async () => {
    await withClock(NOW, () => call(mariana(), "POST", `/api/v1/members/${ana}/remove`, {}));
    const res = await accept();
    expect([404, 409]).toContain(res.status);
    expect((await row()).userId).toBeNull();
  });

  it("AC8: family_events sem nome nem e-mail; ADMIN ativo com conta recebe o aviso", async () => {
    await accept({ name: "Nome Escolhido Zeta" });
    const events = JSON.stringify(
      await db.familyEvent.findMany({ where: { type: "MEMBER_LINKED" } }),
    );
    expect(events).not.toContain("Zeta");
    expect(events).not.toContain(EMAIL);
    expect(mailer.sent).toHaveLength(1);
    expect(mailer.sent[0]?.to).toBe("mariana@exemplo.com");
    expect(mailer.sent[0]?.text).toContain(
      "Nome Escolhido Zeta entrou no app e assumiu o cadastro",
    );
    expect(mailer.sent.every((m) => m.to !== EMAIL)).toBe(true);
    expect(JSON.stringify(mailer.sent.map((m) => [m.subject, m.text, m.html]))).not.toContain(
      EMAIL,
    );
    const residue = await findResidue(["Zeta"]);
    expect(Object.keys(residue)).toEqual(["members.name"]);
  });

  it("falha do e-mail não desfaz o vínculo; convite comum ignora name", async () => {
    mailer.failWith = new Error("smtp");
    expect((await accept()).status).toBe(200);
    expect((await row()).userId).toBe(guest.userId);
    const lucasInv = await withClock(NOW, () =>
      call(mariana(), "POST", "/api/v1/invitations", { email: "novo@exemplo.com" }),
    );
    const novo = await asUser("novo@exemplo.com", { name: "Novo G" });
    mailer.failWith = null;
    const res = await accept({ name: "Ignorado" }, lucasInv.body.invitation.id, novo);
    expect(res.status).toBe(200);
    expect((await db.member.findFirstOrThrow({ where: { userId: novo.userId } })).name).toBeNull();
  });
});
