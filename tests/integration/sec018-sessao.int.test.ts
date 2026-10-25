import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { consumeMembershipEnded } from "@/lib/auth/membership-ended";
import {
  findSessionUser,
  hashSessionToken,
  SESSION_ABSOLUTE_SECONDS,
  SESSION_IDLE_SECONDS,
} from "@/lib/auth/session";
import { hashedSessionAdapter } from "@/lib/auth/session-adapter";
import { call } from "../support/call";
import { resetDb, testDb } from "../support/db";
import { asUser, makeFamily } from "../support/factories";

// SEC-018 (SDD-028 §6): sessão por hash, ociosidade 30 d, prazo absoluto 90 d, encerrar as outras sessões.
const db = testDb();
const DAY = 86_400_000;
const tokenOf = (cookie: string) => cookie.split("=")[1] as string;

beforeEach(resetDb);

describe("SEC-018 sessão guardada só como hash", () => {
  it("reprodução do relatório: o banco não contém o cookie; o hash usado como cookie não autentica", async () => {
    const as = await asUser("lucas@exemplo.com");
    const token = tokenOf(as.cookie);
    const rows = await db.session.findMany();
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows)).not.toContain(token);
    expect(rows[0]?.tokenHash).toBe(createHash("sha256").update(token).digest("hex"));
    expect(rows[0]?.sessionToken).toBeNull();
    expect((await call(as, "GET", "/api/v1/me")).status).toBe(200);
    // vazamento do banco: o valor lido do banco como cookie => 401
    const leaked = { ...as, cookie: `authjs.session-token=${rows[0]?.tokenHash}` };
    expect((await call(leaked, "GET", "/api/v1/me")).status).toBe(401);
  });

  it("o adaptador do Auth.js grava por hash e devolve ao Auth.js o token original", async () => {
    const user = await db.user.create({
      data: { email: "g@exemplo.com", emailVerified: new Date() },
    });
    const adapter = hashedSessionAdapter({} as never, db);
    const expires = new Date(Date.now() + DAY);
    const created = await adapter.createSession?.({
      sessionToken: "tok-abc",
      userId: user.id,
      expires,
    });
    expect(created?.sessionToken).toBe("tok-abc");
    const row = await db.session.findFirstOrThrow();
    expect(row.tokenHash).toBe(hashSessionToken("tok-abc"));
    expect(row.sessionToken).toBeNull();
    const got = await adapter.getSessionAndUser?.("tok-abc");
    expect(got?.session.sessionToken).toBe("tok-abc");
    expect(got?.user.id).toBe(user.id);
    expect(await adapter.getSessionAndUser?.(hashSessionToken("tok-abc"))).toBeNull();
    const upd = await adapter.updateSession?.({
      sessionToken: "tok-abc",
      expires: new Date(Date.now() + 2 * DAY),
    });
    expect(upd?.sessionToken).toBe("tok-abc");
    await adapter.deleteSession?.("tok-abc");
    expect(await db.session.count()).toBe(0);
  });
});

describe("SEC-018 ociosidade e prazo absoluto", () => {
  it("30 dias + 1 s sem uso => null e a linha é apagada", async () => {
    const base = new Date("2026-10-04T12:00:00Z");
    const as = await asUser("lucas@exemplo.com", { now: base });
    const token = tokenOf(as.cookie);
    expect(
      await findSessionUser(db, token, new Date(base.getTime() + 30 * DAY - 1000)),
    ).not.toBeNull();
    // (a leitura acima renovou; recomeça de um login novo)
    await resetDb();
    const as2 = await asUser("lucas@exemplo.com", { now: base });
    const t2 = tokenOf(as2.cookie);
    expect(await findSessionUser(db, t2, new Date(base.getTime() + 30 * DAY + 1000))).toBeNull();
    expect(await db.session.count()).toBe(0);
  });

  it("uso diário por 89 dias segue válido; no dia 90 + 1 s vence (absoluto); a renovação nunca passa de createdAt + 90 d", async () => {
    const base = new Date("2026-01-01T12:00:00Z");
    const as = await asUser("lucas@exemplo.com", { now: base });
    const token = tokenOf(as.cookie);
    for (let d = 1; d <= 89; d++) {
      expect(await findSessionUser(db, token, new Date(base.getTime() + d * DAY))).not.toBeNull();
    }
    const row = await db.session.findFirstOrThrow();
    expect(row.expires.getTime()).toBeLessThanOrEqual(
      base.getTime() + SESSION_ABSOLUTE_SECONDS * 1000,
    );
    expect(row.expires.getTime()).toBe(base.getTime() + SESSION_ABSOLUTE_SECONDS * 1000); // capada
    expect(
      await findSessionUser(db, token, new Date(base.getTime() + 90 * DAY - 1000)),
    ).not.toBeNull();
    expect(await findSessionUser(db, token, new Date(base.getTime() + 90 * DAY + 1000))).toBeNull();
    expect(await db.session.count()).toBe(0);
    expect(SESSION_IDLE_SECONDS).toBe(30 * 86400);
  });
});

