import type { PrismaClient } from "@/generated/prisma/client";
import { createDevSession } from "@/lib/auth/dev-login";
import { DEFAULT_CATEGORIES } from "@/modules/familia/default-categories";
import type { Caller } from "./call";
import { testDb } from "./db";

export type MemberFixture = { email: string; name: string; role?: "ADMIN" | "MEMBER" };

let dbOverride: PrismaClient | undefined;
/** O seed (`prisma/seed.ts`) reaproveita as fábricas apontando-as para o banco de desenvolvimento. */
export function useFactoryDb(db: PrismaClient | undefined) {
  dbOverride = db;
}
const fdb = (): PrismaClient => dbOverride ?? testDb();

let counter = 0;
export const uniqueEmail = (prefix = "user") => `${prefix}${++counter}-${Date.now()}@exemplo.com`;

/** Cria `User` e `Session` reais (via o mesmo caminho do dev-login) e devolve o "chamador". */
export async function asUser(
  email: string,
  opts: { name?: string; now?: Date } = {},
): Promise<Caller & { name: string | null }> {
  const { user, sessionToken } = await createDevSession(
    fdb(),
    { email, name: opts.name },
    opts.now ?? new Date(),
  );
  return {
    cookie: `authjs.session-token=${sessionToken}`,
    userId: user.id,
    email: user.email,
    name: user.name,
  };
}

export async function makeUser(email: string, name?: string) {
  const db = fdb();
  return db.user.create({
    data: {
      email: email.toLowerCase(),
      name: name ?? email.split("@")[0] ?? email,
      emailVerified: new Date(),
    },
  });
}

export type FamilyFixture = {
  family: { id: string; name: string };
  members: Array<{
    memberId: string;
    userId: string;
    email: string;
    name: string;
    role: "ADMIN" | "MEMBER";
    as: Caller & { name: string | null };
  }>;
  byName: Record<string, FamilyFixture["members"][number]>;
};

const DEFAULT_MEMBERS: MemberFixture[] = [
  { email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" },
  { email: "lucas@exemplo.com", name: "Lucas Silva", role: "MEMBER" },
];

/** Família com categorias padrão e regra EQUAL (invariantes de US-002), membros e sessões prontas. */
export async function makeFamily(
  o: { name?: string; members?: MemberFixture[]; cutDay?: number; uniqueEmails?: boolean } = {},
): Promise<FamilyFixture> {
  const db = fdb();
  const memberFixtures = (o.members ?? DEFAULT_MEMBERS).map((m) =>
    o.uniqueEmails ? { ...m, email: uniqueEmail(m.name.split(" ")[0]?.toLowerCase()) } : m,
  );
  const family = await db.family.create({
    data: {
      name: o.name ?? "Família Silva",
      ...(o.cutDay ? { cutDay: o.cutDay } : {}),
      categories: {
        create: DEFAULT_CATEGORIES.map((c, i) => ({
          kind: c.kind,
          name: c.name,
          icon: c.icon,
          sortOrder: i,
        })),
      },
      splitRules: { create: { kind: "EQUAL", effectiveFrom: new Date("1970-01-01T00:00:00Z") } },
    },
  });
  const members: FamilyFixture["members"] = [];
  for (const [i, m] of memberFixtures.entries()) {
    const as = await asUser(m.email, { name: m.name });
    const member = await db.member.create({
      data: {
        familyId: family.id,
        userId: as.userId,
        role: m.role ?? (i === 0 ? "ADMIN" : "MEMBER"),
        joinedAt: new Date(Date.UTC(2026, 0, 1, 12, 0, i)),
      },
    });
    members.push({
      memberId: member.id,
      userId: as.userId,
      email: m.email,
      name: m.name,
      role: member.role,
      as,
    });
  }
  const byName: FamilyFixture["byName"] = {};
  for (const m of members) byName[m.name.split(" ")[0] as string] = m;
  return { family: { id: family.id, name: family.name }, members, byName };
}
