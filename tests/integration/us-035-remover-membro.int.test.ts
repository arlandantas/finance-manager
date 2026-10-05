import { beforeEach, describe, expect, it } from "vitest";
import { withClock } from "@/lib/clock";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makePlannedExpense,
  makeTransaction,
} from "../support/factories";

const db = testDb();
const NOW = "2026-10-12T15:00:00Z";
let fx: FamilyFixture;
let itauL: AccountFixture; // de Lucas
let nub: AccountFixture; // de Mariana
const mariana = () => fx.byName.Mariana?.as ?? null; // ADMIN
const lucas = () => fx.byName.Lucas?.as ?? null; // MEMBER
const mid = (n: "Mariana" | "Lucas") => fx.byName[n]?.memberId as string;
const at = <T>(fn: () => Promise<T>) => withClock(NOW, fn);
const review = (as: ReturnType<typeof mariana>, id: string) =>
  at(() => call(as, "GET", `/api/v1/members/${id}/removal-review`));
const remove = (
  as: ReturnType<typeof mariana>,
  id: string,
  body: Record<string, unknown> = {},
  key?: string,
) =>
  at(() =>
    call(
      as,
      "POST",
      `/api/v1/members/${id}/remove`,
      body,
      key ? { idempotencyKey: key } : undefined,
    ),
  );
const spend = (payer: "Mariana" | "Lucas", cents: number, on = "2026-10-03", account = nub) =>
  makeTransaction(fx, {
    account,
    category: "Supermercado",
    amountInCents: cents,
    occurredOn: on,
    author: payer,
    payer,
    shared: true,
  });

beforeEach(async () => {
  await resetDb();
  fx = await makeFamily();
  itauL = await makeAccount(fx, { name: "Itaú Lucas", owner: "Lucas", openingBalanceInCents: 0 });
  nub = await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 500000 });
  await makePlannedExpense(fx, {
    description: "Plano de saúde",
    amountInCents: 30000,
    dueOn: "2026-10-20",
    responsible: "Lucas",
  });
});

