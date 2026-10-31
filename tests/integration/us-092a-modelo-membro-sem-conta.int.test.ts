import { beforeEach, describe, expect, it } from "vitest";
import { endUserSessions } from "@/lib/auth/session";
import { withClock } from "@/lib/clock";
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

// US-092a (SDD-033 §8.2): modelo do membro sem conta (userId nulo), gatilho do vínculo e leitura segura.
const db = testDb();
const NOW = "2026-11-05T15:00:00Z";
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
let fx: FamilyFixture;
const as = (n: string) => fx.byName[n]?.as ?? null;
const idOf = (n: string) => fx.byName[n]?.memberId as string;

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
});

const linkTx = (id: string, sql: (tx: typeof db) => Promise<unknown>, guc = id) =>
  db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.link_member', ${guc}, true)`;
    return sql(tx as never);
  });

describe("092a migração e esquema", () => {
  it("linhas existentes intactas; colunas, CHECKs, índices e gatilho existem", async () => {
    expect(await db.member.count({ where: { userId: null } })).toBe(0);
    const cols = await db.$queryRaw<Array<{ column_name: string; is_nullable: string }>>`
      SELECT column_name, is_nullable FROM information_schema.columns
      WHERE table_name = 'members' AND column_name IN ('userId','name','pendingEmail','linkedAt','createdByMemberId')`;
    expect(cols.map((c) => c.column_name).sort()).toEqual([
      "createdByMemberId",
      "linkedAt",
      "name",
      "pendingEmail",
      "userId",
    ]);
    expect(cols.every((c) => c.is_nullable === "YES")).toBe(true);
    const inv = await db.$queryRaw<Array<{ column_name: string }>>`
      SELECT column_name FROM information_schema.columns WHERE table_name = 'invitations' AND column_name = 'memberId'`;
    expect(inv).toHaveLength(1);
    const trg = await db.$queryRaw<Array<{ tgname: string }>>`
      SELECT tgname FROM pg_trigger WHERE tgrelid = 'members'::regclass AND tgname = 'members_link_guard'`;
    expect(trg).toHaveLength(1);
    const fn = await db.$queryRaw<Array<{ proconfig: string[] }>>`
      SELECT proconfig FROM pg_proc WHERE proname = 'members_link_guard'`;
    expect(fn[0]?.proconfig).toContain("search_path=pg_catalog, public");
    const enums = await db.$queryRaw<Array<{ enumlabel: string }>>`
      SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid WHERE t.typname = 'FamilyEventType'`;
    for (const v of ["MEMBER_CREATED", "MEMBER_UPDATED", "MEMBER_LINKED"]) {
      expect(enums.map((e) => e.enumlabel)).toContain(v);
    }
  });
});

describe("092a CHECKs (SQL cru)", () => {
  const base = () => ({ familyId: fx.family.id });
  it("sem conta exige nome, papel MEMBER; pendingEmail só em ativo sem conta; nome 2..60; e-mail minúsculo", async () => {
    const mk = (data: Record<string, unknown>) =>
      db.member.create({ data: { ...base(), role: "MEMBER", ...data } as never });
    await expect(mk({ userId: null })).rejects.toThrow(); // sem nome
    await expect(mk({ userId: null, name: "Ana", role: "ADMIN" })).rejects.toThrow();
    await expect(
      mk({ userId: (await asUser("novo1@exemplo.com")).userId, pendingEmail: "a@b.com" }),
    ).rejects.toThrow(); // com conta
    await expect(
      mk({ userId: null, name: "Ana", pendingEmail: "a@b.com", removedAt: new Date() }),
    ).rejects.toThrow(); // removido
    await expect(mk({ userId: null, name: "A" })).rejects.toThrow(); // 1 caractere
    await expect(mk({ userId: null, name: "A".repeat(61) })).rejects.toThrow();
    await expect(
      mk({ userId: null, name: "Ana", pendingEmail: "Ana@Exemplo.com" }),
    ).rejects.toThrow();
    // válidos
    await expect(mk({ userId: null, name: "Ab" })).resolves.toBeTruthy();
    await expect(
      mk({ userId: null, name: "A".repeat(60), pendingEmail: "a@b.com" }),
    ).resolves.toBeTruthy();
  });

  it("pendingEmail único por família (livre em famílias diferentes)", async () => {
    await makeUnlinkedMember(fx, { name: "Ana", pendingEmail: "ana@exemplo.com" });
    await expect(
      makeUnlinkedMember(fx, { name: "Ana2", pendingEmail: "ana@exemplo.com" }),
    ).rejects.toThrow();
    const other = await makeFamily({ uniqueEmails: true, name: "Outra" });
    await expect(
      makeUnlinkedMember(other, { name: "Ana", pendingEmail: "ana@exemplo.com" }),
    ).resolves.toBeTruthy();
  });
});

