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

export type AccountFixture = { id: string; name: string; ownerMemberId: string };

/** Conta com lançamento de abertura (mesmo desenho de `createAccount`, direto no banco). */
export async function makeAccount(
  fx: FamilyFixture,
  o: {
    name: string;
    owner?: string; // primeiro nome do titular (padrão: o primeiro membro)
    type?: "CHECKING" | "SAVINGS" | "CASH";
    institution?: string;
    openingBalanceInCents?: number;
    openingDate?: string;
  },
): Promise<AccountFixture> {
  const db = fdb();
  const owner = (o.owner ? fx.byName[o.owner] : fx.members[0]) ?? fx.members[0];
  if (!owner) throw new Error("Família sem membros");
  const balance = o.openingBalanceInCents ?? 0;
  const account = await db.bankAccount.create({
    data: {
      familyId: fx.family.id,
      name: o.name,
      institution: o.institution ?? "Outro",
      type: o.type ?? "CHECKING",
      ownerMemberId: owner.memberId,
    },
  });
  const opening = await db.transaction.create({
    data: {
      familyId: fx.family.id,
      kind: "OPENING",
      direction: balance >= 0 ? "CREDIT" : "DEBIT",
      accountId: account.id,
      amountInCents: BigInt(Math.abs(balance)),
      occurredOn: new Date(`${o.openingDate ?? "2026-10-01"}T00:00:00Z`),
      description: "Saldo inicial",
      authorMemberId: owner.memberId,
    },
  });
  await db.transactionRevision.create({
    data: {
      familyId: fx.family.id,
      transactionId: opening.id,
      revision: 1,
      action: "CREATE",
      actorMemberId: owner.memberId,
      changes: [
        { field: "*", from: null, to: { kind: "OPENING", amountInCents: Math.abs(balance) } },
      ],
    },
  });
  return { id: account.id, name: account.name, ownerMemberId: owner.memberId };
}

/** Despesa/receita direto no banco (sem passar pela API), com `createdAt` controlável. */
export async function makeTransaction(
  fx: FamilyFixture,
  o: {
    account: AccountFixture;
    type?: "EXPENSE" | "INCOME";
    category: string;
    amountInCents: number;
    occurredOn: string;
    author?: string;
    payer?: string;
    shared?: boolean;
    description?: string;
    createdAt?: Date;
    deleted?: boolean;
  },
) {
  const db = fdb();
  const type = o.type ?? "EXPENSE";
  const category = await db.category.findFirstOrThrow({
    where: { familyId: fx.family.id, name: o.category },
  });
  const author = (o.author ? fx.byName[o.author] : fx.members[0]) ?? fx.members[0];
  const payer = (o.payer ? fx.byName[o.payer] : author) ?? author;
  if (!author || !payer) throw new Error("Família sem membros");
  return db.transaction.create({
    data: {
      familyId: fx.family.id,
      kind: type,
      direction: type === "EXPENSE" ? "DEBIT" : "CREDIT",
      accountId: o.account.id,
      categoryId: category.id,
      amountInCents: BigInt(o.amountInCents),
      occurredOn: new Date(`${o.occurredOn}T00:00:00Z`),
      description: o.description ?? category.name,
      payerMemberId: payer.memberId,
      authorMemberId: author.memberId,
      isSharedExpense: type === "EXPENSE" ? (o.shared ?? true) : false,
      ...(o.createdAt ? { createdAt: o.createdAt } : {}),
      ...(o.deleted
        ? {
            deletedAt: new Date(),
            deletedByMemberId: author.memberId,
            deletionReason: "DELETED" as const,
          }
        : {}),
    },
  });
}

/** Transferência (ou acerto) com as duas pernas; `undone` marca o grupo e as pernas como desfeitos. */
export async function makeTransfer(
  fx: FamilyFixture,
  o: {
    from: AccountFixture;
    to: AccountFixture;
    amountInCents: number;
    occurredOn: string;
    kind?: "TRANSFER" | "SETTLEMENT";
    undone?: boolean;
  },
) {
  const db = fdb();
  const author = fx.members[0];
  if (!author) throw new Error("Família sem membros");
  const deleted = o.undone
    ? {
        deletedAt: new Date(),
        deletedByMemberId: author.memberId,
        deletionReason: "UNDONE" as const,
      }
    : {};
  const group = await db.transferGroup.create({
    data: {
      familyId: fx.family.id,
      kind: o.kind ?? "TRANSFER",
      occurredOn: new Date(`${o.occurredOn}T00:00:00Z`),
      authorMemberId: author.memberId,
      ...(o.kind === "SETTLEMENT"
        ? {
            settlementPeriod: o.occurredOn.slice(0, 7),
            settlementFromMemberId: author.memberId,
            settlementToMemberId: author.memberId,
          }
        : {}),
      ...(o.undone ? { deletedAt: new Date(), deletedByMemberId: author.memberId } : {}),
    },
  });
  const leg = (kind: "TRANSFER_OUT" | "TRANSFER_IN", accountId: string) =>
    db.transaction.create({
      data: {
        familyId: fx.family.id,
        kind,
        direction: kind === "TRANSFER_OUT" ? "DEBIT" : "CREDIT",
        accountId,
        amountInCents: BigInt(o.amountInCents),
        occurredOn: new Date(`${o.occurredOn}T00:00:00Z`),
        description: "Transferência",
        authorMemberId: author.memberId,
        transferGroupId: group.id,
        ...deleted,
      },
    });
  await leg("TRANSFER_OUT", o.from.id);
  await leg("TRANSFER_IN", o.to.id);
  return group;
}

/** Convite direto no banco; devolve o token em claro (só o hash é persistido). */
export async function makeInvitation(
  fx: FamilyFixture,
  o: {
    email: string;
    role?: "ADMIN" | "MEMBER";
    invitedBy?: string;
    createdAt?: Date;
    expiresAt?: Date;
    status?: "PENDING" | "ACCEPTED" | "CANCELED" | "EXPIRED";
  },
) {
  const { randomBytes, createHash } = await import("node:crypto");
  const db = fdb();
  const token = randomBytes(32).toString("base64url");
  const inviter = (o.invitedBy ? fx.byName[o.invitedBy] : fx.members[0]) ?? fx.members[0];
  if (!inviter) throw new Error("Família sem membros");
  const createdAt = o.createdAt ?? new Date("2026-10-04T12:00:00Z");
  const row = await db.invitation.create({
    data: {
      familyId: fx.family.id,
      email: o.email.toLowerCase(),
      role: o.role ?? "MEMBER",
      tokenHash: createHash("sha256").update(token).digest("hex"),
      status: o.status ?? "PENDING",
      expiresAt: o.expiresAt ?? new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000),
      invitedByMemberId: inviter.memberId,
      emailStatus: "SENT",
      createdAt,
    },
  });
  return { id: row.id, token };
}