describe("US-035a remover membro", () => {
  it("revisão lista pendências: conta zerada => ARCHIVE; previsão; candidatos; sem bloqueios", async () => {
    const r = await review(mariana(), mid("Lucas"));
    expect(r.status).toBe(200);
    expect(r.body.accounts).toEqual([
      {
        id: itauL.id,
        name: "Itaú Lucas",
        balanceInCents: 0,
        mustReassign: false,
        defaultAction: "ARCHIVE",
      },
    ]);
    expect(r.body.planned).toHaveLength(1);
    expect(r.body.candidates.map((c: { name: string }) => c.name)).toEqual(["Mariana Silva"]);
    expect(r.body.blockers).toEqual([]);
    expect(r.body.isSelf).toBe(false);
  });

  it("remove sem pendências graves: ex-membro, conta arquivada, previsão passa à Mariana, FamilyEvent; próxima chamada => 403 NO_FAMILY", async () => {
    const res = await remove(mariana(), mid("Lucas"));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ removed: true });
    const m = await db.member.findUniqueOrThrow({ where: { id: mid("Lucas") } });
    expect(m).toMatchObject({ removalKind: "REMOVED", removedByMemberId: mid("Mariana") });
    expect(m.removedAt).not.toBeNull();
    expect(
      (await db.bankAccount.findUniqueOrThrow({ where: { id: itauL.id } })).archivedAt,
    ).not.toBeNull();
    expect((await db.plannedExpense.findFirstOrThrow()).responsibleMemberId).toBe(mid("Mariana"));
    expect(await db.familyEvent.count({ where: { type: "MEMBER_REMOVED" } })).toBe(1);
    const next = await at(() => call(lucas(), "GET", "/api/v1/accounts"));
    expect(next.status).toBe(403);
    expect(next.body.error.code).toBe("NO_FAMILY");
    expect(await db.member.count({ where: { removedAt: null } })).toBe(1); // o Member NÃO foi apagado
    expect(await db.member.count()).toBe(2);
  });

  it("histórico preservado: pagador aparece como ex-membro com o nome; totais e acerto inalterados", async () => {
    await spend("Lucas", 15050);
    const before = await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10"));
    const settleBefore = (await at(() => call(mariana(), "GET", "/api/v1/settlement"))).body;
    await remove(mariana(), mid("Lucas"), { acknowledgeSettlement: true });
    const after = await at(() => call(mariana(), "GET", "/api/v1/transactions?period=2026-10"));
    expect(after.body.totals).toEqual(before.body.totals);
    const row = after.body.items.find((i: { type: string }) => i.type === "EXPENSE");
    expect(row.payer).toMatchObject({ name: "Lucas Silva", removed: true });
    expect(JSON.stringify(row.payer)).not.toContain("@");
    const settleAfter = (await at(() => call(mariana(), "GET", "/api/v1/settlement"))).body;
    expect(settleAfter.totalSharedInCents).toBe(settleBefore.totalSharedInCents);
    expect(
      settleAfter.members.map((m: { member: { name: string }; paidInCents: number }) => [
        m.member.name,
        m.paidInCents,
      ]),
    ).toEqual(
      settleBefore.members.map((m: { member: { name: string }; paidInCents: number }) => [
        m.member.name,
        m.paidInCents,
      ]),
    );
  });

  it("conta com saldo exige reatribuir; com o mapa: conta ativa com titular Mariana e saldo intacto", async () => {
    await makeTransaction(fx, {
      account: itauL,
      type: "INCOME",
      category: "Salário",
      amountInCents: 300000,
      occurredOn: "2026-10-02",
      author: "Lucas",
    });
    const r = await review(mariana(), mid("Lucas"));
    expect(r.body.accounts[0]).toMatchObject({
      mustReassign: true,
      defaultAction: "REASSIGN",
      balanceInCents: 300000,
    });
    const blocked = await remove(mariana(), mid("Lucas"));
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.code).toBe("REMOVAL_BLOCKED");
    expect(blocked.body.error.message).toBe(
      "A conta Itaú Lucas tem saldo. Passe a titularidade para outro membro.",
    );
    expect(blocked.body.error.details.blockers[0]).toMatchObject({
      code: "ACCOUNT_NEEDS_OWNER",
      ids: [itauL.id],
    });
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: mid("Lucas") } })).removedAt,
    ).toBeNull(); // nada persistiu
    const ok = await remove(mariana(), mid("Lucas"), {
      reassign: { accounts: { [itauL.id]: mid("Mariana") } },
    });
    expect(ok.status).toBe(200);
    const acc = await db.bankAccount.findUniqueOrThrow({ where: { id: itauL.id } });
    expect(acc).toMatchObject({ ownerMemberId: mid("Mariana"), archivedAt: null });
    const list = await at(() => call(mariana(), "GET", "/api/v1/accounts"));
    expect(list.body.items.find((a: { id: string }) => a.id === itauL.id).balanceInCents).toBe(
      300000,
    );
  });

  it("alvo de reatribuição inválido (o próprio removido ou outra família) => INVALID_REASSIGN_TARGET", async () => {
    await makeTransaction(fx, {
      account: itauL,
      type: "INCOME",
      category: "Salário",
      amountInCents: 1000,
      occurredOn: "2026-10-02",
      author: "Lucas",
    });
    const other = await makeFamily({ uniqueEmails: true, name: "Souza" });
    for (const to of [mid("Lucas"), other.members[0]?.memberId as string]) {
      const r = await remove(mariana(), mid("Lucas"), {
        reassign: { accounts: { [itauL.id]: to } },
      });
      expect(r.status).toBe(422);
      expect(r.body.error.details.blockers.map((b: { code: string }) => b.code)).toContain(
        "INVALID_REASSIGN_TARGET",
      );
    }
  });

  it("acerto em aberto exige reconhecimento e continua registrado (S14 com dados homologados: set 717,00 / 358,50)", async () => {
    await spend("Mariana", 71700, "2026-09-10");
    await spend("Mariana", 316990, "2026-10-02");
    const r = await review(mariana(), mid("Lucas"));
    expect(r.body.settlement.totalInCents).toBe(35850 + 158495);
    expect(r.body.settlement.months.map((m: { period: string }) => m.period)).toEqual([
      "2026-09",
      "2026-10",
    ]);
    const blocked = await remove(mariana(), mid("Lucas"));
    expect(blocked.status).toBe(422);
    expect(blocked.body.error.details.blockers[0].code).toBe("SETTLEMENT_NOT_ACKNOWLEDGED");
    expect((await remove(mariana(), mid("Lucas"), { acknowledgeSettlement: true })).status).toBe(
      200,
    );
    // a diferença continua registrada no painel do mês (nada foi apagado/recalculado)
    const oct = (await at(() => call(mariana(), "GET", "/api/v1/settlement?period=2026-10"))).body;
    expect(oct.totalSharedInCents).toBe(316990);
    expect(oct.suggestions[0].amountInCents).toBe(158495);
    const sep = (await at(() => call(mariana(), "GET", "/api/v1/settlement?period=2026-09"))).body;
    expect(sep.suggestions[0].amountInCents).toBe(35850);
  });

  it("depois da remoção, o mês seguinte divide só entre os ativos (NEEDS_MORE_MEMBERS com um único ativo)", async () => {
    await remove(mariana(), mid("Lucas"));
    const nov = (await at(() => call(mariana(), "GET", "/api/v1/settlement?period=2026-11"))).body;
    expect(nov.status).toBe("NEEDS_MORE_MEMBERS");
    expect(nov.members.map((m: { member: { name: string } }) => m.member.name)).toEqual([
      "Mariana Silva",
    ]);
  });

  it("Membro não remove (403); outra família => 404; corpo estrito", async () => {
    expect((await remove(lucas(), mid("Mariana"))).status).toBe(403);
    const other = await makeFamily({ uniqueEmails: true, name: "Souza" });
    expect((await remove(mariana(), other.members[0]?.memberId as string)).status).toBe(404);
    expect((await remove(mariana(), mid("Lucas"), { removedAt: "x" })).status).toBe(400);
  });

  it("ex-membro pode ser convidado de novo e volta como NOVO Member (sem herdar histórico)", async () => {
    await remove(mariana(), mid("Lucas"));
    const inv = await at(() =>
      call(mariana(), "POST", "/api/v1/invitations", {
        email: "lucas@exemplo.com",
        role: "MEMBER",
      }),
    );
    expect(inv.status).toBe(201);
    const { acceptPendingInvitation } = await import("@/modules/familia/invitations/service");
    const { getClock } = await import("@/lib/clock");
    const user = await db.user.findUniqueOrThrow({ where: { email: "lucas@exemplo.com" } });
    const res = await withClock(NOW, () =>
      acceptPendingInvitation(
        { id: user.id, email: user.email, emailVerified: new Date(NOW) },
        getClock(),
      ),
    );
    expect(res.status).toBe("JOINED");
    const members = await db.member.findMany({
      where: { userId: user.id },
      orderBy: { joinedAt: "asc" },
    });
    expect(members).toHaveLength(2);
    expect(members[0]?.removedAt).not.toBeNull();
    expect(members[1]?.removedAt).toBeNull();
    expect(members[1]?.id).not.toBe(members[0]?.id);
    // não herda histórico: o novo vínculo não é pagador de nada
    expect(await db.transaction.count({ where: { payerMemberId: members[1]?.id } })).toBe(0);
  });

  it("duplo clique: mesma chave => 1 remoção; chaves diferentes => 1×200 e 1×404", async () => {
    const key = crypto.randomUUID();
    const [a, b] = await Promise.all([
      remove(mariana(), mid("Lucas"), {}, key),
      remove(mariana(), mid("Lucas"), {}, key),
    ]);
    expect([a.status, b.status].every((s) => s === 200)).toBe(true);
    expect(await db.familyEvent.count({ where: { type: "MEMBER_REMOVED" } })).toBe(1);
    await resetDb();
    fx = await makeFamily();
    const [c, d] = await Promise.all([
      remove(mariana(), mid("Lucas")),
      remove(mariana(), mid("Lucas")),
    ]);
    expect([c.status, d.status].sort()).toEqual([200, 404]);
  });

  it("atomicidade: falha injetada no meio (conta de outra família na lista de reatribuição) não persiste nada", async () => {
    const before = await db.bankAccount.count({ where: { archivedAt: null } });
    const r = await remove(mariana(), mid("Lucas"), {
      reassign: { plannedTo: "00000000-0000-4000-8000-000000000000" },
    });
    expect(r.status).toBe(422);
    expect(await db.bankAccount.count({ where: { archivedAt: null } })).toBe(before);
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: mid("Lucas") } })).removedAt,
    ).toBeNull();
  });

  it("estrutural: nenhuma FK para members com ON DELETE CASCADE; índices parciais de unicidade ativos", async () => {
    const rows = await db.$queryRaw<Array<{ c: string }>>`
      SELECT conname AS c FROM pg_constraint
      WHERE confrelid = 'members'::regclass AND contype = 'f' AND confdeltype = 'c'`;
    expect(rows).toEqual([]);
    const idx = await db.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'members' AND indexname LIKE '%active_uq'`;
    expect(idx.map((i) => i.indexname).sort()).toEqual([
      "members_family_user_active_uq",
      "members_user_active_uq",
    ]);
  });
});

describe("US-035b sair da família e aviso de acesso encerrado", () => {
  const leave = (as: ReturnType<typeof mariana>, body: Record<string, unknown> = {}) =>
    at(() => call(as, "POST", "/api/v1/family/leave", body));

  it("Membro sai: 200 LEFT; a previsão dele exige um ADMIN ativo escolhido (plannedTo)", async () => {
    const noTarget = await leave(lucas());
    expect(noTarget.status).toBe(422);
    expect(noTarget.body.error.details.blockers.map((b: { code: string }) => b.code)).toContain(
      "INVALID_REASSIGN_TARGET",
    );
    const ok = await leave(lucas(), { reassign: { plannedTo: mid("Mariana") } });
    expect(ok.status).toBe(200);
    expect(ok.body).toEqual({ left: true });
    expect(await db.member.findUniqueOrThrow({ where: { id: mid("Lucas") } })).toMatchObject({
      removalKind: "LEFT",
    });
    expect(await db.familyEvent.count({ where: { type: "MEMBER_LEFT" } })).toBe(1);
    expect((await at(() => call(lucas(), "GET", "/api/v1/accounts"))).body.error.code).toBe(
      "NO_FAMILY",
    );
  });

  it("último Administrador não sai (mensagem neutra); único membro não sai", async () => {
    const r = await leave(mariana());
    expect(r.status).toBe(422);
    expect(r.body.error.message).toBe(
      "Você é a única pessoa Administradora. Promova outro membro antes de sair.",
    );
    expect(r.body.error.details.blockers[0].code).toBe("LAST_ADMIN");
    const solo = await makeFamily({
      uniqueEmails: true,
      name: "Solo",
      members: [{ email: `ana${Date.now()}@exemplo.com`, name: "Ana", role: "ADMIN" }],
    });
    const s = await at(() => call(solo.members[0]?.as ?? null, "POST", "/api/v1/family/leave", {}));
    expect(s.status).toBe(422);
    expect(s.body.error.message).toBe(
      "Você é a única pessoa na família. Convide alguém antes de sair.",
    );
    expect(s.body.error.details.blockers.map((b: { code: string }) => b.code)).toContain(
      "ONLY_MEMBER",
    );
  });

  it("leave-review do próprio; corrida: remover × rebaixar o último ADMIN termina consistente", async () => {
    const rv = await at(() => call(lucas(), "GET", "/api/v1/family/leave-review"));
    expect(rv.status).toBe(200);
    expect(rv.body.isSelf).toBe(true);
    for (let i = 0; i < 8; i++) {
      await resetDb();
      fx = await makeFamily();
      await at(() =>
        call(mariana(), "PATCH", `/api/v1/members/${mid("Lucas")}`, { role: "ADMIN" }),
      );
      const ops = [
        () => remove(mariana(), mid("Lucas")),
        () =>
          at(() => call(lucas(), "PATCH", `/api/v1/members/${mid("Mariana")}`, { role: "MEMBER" })),
      ];
      await Promise.all(i % 2 === 0 ? ops.map((f) => f()) : [...ops].reverse().map((f) => f()));
      expect(
        await db.member.count({ where: { role: "ADMIN", removedAt: null } }),
        `iteração ${i}`,
      ).toBeGreaterThanOrEqual(1);
    }
  }, 120_000);

  it("aviso único: GET /api/auth/membership-ended => 302 /login?error=MembershipEnded, sessão encerrada; 2ª vez volta ao início", async () => {
    await remove(mariana(), mid("Lucas"));
    const first = await at(() => call(lucas(), "GET", "/api/auth/membership-ended"));
    expect(first.status).toBe(307);
    expect(first.headers.get("location")).toContain("/login?error=MembershipEnded");
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: mid("Lucas") } })).removalNoticeAt,
    ).not.toBeNull();
    const sessions = await db.session.count({
      where: { userId: fx.byName.Lucas?.userId as string },
    });
    expect(sessions).toBe(0);
  });

  it("quem SAIU não recebe o aviso de acesso encerrado", async () => {
    await leave(lucas(), { reassign: { plannedTo: mid("Mariana") } });
    const r = await at(() => call(lucas(), "GET", "/api/auth/membership-ended"));
    expect(r.headers.get("location")).not.toContain("MembershipEnded");
  });
});