describe("SEC-018 encerrar as outras sessões e rotação", () => {
  it("revoke-others mantém a atual e apaga as demais; sessões de outra pessoa não são afetadas", async () => {
    const a1 = await asUser("lucas@exemplo.com");
    await asUser("lucas@exemplo.com");
    await asUser("lucas@exemplo.com");
    const other = await asUser("mariana@exemplo.com");
    expect(await db.session.count()).toBe(4);
    const res = await call(a1, "POST", "/api/v1/me/sessions/revoke-others", {});
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ revoked: 2 });
    const left = await db.session.findMany();
    expect(left.map((s) => s.tokenHash).sort()).toEqual(
      [hashSessionToken(tokenOf(a1.cookie)), hashSessionToken(tokenOf(other.cookie))].sort(),
    );
    expect((await call(a1, "GET", "/api/v1/me")).status).toBe(200);
    expect((await call(other, "GET", "/api/v1/me")).status).toBe(200);
    // idempotente e estrito
    expect((await call(a1, "POST", "/api/v1/me/sessions/revoke-others", { x: 1 })).status).toBe(
      400,
    );
    expect((await call(null, "POST", "/api/v1/me/sessions/revoke-others", {})).status).toBe(401);
  });

  it("troca de papel apaga as sessões de quem foi afetado (não a de quem age)", async () => {
    const fx = await makeFamily();
    const mariana = fx.byName.Mariana?.as ?? null;
    await asUser("lucas@exemplo.com"); // 2ª sessão do Lucas
    expect(await db.session.count({ where: { userId: fx.byName.Lucas?.userId as string } })).toBe(
      2,
    );
    const res = await call(mariana, "PATCH", `/api/v1/members/${fx.byName.Lucas?.memberId}`, {
      role: "ADMIN",
    });
    expect(res.status).toBe(200);
    expect(await db.session.count({ where: { userId: fx.byName.Lucas?.userId as string } })).toBe(
      0,
    );
    expect(await db.session.count({ where: { userId: fx.byName.Mariana?.userId as string } })).toBe(
      1,
    );
  });
});

describe("DEV-91 remoção de membro encerra as sessões dele (US-035)", () => {
  it("remover Lucas: as sessões dele (2 aparelhos) deixam de autenticar na hora; a de quem age e as de outros seguem", async () => {
    const fx = await makeFamily();
    const mariana = fx.byName.Mariana?.as ?? null;
    const lucas1 = fx.byName.Lucas?.as as NonNullable<typeof mariana>;
    const lucas2 = await asUser("lucas@exemplo.com"); // 2º aparelho
    expect((await call(lucas2, "GET", "/api/v1/me")).status).toBe(200);

    const res = await call(
      mariana,
      "POST",
      `/api/v1/members/${fx.byName.Lucas?.memberId}/remove`,
      {},
    );
    expect(res.status).toBe(200);

    for (const c of [lucas1, lucas2]) {
      expect((await call(c, "GET", "/api/v1/me")).status).toBe(401);
      expect(await findSessionUser(db, tokenOf(c.cookie))).toBeNull();
    }
    expect((await call(mariana, "GET", "/api/v1/me")).status).toBe(200);
    // o adaptador do Auth.js também não devolve a sessão encerrada
    const adapter = hashedSessionAdapter({} as never, db);
    expect(await adapter.getSessionAndUser?.(tokenOf(lucas1.cookie))).toBeNull();
    const rows = await db.session.findMany({
      where: { userId: fx.byName.Lucas?.userId as string },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.endedAt !== null)).toBe(true);
  });

  it("aviso único por aparelho: cada sessão encerrada mostra o aviso uma vez e some; depois não resta sessão", async () => {
    const fx = await makeFamily();
    const lucas1 = fx.byName.Lucas?.as as { cookie: string };
    const lucas2 = await asUser("lucas@exemplo.com");
    await call(
      fx.byName.Mariana?.as ?? null,
      "POST",
      `/api/v1/members/${fx.byName.Lucas?.memberId}/remove`,
      {},
    );
    expect(await consumeMembershipEnded(lucas1.cookie)).toBe("NOTICED");
    expect(await consumeMembershipEnded(lucas2.cookie)).toBe("NOTICED");
    expect(await consumeMembershipEnded(lucas1.cookie)).toBe("NO_SESSION");
    expect(await db.session.count({ where: { userId: fx.byName.Lucas?.userId as string } })).toBe(
      0,
    );
    expect(
      (await db.member.findUniqueOrThrow({ where: { id: fx.byName.Lucas?.memberId as string } }))
        .removalNoticeAt,
    ).not.toBeNull();
  });

  it("quem SAIU mantém a própria sessão (vê 'Você saiu da família')", async () => {
    const fx = await makeFamily();
    const lucas = fx.byName.Lucas?.as ?? null;
    const res = await call(lucas, "POST", "/api/v1/family/leave", {
      reassign: { plannedTo: fx.byName.Mariana?.memberId },
    });
    expect(res.status).toBe(200);
    expect((await call(lucas, "GET", "/api/v1/me")).status).toBe(200);
    expect(
      await db.session.count({
        where: { userId: fx.byName.Lucas?.userId as string, endedAt: { not: null } },
      }),
    ).toBe(0);
  });
});