describe("092a gatilho do vínculo (members_link_guard)", () => {
  it("recusa trocar userId (A ➔ B) e voltar a NULL", async () => {
    const other = await asUser("outro@exemplo.com");
    await expect(
      db.$executeRaw`UPDATE members SET "userId" = ${other.userId}::uuid WHERE id = ${idOf("Lucas")}::uuid`,
    ).rejects.toThrow(/userId não troca/);
    await expect(
      db.$executeRaw`UPDATE members SET "userId" = NULL, name = 'Lu' WHERE id = ${idOf("Lucas")}::uuid`,
    ).rejects.toThrow();
  });

  it("recusa vínculo fora do aceite (sem GUC) e com GUC de outro membro", async () => {
    const u = await makeUnlinkedMember(fx, { name: "Ana" });
    const user = await asUser("ana@exemplo.com");
    await expect(
      db.$executeRaw`UPDATE members SET "userId" = ${user.userId}::uuid, "linkedAt" = now() WHERE id = ${u.memberId}::uuid`,
    ).rejects.toThrow(/fora do aceite/);
    await expect(
      linkTx(
        u.memberId,
        (tx) =>
          tx.$executeRaw`UPDATE members SET "userId" = ${user.userId}::uuid, "linkedAt" = now() WHERE id = ${u.memberId}::uuid`,
        idOf("Lucas"),
      ),
    ).rejects.toThrow(/fora do aceite/);
  });

  it("recusa vínculo inválido: removido, sem linkedAt, com pendingEmail, mudando joinedAt", async () => {
    const user = await asUser("ana@exemplo.com");
    const run = (id: string, set: string) =>
      linkTx(id, (tx) =>
        (tx as never as typeof db).$executeRawUnsafe(
          `UPDATE members SET "userId" = '${user.userId}'::uuid, ${set} WHERE id = '${id}'::uuid`,
        ),
      );
    const a = await makeUnlinkedMember(fx, { name: "Ana", pendingEmail: "ana@exemplo.com" });
    await expect(run(a.memberId, `"linkedAt" = now()`)).rejects.toThrow(/vínculo inválido|check/i); // pendingEmail
    await expect(run(a.memberId, `"pendingEmail" = NULL`)).rejects.toThrow(/vínculo inválido/); // sem linkedAt
    await expect(
      run(
        a.memberId,
        `"pendingEmail" = NULL, "linkedAt" = now(), "joinedAt" = now() + interval '1 day'`,
      ),
    ).rejects.toThrow(/vínculo inválido/);
    const gone = await makeUnlinkedMember(fx, { name: "Beto", removedAt: new Date() });
    await expect(run(gone.memberId, `"linkedAt" = now()`)).rejects.toThrow(/vínculo inválido/);
  });

  it("aceita o vínculo válido com a GUC do aceite; depois linkedAt e userId ficam imutáveis", async () => {
    const a = await makeUnlinkedMember(fx, { name: "Ana", pendingEmail: "ana@exemplo.com" });
    const user = await asUser("ana@exemplo.com");
    await linkTx(
      a.memberId,
      (tx) =>
        tx.$executeRaw`UPDATE members SET "userId" = ${user.userId}::uuid, "linkedAt" = now(), "pendingEmail" = NULL WHERE id = ${a.memberId}::uuid`,
    );
    const row = await db.member.findUniqueOrThrow({ where: { id: a.memberId } });
    expect(row.userId).toBe(user.userId);
    expect(row.linkedAt).not.toBeNull();
    await expect(
      db.$executeRaw`UPDATE members SET "linkedAt" = now() + interval '1 day' WHERE id = ${a.memberId}::uuid`,
    ).rejects.toThrow(/linkedAt imutável/);
  });

  it("linkedAt fora do vínculo e troca de familyId/createdByMemberId são recusados", async () => {
    const a = await makeUnlinkedMember(fx, { name: "Ana" });
    await expect(
      db.$executeRaw`UPDATE members SET "linkedAt" = now() WHERE id = ${a.memberId}::uuid`,
    ).rejects.toThrow(/linkedAt só no vínculo/);
    const other = await makeFamily({ uniqueEmails: true, name: "Outra" });
    await expect(
      db.$executeRaw`UPDATE members SET "familyId" = ${other.family.id}::uuid WHERE id = ${a.memberId}::uuid`,
    ).rejects.toThrow();
    await expect(
      db.$executeRaw`UPDATE members SET "createdByMemberId" = ${idOf("Lucas")}::uuid WHERE id = ${a.memberId}::uuid`,
    ).rejects.toThrow(/imutáveis/);
  });

  it("aceita os UPDATEs do código atual: removedAt, role, assistantReviewedAt, removalNoticeAt e joinedAt fora do vínculo", async () => {
    const id = idOf("Lucas");
    await db.member.update({ where: { id }, data: { role: "ADMIN" } });
    await db.member.update({ where: { id }, data: { assistantReviewedAt: new Date() } });
    await db.member.update({ where: { id }, data: { joinedAt: new Date("2026-02-02T00:00:00Z") } });
    await db.member.update({
      where: { id },
      data: { removedAt: new Date(), removalKind: "LEFT", removalNoticeAt: new Date() },
    });
  });
});

