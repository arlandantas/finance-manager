import { readFileSync } from "node:fs";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { beforeEach, describe, expect, it } from "vitest";
import { noProviderTokensAdapter } from "@/lib/auth/session-adapter";
import { listPurgeTasks, runPurge } from "@/modules/cron/purge";
import { resetDb, testDb } from "../support/db";
import { makeFamily, makeUser } from "../support/factories";

// SEC-017a (SDD-028 §7): expurgo técnico e tokens do Google. Limites ±1 s, idempotência, adaptador e migração.
const db = testDb();
const NOW = new Date("2026-10-26T12:00:00Z");
const S = 1000;
const DAY = 86_400_000;
const at = (ms: number) => new Date(NOW.getTime() + ms);
const deleted = async (task: string) =>
  (await runPurge(db, NOW)).find((r) => r.task === task)?.deleted;

beforeEach(resetDb);

describe("SEC-017a tarefas registradas", () => {
  it("as quatro tarefas novas estão no cron", () => {
    expect(listPurgeTasks()).toEqual(
      expect.arrayContaining([
        "auth:purge-sessions",
        "auth:purge-verification",
        "familia:purge-invitations",
        "api:purge-idempotency",
      ]),
    );
  });
});

describe("SEC-017a auth:purge-sessions", () => {
  it("apaga só o vencido (ociosidade, prazo absoluto, encerrada há > 7 d) e preserva o vigente; 2ª execução não apaga mais", async () => {
    const u = await makeUser("a@exemplo.com");
    const mk = (hash: string, d: { expires: Date; createdAt?: Date; endedAt?: Date }) =>
      db.session.create({ data: { tokenHash: hash, userId: u.id, ...d } });
    await mk("idle-venceu", { expires: at(-S) });
    await mk("idle-vigente", { expires: at(S) });
    await mk("abs-venceu", { expires: at(30 * DAY), createdAt: at(-90 * DAY - S) });
    await mk("abs-vigente", { expires: at(30 * DAY), createdAt: at(-90 * DAY + S) });
    await mk("ended-velha", { expires: at(30 * DAY), endedAt: at(-7 * DAY - S) });
    await mk("ended-recente", { expires: at(30 * DAY), endedAt: at(-7 * DAY + S) });
    expect(await deleted("auth:purge-sessions")).toBe(3);
    expect((await db.session.findMany()).map((s) => s.tokenHash).sort()).toEqual([
      "abs-vigente",
      "ended-recente",
      "idle-vigente",
    ]);
    expect(await deleted("auth:purge-sessions")).toBe(0);
    expect(await db.session.count()).toBe(3);
  });
});

describe("SEC-017a auth:purge-verification", () => {
  it("apaga só os tokens vencidos", async () => {
    await db.verificationToken.createMany({
      data: [
        { identifier: "a", token: "venceu", expires: at(-S) },
        { identifier: "a", token: "vigente", expires: at(S) },
      ],
    });
    expect(await deleted("auth:purge-verification")).toBe(1);
    expect((await db.verificationToken.findMany()).map((t) => t.token)).toEqual(["vigente"]);
    expect(await deleted("auth:purge-verification")).toBe(0);
  });
});

describe("SEC-017a familia:purge-invitations", () => {
  it("apaga encerrados há > 90 d (pela data do status) e preserva recentes e pendentes vigentes", async () => {
    const fx = await makeFamily();
    let n = 0;
    const mk = (
      status: "PENDING" | "ACCEPTED" | "CANCELED" | "EXPIRED" | "DECLINED",
      d: { acceptedAt?: Date; canceledAt?: Date; declinedAt?: Date; expiresAt: Date },
    ) =>
      db.invitation.create({
        data: {
          familyId: fx.family.id,
          email: `conv${++n}@exemplo.com`,
          tokenHash: `h${n}`,
          status,
          invitedByMemberId: fx.byName.Mariana?.memberId as string,
          emailStatus: "SENT",
          ...d,
        },
      });
    const old = at(-90 * DAY - S);
    const recent = at(-90 * DAY + S);
    await mk("ACCEPTED", { acceptedAt: old, expiresAt: at(DAY) }); // apaga
    await mk("ACCEPTED", { acceptedAt: recent, expiresAt: at(DAY) });
    await mk("CANCELED", { canceledAt: old, expiresAt: at(DAY) }); // apaga
    await mk("CANCELED", { canceledAt: recent, expiresAt: at(DAY) });
    await mk("DECLINED", { declinedAt: old, expiresAt: at(DAY) }); // apaga
    await mk("DECLINED", { declinedAt: recent, expiresAt: at(DAY) });
    await mk("EXPIRED", { expiresAt: old }); // apaga
    await mk("EXPIRED", { expiresAt: recent });
    await mk("PENDING", { expiresAt: old }); // vencida há > 90 d: apaga
    await mk("PENDING", { expiresAt: at(DAY) }); // vigente
    expect(await deleted("familia:purge-invitations")).toBe(5);
    expect(await db.invitation.count()).toBe(5);
    expect(await db.invitation.count({ where: { status: "PENDING" } })).toBe(1);
    expect(await deleted("familia:purge-invitations")).toBe(0);
    expect(await db.invitation.count()).toBe(5);
  });
});