describe("SEC-018 migração sem derrubar sessões (SQL real das migrações, em schema de fixture)", () => {
  const sql = (name: string) =>
    readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8")
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n")
      .split(";")
      .map((x) => x.trim())
      .filter(Boolean);
  const run = (statements: string[]) =>
    db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL search_path TO mig018");
      for (const st of statements) await tx.$executeRawUnsafe(st);
    });

  it("fase 1: tokenHash = sha256 do texto, o mesmo cookie autentica; 018b limita a 30 dias; fase 2 remove a coluna", async () => {
    await db.$executeRawUnsafe("DROP SCHEMA IF EXISTS mig018 CASCADE");
    await db.$executeRawUnsafe("CREATE SCHEMA mig018");
    try {
      await db.$executeRawUnsafe(`CREATE TABLE mig018.sessions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "sessionToken" text NOT NULL UNIQUE,
        "userId" uuid NOT NULL, expires timestamptz(3) NOT NULL)`);
      const uid = "00000000-0000-4000-8000-000000000001";
      await db.$executeRawUnsafe(
        `INSERT INTO mig018.sessions ("sessionToken","userId",expires) VALUES
          ('cookie-antigo-1','${uid}', now() + interval '85 days'),
          ('cookie-antigo-2','${uid}', now() + interval '3 days')`,
      );
      // 1) fase 1
      await run(sql("20261025040000_sec018_session_token_hash"));
      const rows = await db.$queryRawUnsafe<
        Array<{ sessionToken: string; tokenHash: string; createdAt: Date }>
      >(
        `SELECT "sessionToken","tokenHash","createdAt" FROM mig018.sessions ORDER BY "sessionToken"`,
      );
      expect(rows).toHaveLength(2);
      for (const r of rows) {
        expect(r.tokenHash).toBe(createHash("sha256").update(r.sessionToken).digest("hex"));
        expect(r.createdAt).toBeInstanceOf(Date);
      }
      // o mesmo cookie antigo continua achando a sessão (sem novo login) e o código antigo ainda acha pelo texto
      const byHash = await db.$queryRawUnsafe<unknown[]>(
        `SELECT 1 FROM mig018.sessions WHERE "tokenHash" = '${hashSessionToken("cookie-antigo-1")}'`,
      );
      expect(byHash).toHaveLength(1);
      // 2) 018b
      await run(sql("20261025040100_sec018_session_idle_cap"));
      const capped = await db.$queryRawUnsafe<Array<{ ok: boolean; keep: boolean }>>(
        `SELECT (expires <= now() + interval '30 days 1 minute') AS ok,
                ("sessionToken" = 'cookie-antigo-2') AS keep FROM mig018.sessions ORDER BY "sessionToken"`,
      );
      expect(capped.every((r) => r.ok)).toBe(true);
      const short = await db.$queryRawUnsafe<Array<{ d: number }>>(
        `SELECT extract(epoch FROM (expires - now()))/86400 AS d FROM mig018.sessions WHERE "sessionToken"='cookie-antigo-2'`,
      );
      expect(Number(short[0]?.d)).toBeLessThan(3.01); // quem tinha menos de 30 dias não ganha tempo
      // 3) fase 2 (preparada para o PR seguinte)
      await run([
        `UPDATE sessions SET "sessionToken" = NULL`,
        `ALTER TABLE sessions DROP COLUMN "sessionToken"`,
      ]);
      const cols = await db.$queryRawUnsafe<Array<{ column_name: string }>>(
        `SELECT column_name FROM information_schema.columns WHERE table_schema='mig018' AND table_name='sessions'`,
      );
      expect(cols.map((c) => c.column_name)).not.toContain("sessionToken");
      expect(
        await db.$queryRawUnsafe<unknown[]>(
          `SELECT 1 FROM mig018.sessions WHERE "tokenHash" = '${hashSessionToken("cookie-antigo-1")}'`,
        ),
      ).toHaveLength(1);
    } finally {
      await db.$executeRawUnsafe("DROP SCHEMA IF EXISTS mig018 CASCADE");
    }
  });
});