describe("092a SEC-058: nada de userId vazio/undefined", () => {
  it("endUserSessions com '' e undefined devolve 0 e nenhuma sessão de outro usuário muda", async () => {
    const three = await makeFamily({
      uniqueEmails: true,
      members: [
        { email: "a@exemplo.com", name: "A Silva", role: "ADMIN" },
        { email: "b@exemplo.com", name: "B Silva", role: "MEMBER" },
        { email: "c@exemplo.com", name: "C Silva", role: "MEMBER" },
      ],
    });
    expect(three.members).toHaveLength(3);
    const before = await db.session.count({ where: { endedAt: null } });
    expect(before).toBeGreaterThanOrEqual(3);
    expect(await endUserSessions(db, "" as never, new Date())).toBe(0);
    expect(await endUserSessions(db, undefined as never, new Date())).toBe(0);
    expect(await db.session.count({ where: { endedAt: null } })).toBe(before);
  });
});

describe("092a R2/R3: ex-membro sem conta nunca 'volta' (ownerStanding, exportação, sugestões)", () => {
  async function scenario() {
    const acc = await makeAccount(fx, {
      name: "Conta",
      owner: "Mariana",
      openingBalanceInCents: 500000,
    });
    const x = await makeUnlinkedMember(fx, {
      name: "Xavier",
      removedAt: new Date("2026-10-20T00:00:00Z"),
      register: true,
    });
    await makeUnlinkedMember(fx, { name: "Yara", register: true }); // outro sem conta ATIVO
    const t = await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: 30000,
      occurredOn: "2026-10-02",
      payer: "Xavier",
      author: "Mariana",
      shared: false,
      description: "Farmácia",
    });
    return { x, t };
  }
  const patch = async (who: string, id: string, body: Record<string, unknown>) => {
    const row = await db.transaction.findUniqueOrThrow({ where: { id } });
    return at(() =>
      call(as(who), "PATCH", `/api/v1/transactions/${id}`, { version: row.version, ...body }),
    );
  };

  it("R2: 'Só meu' do ex-membro sem conta: Admin edita (D-GES-52), membro comum não; pagador imutável (D-GES-59)", async () => {
    const { t } = await scenario();
    const lucas = await patch("Lucas", t.id, { description: "Outra" });
    expect(lucas.status).toBe(403);
    const admin = await patch("Mariana", t.id, { description: "Remédio" });
    expect(admin.status, JSON.stringify(admin.body)).toBe(200);
    const payer = await patch("Mariana", t.id, { payerMemberId: idOf("Mariana") });
    expect(payer.status).toBe(403);
    expect(payer.body.error.message).toMatch(/ex-membro e não pode ser alterado/);
  });

  it("R3: a observação de dividida de ex-membro sem conta não vai no arquivo dos demais (SEC-050)", async () => {
    const { t } = await scenario();
    await db.transaction.update({ where: { id: t.id }, data: { note: "segredo do Xavier" } });
    expect((await patch("Mariana", t.id, { isSharedExpense: true })).status).toBe(200);
    const exp = async (who: string) =>
      (
        await at(() => call(as(who), "GET", "/api/v1/me/export"))
      ).body.familiaAtual.lancamentos.find((l: { id: string }) => l.id === t.id);
    expect((await exp("Lucas")).descricao).toBe("Farmácia");
    expect((await exp("Lucas")).observacao).toBeNull();
    expect((await exp("Mariana")).observacao).toBe("segredo do Xavier"); // quem lançou (autor) vê o seu
  });
});

