import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { InMemoryMailer, setMailer } from "@/lib/mail";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  asUser,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
  makeUnlinkedMember,
} from "../support/factories";
import { findResidue } from "../support/pii";

// US-092b (SDD-033 §8.4): cadastro de membro sem conta pelo Administrador.
const db = testDb();
const NOW = "2026-11-05T15:00:00Z";
let fx: FamilyFixture;
let mailer: InMemoryMailer;
const mariana = () => fx.byName.Mariana?.as ?? null;
const lucas = () => fx.byName.Lucas?.as ?? null;

beforeEach(async () => {
  await resetDb();
  mailer = new InMemoryMailer();
  setMailer(mailer);
  fx = await makeFamily();
});
afterEach(() => setMailer(null));

const create = (body: Record<string, unknown>, as = mariana(), opts = {}) =>
  withClock(NOW, () => call(as, "POST", "/api/v1/members", body, opts));
const family = (as = mariana()) => withClock(NOW, () => call(as, "GET", "/api/v1/family"));
const invite = (email: string, as = mariana()) =>
  withClock(NOW, () => call(as, "POST", "/api/v1/invitations", { email, role: "MEMBER" }));

describe("092b cadastro", () => {
  it("ADMIN cadastra Ana: 201, aparece sem conta, e-mail só para ADMIN, sem e-mail enviado nem cota", async () => {
    const res = await create({ name: "Ana", email: "Ana@Exemplo.com" });
    expect(res.status).toBe(201);
    expect(res.body.member).toMatchObject({
      name: "Ana",
      email: null,
      pendingEmail: "ana@exemplo.com",
      role: "MEMBER",
      unlinked: true,
      canChangeRole: false,
    });
    const row = await db.member.findUniqueOrThrow({ where: { id: res.body.member.memberId } });
    expect(row).toMatchObject({
      userId: null,
      role: "MEMBER",
      name: "Ana",
      createdByMemberId: fx.byName.Mariana?.memberId,
    });
    const asAdmin = (await family(mariana())).body.members.find(
      (m: { name: string }) => m.name === "Ana",
    );
    expect(asAdmin).toMatchObject({ unlinked: true, email: null, pendingEmail: "ana@exemplo.com" });
    const asMember = (await family(lucas())).body.members.find(
      (m: { name: string }) => m.name === "Ana",
    );
    expect(asMember).toMatchObject({ unlinked: true, email: null });
    expect("pendingEmail" in asMember).toBe(false);
    expect(mailer.sent).toHaveLength(0);
    expect(await db.mcpRateBucket.count({ where: { key: { startsWith: "invite:" } } })).toBe(0);
    expect(await db.invitation.count()).toBe(0);
  });

  it("só nome e e-mail vazio são aceitos; e-mail opcional guardado", async () => {
    expect((await create({ name: "Ana", email: "" })).status).toBe(201);
    const row = await db.member.findFirstOrThrow({ where: { name: "Ana" } });
    expect(row.pendingEmail).toBeNull();
  });

  it("MEMBER => 403; ator de outra família cria só na própria (canário)", async () => {
    expect((await create({ name: "Ana" }, lucas())).status).toBe(403);
    expect((await create({ name: "Ana" }, null)).status).toBe(401);
    const other = await makeFamily({ uniqueEmails: true, name: "Outra" });
    const res = await create({ name: "Bia" }, other.byName.Mariana?.as);
    expect(res.status).toBe(201);
    const row = await db.member.findUniqueOrThrow({ where: { id: res.body.member.memberId } });
    expect(row.familyId).toBe(other.family.id);
    expect(await db.member.count({ where: { familyId: fx.family.id, userId: null } })).toBe(0);
  });

  it("NAME_TAKEN para 'ana', 'ÁNA', ' Ana ' e para o nome de um membro com conta; ex-membro permite", async () => {
    expect((await create({ name: "Ana" })).status).toBe(201);
    for (const n of ["ana", "ÁNA", "  Ana  ", "Lucas Silva", "lucas silva"]) {
      const res = await create({ name: n });
      expect(res.status, n).toBe(409);
      expect(res.body.error.code).toBe("NAME_TAKEN");
      expect(res.body.error.message).toBe("Já existe um membro com este nome");
    }
    await makeUnlinkedMember(fx, { name: "Duda", removedAt: new Date("2026-10-01T00:00:00Z") });
    expect((await create({ name: "Duda" })).status).toBe(201);
  });

  it("e-mail: de membro com conta, de outro cadastro, com convite pendente, vencido e de ex-membro", async () => {
    const dup = await create({ name: "Lucas Filho", email: "lucas@exemplo.com" });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toMatchObject({
      code: "DUPLICATE_MEMBER",
      message: "Este e-mail já pertence a outro membro",
    });
    expect((await create({ name: "Ana", email: "ana@exemplo.com" })).status).toBe(201);
    const other = await create({ name: "Ana2", email: "ANA@exemplo.com" });
    expect(other.status).toBe(409);
    expect(other.body.error.code).toBe("EMAIL_BELONGS_TO_OTHER_MEMBER");

    expect((await invite("novo@exemplo.com")).status).toBe(201);
    const pend = await create({ name: "Novo", email: "novo@exemplo.com" });
    expect(pend.status).toBe(409);
    expect(pend.body.error.code).toBe("EMAIL_HAS_PENDING_INVITATION");

    await db.invitation.updateMany({
      where: { email: "novo@exemplo.com" },
      data: { expiresAt: new Date("2026-11-01T00:00:00Z") },
    });
    expect((await create({ name: "Novo", email: "novo@exemplo.com" })).status).toBe(201);
    expect(
      (await db.invitation.findFirstOrThrow({ where: { email: "novo@exemplo.com" } })).status,
    ).toBe("EXPIRED");

    const ex = await asUser("ex@exemplo.com", { name: "Ex Silva" });
    await db.member.create({
      data: {
        familyId: fx.family.id,
        userId: ex.userId,
        role: "MEMBER",
        removedAt: new Date("2026-10-01T00:00:00Z"),
        removalKind: "REMOVED",
      },
    });
    expect((await create({ name: "Ex Novo", email: "ex@exemplo.com" })).status).toBe(201);
  });

  it("e-mail de cadastro em OUTRA família não gera erro (sem oráculo)", async () => {
    const other = await makeFamily({ uniqueEmails: true, name: "Outra" });
    await makeUnlinkedMember(other, { name: "Zeca", pendingEmail: "zeca@exemplo.com" });
    expect((await create({ name: "Zeca", email: "zeca@exemplo.com" })).status).toBe(201);
  });

  it("convite comum para o e-mail de um cadastro => 409 EMAIL_BELONGS_TO_UNLINKED_MEMBER, sem cota", async () => {
    await create({ name: "Ana", email: "ana@exemplo.com" });
    const res = await invite("ana@exemplo.com");
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({
      code: "EMAIL_BELONGS_TO_UNLINKED_MEMBER",
      message: "Este e-mail é do cadastro de Ana. Convide pelo cadastro dele(a).",
    });
    expect(await db.mcpRateBucket.count({ where: { key: { startsWith: "invite:" } } })).toBe(0);
    expect(await db.invitation.count()).toBe(0);
    expect(mailer.sent).toHaveLength(0);
  });

  it("concorrência: mesmo nome ou mesmo e-mail simultâneos => 1 vence; cadastro x convite => 1 sobrevive", async () => {
    const byName = await Promise.all([create({ name: "Ana" }), create({ name: "Ana" })]);
    expect(byName.map((r) => r.status).sort()).toEqual([201, 409]);
    const byMail = await Promise.all([
      create({ name: "Bia", email: "b@exemplo.com" }),
      create({ name: "Bea", email: "b@exemplo.com" }),
    ]);
    expect(byMail.map((r) => r.status).sort()).toEqual([201, 409]);
    const mixed = await Promise.all([
      create({ name: "Cris", email: "c@exemplo.com" }),
      invite("c@exemplo.com"),
    ]);
    expect(mixed.map((r) => r.status).sort()).toEqual([201, 409]);
    const mails = await db.member.count({ where: { pendingEmail: "c@exemplo.com" } });
    const invs = await db.invitation.count({
      where: { email: "c@exemplo.com", status: "PENDING" },
    });
    expect(mails + invs).toBe(1);
  });

  it("idempotência: mesma chave => mesma resposta e 1 linha; chave com outro corpo => erro", async () => {
    const key = randomUUID();
    const a = await create({ name: "Ana" }, mariana(), { idempotencyKey: key });
    const b = await create({ name: "Ana" }, mariana(), { idempotencyKey: key });
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(b.body.member.memberId).toBe(a.body.member.memberId);
    expect(await db.member.count({ where: { name: "Ana" } })).toBe(1);
    const c = await create({ name: "Outra" }, mariana(), { idempotencyKey: key });
    expect(c.status).toBe(422);
    expect(c.body.error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("SEC-063b/068: invisíveis e compatibilidade colidem; reservados; teto 20; .strict()", async () => {
    expect((await create({ name: "Ana" })).status).toBe(201);
    for (const n of ["Ana​", "Ａna"]) {
      const r = await create({ name: n });
      expect(r.status, n).toBe(409);
      expect(r.body.error.code).toBe("NAME_TAKEN");
    }
    for (const n of ["Conta excluída", "Administrador", "Sem acesso ao app"]) {
      const r = await create({ name: n });
      expect(r.status, n).toBe(422);
      expect(r.body.error.code).toBe("NAME_RESERVED");
    }
    for (const body of [
      { name: "X", email: "" },
      { name: "A".repeat(61) },
      { name: "Zé", joinedAt: "2020-01-01" },
      { name: "Zé", role: "ADMIN" },
      { name: "Zé", userId: fx.byName.Lucas?.userId },
      { name: "Zé", email: "invalido" },
    ]) {
      expect((await create(body)).status).toBe(400);
    }
    for (let i = 1; i <= 19; i++) {
      expect((await create({ name: `Membro ${String.fromCharCode(65 + i)}${i}` })).status).toBe(
        201,
      );
    }
    const over = await create({ name: "Vigésimo primeiro" });
    expect(over.status).toBe(422);
    expect(over.body.error).toMatchObject({
      code: "UNLINKED_MEMBER_LIMIT",
      message: "A família já tem 20 membros sem acesso ao app.",
    });
  });

  it("MEMBER_CREATED só guarda hasEmail; e-mail só em members.pendingEmail", async () => {
    const res = await create({ name: "Ana", email: "ana.secreta@exemplo.com" });
    const ev = await db.familyEvent.findFirstOrThrow({ where: { type: "MEMBER_CREATED" } });
    expect(ev.changes).toEqual({ hasEmail: true });
    expect(ev.actorMemberId).toBe(fx.byName.Mariana?.memberId);
    expect(ev.targetMemberId).toBe(res.body.member.memberId);
    const residue = await findResidue(["ana.secreta@exemplo.com"]);
    // a resposta idempotente cita o e-mail; a remoção a apaga (scrubIdempotencyMentioning, 092a)
    expect(Object.keys(residue).sort()).toEqual([
      "idempotency_records.responseBody",
      "members.pendingEmail",
    ]);
    const hist = (await family()).body.events[0];
    expect(hist).toMatchObject({ type: "MEMBER_CREATED", actor: { name: "Mariana Silva" } });
    expect(hist.target.name).toBe("Ana");
  });

  it("Q-TL-U1: despesa dividida EQUAL criada depois inclui o cadastrado; antigas não mudam; PROPORTIONAL fica stale", async () => {
    const eq = await makeFamily({ uniqueEmails: true, splitEngine: "STORED", name: "Stored" });
    const acc = await makeAccount(eq, { name: "Conta", openingBalanceInCents: 100000 });
    const before = await makeTransaction(eq, {
      account: acc,
      category: "Supermercado",
      amountInCents: 9000,
      occurredOn: "2026-11-02",
      split: { mode: "RULE" },
    });
    const beforeSplits = await db.transactionSplit.findMany({
      where: { transactionId: before.id },
      orderBy: { memberId: "asc" },
    });
    expect(beforeSplits).toHaveLength(2);
    const admin = eq.byName.Mariana?.as ?? null;
    const res = await create({ name: "Ana" }, admin);
    expect(res.status).toBe(201);
    const after = await makeTransaction(eq, {
      account: acc,
      category: "Supermercado",
      amountInCents: 9000,
      occurredOn: "2026-11-03",
      split: { mode: "RULE" },
    });
    expect(await db.transactionSplit.count({ where: { transactionId: after.id } })).toBe(3);
    expect(
      await db.transactionSplit.findMany({
        where: { transactionId: before.id },
        orderBy: { memberId: "asc" },
      }),
    ).toEqual(beforeSplits);

    const pf = await makeFamily({ uniqueEmails: true, name: "Prop" });
    const padm = pf.byName.Mariana?.as ?? null;
    const m = pf.byName.Mariana?.memberId;
    const l = pf.byName.Lucas?.memberId;
    const put = await withClock(NOW, () =>
      call(padm, "PUT", "/api/v1/split-rule", {
        kind: "PROPORTIONAL",
        shares: [
          { memberId: m, bps: 6000 },
          { memberId: l, bps: 4000 },
        ],
      }),
    );
    expect(put.status).toBe(201);
    const ana = await create({ name: "Ana" }, padm);
    const rule = await withClock(NOW, () => call(padm, "GET", "/api/v1/split-rule"));
    expect(rule.body.stale).toBe(true);
    expect(rule.body.members.find((x: { name: string }) => x.name === "Ana")).toMatchObject({
      unlinked: true,
    });
    const fix = await withClock(NOW, () =>
      call(padm, "PUT", "/api/v1/split-rule", {
        kind: "PROPORTIONAL",
        shares: [
          { memberId: m, bps: 6000 },
          { memberId: l, bps: 4000 },
          { memberId: ana.body.member.memberId, bps: 0 },
        ],
      }),
    );
    expect(fix.status).toBe(201);
  });

  it("seletores: o cadastrado vem com unlinked em /family, /accounts e /transactions", async () => {
    const res = await create({ name: "Ana" });
    const id = res.body.member.memberId;
    const acc = await makeAccount(fx, { name: "Conta da Ana", owner: "Mariana" });
    await db.bankAccount.update({ where: { id: acc.id }, data: { ownerMemberId: id } });
    const accounts = await withClock(NOW, () => call(mariana(), "GET", "/api/v1/accounts"));
    const mine = accounts.body.items.find((a: { name: string }) => a.name === "Conta da Ana");
    expect(mine.owner).toMatchObject({ id, name: "Ana", unlinked: true });
  });
});

describe("092b CHECK members_linked_has_user_chk (revisão TL a73c88e)", () => {
  it("linkedAt sem conta é recusado; com conta é aceito", async () => {
    const u = await makeUnlinkedMember(fx, { name: "Ana" });
    await expect(
      db.$executeRaw`UPDATE members SET "linkedAt" = now() WHERE id = ${u.memberId}::uuid`,
    ).rejects.toThrow();
    await expect(
      db.member.create({
        data: {
          familyId: fx.family.id,
          userId: null,
          name: "Bia",
          role: "MEMBER",
          linkedAt: new Date(),
        },
      }),
    ).rejects.toThrow(/members_linked_has_user_chk/);
    const c = await db.$queryRaw<Array<{ conname: string; convalidated: boolean }>>`
      SELECT conname, convalidated FROM pg_constraint WHERE conname = 'members_linked_has_user_chk'`;
    expect(c).toEqual([{ conname: "members_linked_has_user_chk", convalidated: true }]);
  });
});
