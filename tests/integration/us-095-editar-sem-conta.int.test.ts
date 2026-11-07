import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeInvitation,
  makeTransaction,
  makeUnlinkedMember,
} from "../support/factories";
import { findResidue } from "../support/pii";

// US-095 (ADR-038 §5): editar nome e e-mail do cadastro sem conta.
const db = testDb();
const NOW = "2026-11-07T15:00:00Z";
let fx: FamilyFixture;
let ana: string;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;

beforeEach(async () => {
  await resetDb();
  setMailer(new InMemoryMailer());
  fx = await makeFamily();
  ana = (await makeUnlinkedMember(fx, { name: "Ana Secreta" })).memberId;
});
afterEach(() => setMailer(null));

const patch = (body: object, id = ana, as = mariana()) =>
  withClock(NOW, () => call(as, "PATCH", `/api/v1/members/${id}/profile`, body));
const read = (path: string, as = mariana()) => withClock(NOW, () => call(as, "GET", path));
const anaRow = () => db.member.findUniqueOrThrow({ where: { id: ana } });
const withEmail = async (email = "ana.silva@exemplo.com") =>
  db.member.update({ where: { id: ana }, data: { pendingEmail: email } });

describe("095 editar o membro sem conta", () => {
  it("AC1: renomear muda o nome nas leituras e não toca em transactions.version", async () => {
    const conta = await makeAccount(fx, { name: "Conta Ana", owner: "Mariana" });
    const tx = await makeTransaction(fx, {
      account: conta,
      category: "Supermercado",
      amountInCents: 30000,
      occurredOn: "2026-10-03",
      author: "Mariana",
    });
    await db.transaction.update({ where: { id: tx.id }, data: { payerMemberId: ana } });
    const before = await db.transaction.findUniqueOrThrow({ where: { id: tx.id } });

    const res = await patch({ name: "  Ana   Paula " });
    expect(res.status).toBe(200);
    expect(res.body.member).toMatchObject({ memberId: ana, name: "Ana Paula", unlinked: true });
    const after = await db.transaction.findUniqueOrThrow({ where: { id: tx.id } });
    expect(after.version).toBe(before.version);
    expect(after.updatedAt).toEqual(before.updatedAt);

    const names = (await read("/api/v1/family")).body.members.map((m: { name: string }) => m.name);
    expect(names).toContain("Ana Paula");
    expect(names).not.toContain("Ana Secreta");
    const settlement = JSON.stringify((await read("/api/v1/settlement")).body);
    expect(settlement).toContain("Ana Paula");
    expect(settlement).not.toContain("Ana Secreta");
    const extrato = JSON.stringify((await read("/api/v1/transactions?period=2026-10")).body);
    expect(extrato).toContain("Ana Paula");
    expect(extrato).not.toContain("Ana Secreta");
  });

  it("AC2: MEMBER 403; com conta 409; outra família, removido e inexistente 404; NAME_TAKEN/RESERVED", async () => {
    expect((await patch({ name: "Nova" }, ana, lucas())).status).toBe(403);
    const linked = await patch({ name: "Outro" }, fx.byName.Lucas?.memberId as string);
    expect(linked.status).toBe(409);
    expect(linked.body.error.code).toBe("MEMBER_IS_LINKED");
    const other = await makeFamily({ uniqueEmails: true, name: "Outra" });
    const gone = await makeUnlinkedMember(fx, { name: "Duda", removedAt: new Date("2026-10-01") });
    const cross = await patch({ name: "Nova" }, ana, other.byName.Mariana?.as ?? null);
    expect(cross.status).toBe(404);
    for (const id of [gone.memberId, "00000000-0000-4000-8000-000000000000"]) {
      expect((await patch({ name: "Nova" }, id)).status, id).toBe(404);
    }
    await makeUnlinkedMember(fx, { name: "Bia" });
    const taken = await patch({ name: "bia" });
    expect(taken.status).toBe(409);
    expect(taken.body.error.code).toBe("NAME_TAKEN");
    expect((await patch({ name: fx.byName.Lucas?.name ?? "Lucas" })).body.error.code).toBe(
      "NAME_TAKEN",
    );
    expect((await patch({ name: "Administrador" })).body.error.code).toBe("NAME_RESERVED");
    expect((await patch({ name: "A" })).status).toBe(400);
    // o próprio nome (outra caixa) é permitido
    expect((await patch({ name: "ANA SECRETA" })).status).toBe(200);
    expect((await anaRow()).name).toBe("ANA SECRETA");
  });

  it("corpo: vazio, campo estranho e e-mail inválido => 400", async () => {
    for (const body of [{}, { role: "ADMIN" }, { email: "nope" }, { name: "Ana", userId: ana }]) {
      expect((await patch(body)).status, JSON.stringify(body)).toBe(400);
    }
  });

  it("AC3: convite vinculado pendente bloqueia a troca; cancelado, expirado e encerrado liberam", async () => {
    await withEmail();
    const inv = await makeInvitation(fx, {
      email: "ana.silva@exemplo.com",
      createdAt: new Date(NOW),
    });
    await db.invitation.update({ where: { id: inv.id }, data: { memberId: ana } });
    const blocked = await patch({ email: "novo@exemplo.com" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe("MEMBER_HAS_PENDING_INVITATION");
    expect((await patch({ email: null })).status).toBe(409);
    expect((await anaRow()).pendingEmail).toBe("ana.silva@exemplo.com");
    // renomear continua permitido com convite pendente
    expect((await patch({ name: "Ana Paula" })).status).toBe(200);

    await withClock(NOW, () => call(mariana(), "POST", `/api/v1/invitations/${inv.id}/cancel`, {}));
    expect((await patch({ email: "novo@exemplo.com" })).status).toBe(200);
    expect((await anaRow()).pendingEmail).toBe("novo@exemplo.com");

    // vencido: expireStale libera
    const old = await makeInvitation(fx, {
      email: "novo@exemplo.com",
      createdAt: new Date("2026-10-01"),
      expiresAt: new Date("2026-10-08"),
    });
    await db.invitation.update({ where: { id: old.id }, data: { memberId: ana } });
    expect((await patch({ email: "outro@exemplo.com" })).status).toBe(200);
    expect((await db.invitation.findUniqueOrThrow({ where: { id: old.id } })).status).toBe(
      "EXPIRED",
    );
  });

  it("e-mail novo: DUPLICATE_MEMBER, EMAIL_BELONGS_TO_OTHER_MEMBER, EMAIL_HAS_PENDING_INVITATION", async () => {
    await makeUnlinkedMember(fx, { name: "Bia", pendingEmail: "bia@exemplo.com" });
    await makeInvitation(fx, { email: "pend@exemplo.com", createdAt: new Date(NOW) });
    const cases: Array<[string, string]> = [
      ["lucas@exemplo.com", "DUPLICATE_MEMBER"],
      ["Bia@Exemplo.com", "EMAIL_BELONGS_TO_OTHER_MEMBER"],
      ["pend@exemplo.com", "EMAIL_HAS_PENDING_INVITATION"],
    ];
    for (const [email, code] of cases) {
      const res = await patch({ email });
      expect(res.status, email).toBe(409);
      expect(res.body.error.code).toBe(code);
    }
    expect((await anaRow()).pendingEmail).toBeNull();
    const ok = await patch({ email: " Ana.Silva@Exemplo.com " });
    expect(ok.status).toBe(200);
    expect(ok.body.member.pendingEmail).toBe("ana.silva@exemplo.com");
  });

  it("AC4: remover o e-mail mantém o membro e anonimiza convites encerrados", async () => {
    await withEmail();
    const done = await makeInvitation(fx, {
      email: "ana.silva@exemplo.com",
      createdAt: new Date("2026-10-04"),
      status: "CANCELED",
    });
    await db.invitation.update({ where: { id: done.id }, data: { memberId: ana } });
    const res = await patch({ email: null });
    expect(res.status).toBe(200);
    expect(res.body.member.pendingEmail).toBeNull();
    const row = await anaRow();
    expect(row.pendingEmail).toBeNull();
    expect(row.removedAt).toBeNull();
    expect((await db.invitation.findUniqueOrThrow({ where: { id: done.id } })).email).toBe(
      `deleted+${ana}@invalid.local`,
    );
    expect(await findResidue(["ana.silva@exemplo.com"])).toEqual({});
  });

  it("AC5: o evento só tem flags; sem diferença efetiva => 200 sem evento", async () => {
    await withEmail("velho@exemplo.com");
    expect((await patch({ name: "Ana Paula", email: "novo@exemplo.com" })).status).toBe(200);
    expect((await patch({ email: null })).status).toBe(200);
    const events = await db.familyEvent.findMany({ where: { type: "MEMBER_UPDATED" } });
    expect(events.map((e) => e.changes)).toEqual([
      { nameChanged: true, emailChanged: true, hasEmail: true },
      { nameChanged: false, emailChanged: true, hasEmail: false },
    ]);
    expect(events[0]?.targetMemberId).toBe(ana);
    const noop = await patch({ name: "Ana Paula", email: null });
    expect(noop.status).toBe(200);
    expect(await db.familyEvent.count({ where: { type: "MEMBER_UPDATED" } })).toBe(2);
    const text = JSON.stringify(events.map((e) => e.changes));
    for (const s of ["Ana", "Paula", "Secreta", "exemplo"]) expect(text).not.toContain(s);
  });

  it("idempotência: respostas guardadas com o e-mail antigo são apagadas ao trocar", async () => {
    expect((await patch({ email: "velho@exemplo.com" })).status).toBe(200);
    expect(Object.keys(await findResidue(["velho@exemplo.com"]))).toContain(
      "idempotency_records.responseBody",
    );
    expect((await patch({ email: "novo@exemplo.com" })).status).toBe(200);
    expect(await findResidue(["velho@exemplo.com"])).toEqual({});
  });
});