describe("092a R3: sugestões de categoria tratam o ex-membro sem conta como ex-membro", () => {
  it("'Só meu' de Xavier (removido, sem conta): o Admin (não controlador) recebe a sugestão; sem a correção a regra o trataria como dono ativo", async () => {
    const acc = await makeAccount(fx, {
      name: "Do Lucas",
      owner: "Lucas",
      openingBalanceInCents: 1_000_000,
    });
    await makeUnlinkedMember(fx, {
      name: "Xavier",
      removedAt: new Date("2026-10-20T00:00:00Z"),
      register: true,
    });
    await makeUnlinkedMember(fx, { name: "Yara", register: true }); // sem conta ATIVO: o cadastro que o bug faria "voltar"
    const mk = async (category: string, i: number) => {
      const d = new Date("2026-07-02T00:00:00Z");
      d.setUTCDate(d.getUTCDate() + i * 9);
      return makeTransaction(fx, {
        account: acc,
        category,
        amountInCents: 4_500 + i,
        description: "Droga Raia",
        occurredOn: d.toISOString().slice(0, 10),
        author: "Lucas",
        payer: "Xavier",
        shared: false,
      });
    };
    let last = "";
    for (let i = 0; i < 9; i++) await mk("Saúde", i);
    last = (await mk("Lazer e restaurantes", 9)).id;
    const list = (who: string) =>
      at(() => call(as(who), "GET", "/api/v1/category-suggestions")).then(
        (r) => r.body.items as Array<{ transactionId: string }>,
      );
    expect((await list("Mariana")).map((i) => i.transactionId)).toContain(last);
  });
});