describe("SEC-017a api:purge-idempotency", () => {
  it("apaga as chaves com mais de 24 h e preserva as recentes", async () => {
    const u = await makeUser("b@exemplo.com");
    const mk = (key: string, createdAt: Date) =>
      db.idempotencyRecord.create({
        data: {
          userId: u.id,
          key,
          method: "POST",
          path: "/x",
          requestHash: "h",
          responseStatus: 200,
          responseBody: {},
          createdAt,
        },
      });
    await mk("velha", at(-24 * 3_600_000 - S));
    await mk("nova", at(-24 * 3_600_000 + S));
    expect(await deleted("api:purge-idempotency")).toBe(1);
    expect((await db.idempotencyRecord.findMany()).map((r) => r.key)).toEqual(["nova"]);
    expect(await deleted("api:purge-idempotency")).toBe(0);
  });
});

describe("SEC-017a tokens do Google não são guardados", () => {
  it("o login Google simulado (linkAccount do adaptador) grava accounts sem tokens", async () => {
    const adapter = noProviderTokensAdapter(PrismaAdapter(db as never));
    const u = await makeUser("g@exemplo.com");
    await adapter.linkAccount?.({
      userId: u.id,
      type: "oidc",
      provider: "google",
      providerAccountId: "1234567890",
      access_token: "ya29.token-de-acesso",
      refresh_token: "1//refresh",
      id_token: "eyJ.id.token",
      session_state: "estado",
      expires_at: 1_800_000_000,
      token_type: "bearer",
      scope: "openid email profile",
    } as never);
    const acc = await db.account.findFirstOrThrow({ where: { userId: u.id } });
    expect(acc.access_token).toBeNull();
    expect(acc.refresh_token).toBeNull();
    expect(acc.id_token).toBeNull();
    expect(acc.session_state).toBeNull();
    expect(acc.providerAccountId).toBe("1234567890");
    expect(acc.scope).toBe("openid email profile");
  });

  it("migração sec017_strip_google_tokens => zero linhas com token (SQL real, schema de fixture)", async () => {
    await db.$executeRawUnsafe("DROP SCHEMA IF EXISTS mig017 CASCADE");
    await db.$executeRawUnsafe("CREATE SCHEMA mig017");
    try {
      await db.$executeRawUnsafe(`CREATE TABLE mig017.accounts (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(), "providerAccountId" text,
        access_token text, refresh_token text, id_token text, session_state text)`);
      await db.$executeRawUnsafe(
        `INSERT INTO mig017.accounts ("providerAccountId", access_token, refresh_token, id_token, session_state)
         VALUES ('1','a','r','i','s'), ('2', NULL, NULL, 'i', NULL), ('3', NULL, NULL, NULL, NULL)`,
      );
      const stmts = readFileSync(
        "prisma/migrations/20261026010000_sec017_strip_google_tokens/migration.sql",
        "utf8",
      )
        .split("\n")
        .filter((l) => !l.trim().startsWith("--"))
        .join("\n")
        .split(";")
        .map((x) => x.trim())
        .filter(Boolean);
      await db.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SET LOCAL search_path TO mig017");
        for (const st of stmts) await tx.$executeRawUnsafe(st);
      });
      const left = await db.$queryRawUnsafe<Array<{ n: bigint }>>(
        `SELECT count(*) AS n FROM mig017.accounts WHERE access_token IS NOT NULL OR refresh_token IS NOT NULL
          OR id_token IS NOT NULL OR session_state IS NOT NULL`,
      );
      expect(Number(left[0]?.n)).toBe(0);
      expect(
        Number(
          (
            await db.$queryRawUnsafe<Array<{ n: bigint }>>(
              `SELECT count(*) AS n FROM mig017.accounts`,
            )
          )[0]?.n,
        ),
      ).toBe(3);
    } finally {
      await db.$executeRawUnsafe("DROP SCHEMA IF EXISTS mig017 CASCADE");
    }
  });
});