describe("092a contagens, papel, remoção e exclusões", () => {
  async function adminAndUnlinked() {
    const solo = await makeFamily({
      uniqueEmails: true,
      name: "Solo",
      members: [{ email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" }],
    });
    const u = await makeUnlinkedMember(solo, { name: "Bia" });
    return { solo, u };
  }

  it("Admin + 1 sem conta: Admin não sai (ONLY_MEMBER), excluir conta dá SOLE_MEMBER, excluir a família é permitida", async () => {
    const { solo, u } = await adminAndUnlinked();
    const m = solo.byName.Mariana?.as ?? null;
    const leave = await at(() => call(m, "POST", "/api/v1/family/leave", {}));
    expect(leave.status).toBe(422);
    expect(leave.body.error.details.blockers.map((b: { code: string }) => b.code)).toContain(
      "ONLY_MEMBER",
    );
    const del = await at(() =>
      call(m, "POST", "/api/v1/me/delete-account", { confirmEmail: m?.email }),
    );
    expect(del.status).toBe(409);
    expect(del.body.error.code).toBe("SOLE_MEMBER");
    const fam = await at(() =>
      call(m, "POST", "/api/v1/family/delete", { confirmFamilyName: solo.family.name }),
    );
    expect(fam.status, JSON.stringify(fam.body)).toBe(200);
    expect(await db.member.count({ where: { id: u.memberId } })).toBe(0);
  });

  it("Admin remove o sem conta sem ONLY_MEMBER; pendências valem como hoje (conta com saldo)", async () => {
    const { solo, u } = await adminAndUnlinked();
    const m = solo.byName.Mariana?.as ?? null;
    const acc = await makeAccount(solo, {
      name: "Da Bia",
      owner: "Mariana",
      openingBalanceInCents: 1000,
    });
    await db.bankAccount.update({ where: { id: acc.id }, data: { ownerMemberId: u.memberId } });
    const blocked = await at(() => call(m, "POST", `/api/v1/members/${u.memberId}/remove`, {}));
    expect(blocked.status).toBe(422);
    const codes = blocked.body.error.details.blockers.map((b: { code: string }) => b.code);
    expect(codes).toContain("ACCOUNT_NEEDS_OWNER");
    expect(codes).not.toContain("ONLY_MEMBER");
    const ok = await at(() =>
      call(m, "POST", `/api/v1/members/${u.memberId}/remove`, {
        reassign: { accounts: { [acc.id]: solo.byName.Mariana?.memberId } },
      }),
    );
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
  });

  it("remoção de sem conta: pendingEmail some, nada de sessão/concessão, convites cancelados e anonimizados", async () => {
    const u = await makeUnlinkedMember(fx, {
      name: "Bia",
      pendingEmail: "bia.segredo@exemplo.com",
    });
    await db.invitation.create({
      data: {
        familyId: fx.family.id,
        email: "bia.segredo@exemplo.com",
        role: "MEMBER",
        tokenHash: "h".repeat(64),
        expiresAt: new Date("2027-01-01T00:00:00Z"),
        invitedByMemberId: idOf("Mariana"),
        emailStatus: "SENT",
        memberId: u.memberId,
      },
    });
    const sessions = await db.session.count({ where: { endedAt: null } });
    const res = await at(() =>
      call(as("Mariana"), "POST", `/api/v1/members/${u.memberId}/remove`, {}),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const row = await db.member.findUniqueOrThrow({ where: { id: u.memberId } });
    expect(row.removedAt).not.toBeNull();
    expect(row.removalKind).toBe("REMOVED");
    expect(row.pendingEmail).toBeNull();
    expect(await db.session.count({ where: { endedAt: null } })).toBe(sessions);
    const inv = await db.invitation.findFirstOrThrow({ where: { memberId: u.memberId } });
    expect(inv.status).toBe("CANCELED");
    expect(inv.email).toBe(`deleted+${u.memberId}@invalid.local`);
    expect(await findResidue(["bia.segredo@exemplo.com"])).toEqual({});
  });

  it("PATCH /members/{semConta} ➔ 422 UNLINKED_MEMBER_ROLE e nada escrito", async () => {
    const u = await makeUnlinkedMember(fx, { name: "Bia" });
    const eventsBefore = await db.familyEvent.count();
    const res = await at(() =>
      call(as("Mariana"), "PATCH", `/api/v1/members/${u.memberId}`, { role: "ADMIN" }),
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("UNLINKED_MEMBER_ROLE");
    expect((await db.member.findUniqueOrThrow({ where: { id: u.memberId } })).role).toBe("MEMBER");
    expect(await db.familyEvent.count()).toBe(eventsBefore);
  });

  it("excluir a conta de quem tem members.name zera o nome e o exibido vira 'Conta excluída'", async () => {
    await db.member.update({ where: { id: idOf("Lucas") }, data: { name: "Bia Escolhida" } });
    const lucas = as("Lucas");
    const res = await at(() =>
      call(lucas, "POST", "/api/v1/me/delete-account", { confirmEmail: lucas?.email }),
    );
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await db.member.findUniqueOrThrow({ where: { id: idOf("Lucas") } })).name).toBeNull();
    const fam = await at(() => call(as("Mariana"), "GET", "/api/v1/family"));
    expect(JSON.stringify(fam.body)).not.toContain("Bia Escolhida");
    expect(fam.body.exMembers.map((e: { name: string }) => e.name)).toContain("Conta excluída");
    expect(await findResidue(["Bia Escolhida"])).toEqual({});
  });
});

describe("092a D-033-4 e leitura pelas telas", () => {
  it("sem conta ativo: 'Só meu' em nome dele por Admin ➔ 403; dividida com ele de pagador por membro comum ➔ 201", async () => {
    const acc = await makeAccount(fx, {
      name: "Conta",
      owner: "Mariana",
      openingBalanceInCents: 500000,
    });
    const u = await makeUnlinkedMember(fx, { name: "Bia" });
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: "Supermercado" },
    });
    const body = (payer: string, shared: boolean) => ({
      type: "EXPENSE",
      amountInCents: 1000,
      accountId: acc.id,
      categoryId: cat.id,
      payerMemberId: payer,
      isSharedExpense: shared,
    });
    const personal = await at(() =>
      call(as("Mariana"), "POST", "/api/v1/transactions", {
        ...body(u.memberId, false),
        type: "EXPENSE",
        categoryId: cat.id,
      }),
    );
    expect(personal.status, JSON.stringify(personal.body)).toBe(403);
    expect(personal.body.error.code).toBe("PERSONAL_ON_BEHALF_FORBIDDEN");
    const shared = await at(() =>
      call(as("Lucas"), "POST", "/api/v1/transactions", {
        ...body(u.memberId, true),
        type: "EXPENSE",
        categoryId: cat.id,
      }),
    );
    expect(shared.status, JSON.stringify(shared.body)).toBe(201);
    expect(shared.body.transaction?.author?.id ?? shared.body.author?.id).toBe(idOf("Lucas"));
  });

  it("GET /family: sem conta aparece com unlinked, e-mail nulo e sem troca de papel; sem pendingEmail", async () => {
    await makeUnlinkedMember(fx, { name: "Bia", pendingEmail: "bia@exemplo.com" });
    const res = await at(() => call(as("Lucas"), "GET", "/api/v1/family"));
    const bia = res.body.members.find((m: { name: string }) => m.name === "Bia");
    expect(bia).toMatchObject({
      unlinked: true,
      email: null,
      canChangeRole: false,
      role: "MEMBER",
    });
    expect(JSON.stringify(res.body)).not.toContain("bia@exemplo.com");
  });
});
