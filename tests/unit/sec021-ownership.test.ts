import { describe, expect, it } from "vitest";
import type { RequestContext } from "@/lib/api/types";
import {
  assertCanMakePersonal,
  assertPlannedControllerLimits,
  canChangeStructure,
  canWritePlanned,
  canWriteTransaction,
  controllerNames,
  effectiveOwner,
  isAdminOverRemovedOwner,
  isPersonalExpense,
  memberRefsWithReturn,
  ownerStanding,
  personalControllerIds,
  personalWriteMessage,
  plannedControllerIds,
} from "@/modules/transacoes/ownership";

const row = (over: Partial<Parameters<typeof canWriteTransaction>[0]> = {}) => ({
  kind: "EXPENSE",
  isSharedExpense: false,
  payerMemberId: "m1",
  authorMemberId: "m1",
  ...over,
});
const member = (memberId: string, role: "ADMIN" | "MEMBER" = "MEMBER") => ({ memberId, role });

describe("SEC-021 ownership", () => {
  it("só despesa não dividida é 'Só meu'", () => {
    expect(isPersonalExpense(row())).toBe(true);
    expect(isPersonalExpense(row({ isSharedExpense: true }))).toBe(false);
    expect(isPersonalExpense(row({ kind: "INCOME" }))).toBe(false);
    expect(isPersonalExpense(row({ kind: "TRANSFER_OUT" }))).toBe(false);
  });
  it("pagador (dono) escreve; membro sem relação, mesmo Admin, não", () => {
    expect(canWriteTransaction(row(), member("m1"), false)).toBe(true);
    expect(canWriteTransaction(row(), member("m2"), false)).toBe(false);
    expect(canWriteTransaction(row(), member("m2", "ADMIN"), false)).toBe(false);
  });
  it("D-GES-50: o lançador (autor) também escreve num 'Só meu' pago por outro", () => {
    expect(canWriteTransaction(row({ payerMemberId: "m2" }), member("m1"), false)).toBe(true);
    expect(canWriteTransaction(row({ payerMemberId: "m2" }), member("m3"), false)).toBe(false);
    expect(canWriteTransaction(row({ payerMemberId: null }), member("m1"), false)).toBe(true);
  });
  it("D-GES-50: o dono da conta (ou do cartão) também escreve; sem dono de conta, nada muda", () => {
    const r = row({ payerMemberId: "m2", accountOwnerMemberId: "m3" });
    expect(canWriteTransaction(r, member("m3"), false)).toBe(true);
    expect(canWriteTransaction(r, member("m4", "ADMIN"), false)).toBe(false);
    expect(canWriteTransaction(row({ accountOwnerMemberId: null }), member("m3"), false)).toBe(
      false,
    );
  });
  it("controladores: pagador, dono da conta e lançador, sem repetição", () => {
    expect(personalControllerIds(row({ payerMemberId: "m2", accountOwnerMemberId: "m3" }))).toEqual(
      ["m2", "m3", "m1"],
    );
    expect(personalControllerIds(row({ accountOwnerMemberId: "m1" }))).toEqual(["m1"]);
  });
  it("mensagem e nomes: 'Só A, B e C podem alterar este lançamento'", () => {
    expect(personalWriteMessage(["Mariana"])).toBe("Só Mariana pode alterar este lançamento.");
    expect(personalWriteMessage(["Mariana", "Carla", "Lucas"], " (Só meu)")).toBe(
      "Só Mariana, Carla e Lucas podem alterar este lançamento (Só meu).",
    );
    expect(
      controllerNames(
        ["a", "z", "b"],
        [
          { id: "a", name: "Mariana Silva" },
          { id: "b", name: "Lucas" },
        ],
      ),
    ).toEqual(["Mariana", "Lucas"]);
  });
  it("D-GES-52: dono removido ⇒ somente leitura, exceto o Administrador atual", () => {
    expect(canWriteTransaction(row({ accountOwnerMemberId: "m2" }), member("m2"), true)).toBe(
      false,
    );
    expect(canWriteTransaction(row({ payerMemberId: "m3" }), member("m1"), true)).toBe(false);
    expect(canWriteTransaction(row(), member("m2"), true)).toBe(false);
    expect(canWriteTransaction(row(), member("m1"), true)).toBe(false);
    expect(canWriteTransaction(row(), member("m2", "ADMIN"), true)).toBe(true);
    // Admin não ganha nada num 'Só meu' de dono ATIVO
    expect(canWriteTransaction(row(), member("m2", "ADMIN"), false)).toBe(false);
  });
  it("despesa dividida e receita: qualquer membro", () => {
    expect(canWriteTransaction(row({ isSharedExpense: true }), member("m2"), false)).toBe(true);
    expect(canWriteTransaction(row({ kind: "INCOME" }), member("m2"), false)).toBe(true);
  });
});

// SEC-025/026 (D-GES-45): previstas "Só meu" e "Só meu" só em nome de quem age.
describe("SEC-026 regras puras de previstas e de pagador", () => {
  const viewer = { memberId: "a" };
  it("prevista dividida: qualquer membro; 'Só meu': só o responsável e não se ele saiu", () => {
    expect(
      canWritePlanned({ isSharedExpense: true, responsibleMemberId: "b" }, viewer, false),
    ).toBe(true);
    expect(
      canWritePlanned({ isSharedExpense: false, responsibleMemberId: "a" }, viewer, false),
    ).toBe(true);
    expect(
      canWritePlanned({ isSharedExpense: false, responsibleMemberId: "b" }, viewer, false),
    ).toBe(false);
    // D-GES-50: lançador e dono da conta "Pagar com" também controlam a prevista "Só meu"
    expect(
      canWritePlanned(
        { isSharedExpense: false, responsibleMemberId: "b", authorMemberId: "a" },
        viewer,
        false,
      ),
    ).toBe(true);
    expect(
      canWritePlanned(
        { isSharedExpense: false, responsibleMemberId: "b", accountOwnerMemberId: "a" },
        viewer,
        false,
      ),
    ).toBe(true);
    expect(
      canWritePlanned(
        { isSharedExpense: false, responsibleMemberId: "b", authorMemberId: "a" },
        viewer,
        true,
      ),
    ).toBe(false);
    expect(
      plannedControllerIds({
        isSharedExpense: false,
        responsibleMemberId: "b",
        authorMemberId: "b",
        accountOwnerMemberId: "c",
      }),
    ).toEqual(["b", "c"]);
    expect(
      canWritePlanned({ isSharedExpense: false, responsibleMemberId: "a" }, viewer, true),
    ).toBe(false);
    // D-GES-52: o Administrador altera a prevista "Só meu" de ex-membro
    expect(
      canWritePlanned(
        { isSharedExpense: false, responsibleMemberId: "b" },
        { memberId: "a", role: "ADMIN" },
        true,
      ),
    ).toBe(true);
    expect(
      canWritePlanned(
        { isSharedExpense: false, responsibleMemberId: "b" },
        { memberId: "a", role: "ADMIN" },
        false,
      ),
    ).toBe(false);
  });
});

const ctx = (memberId: string) => ({ memberId, familyId: "f", role: "MEMBER" }) as RequestContext;
const expense = (over = {}) => ({
  kind: "EXPENSE",
  isSharedExpense: false,
  payerMemberId: "m1",
  authorMemberId: "m1",
  accountId: "acc1",
  ...over,
});

describe("SEC-043/044 quem só controla não muda divisão, pagador nem conta", () => {
  it("o dono pode tudo; quem só controla altera o que não é estrutural", () => {
    expect(() => assertCanMakePersonal(ctx("m1"), expense(), { accountId: "acc2" })).not.toThrow();
    expect(() => assertCanMakePersonal(ctx("m2"), expense(), {})).not.toThrow();
    expect(() =>
      assertCanMakePersonal(ctx("m2"), expense(), { payerMemberId: "m1", accountId: "acc1" }),
    ).not.toThrow(); // reenviar o mesmo valor não conta
  });
  it("não assume o pagamento, não troca pagador, divisão nem conta", () => {
    for (const next of [
      { payerMemberId: "m2" }, // assume (SEC-043)
      { payerMemberId: "m3" },
      { isSharedExpense: true },
      { accountId: "acc2" },
    ]) {
      expect(() => assertCanMakePersonal(ctx("m2"), expense(), next)).toThrow(
        /Só quem pagou pode alterar a divisão, o pagador e a conta/,
      );
    }
  });
  it("na prevista: responsável, divisão e 'Pagar com' são do responsável", () => {
    const planned = { isSharedExpense: false, responsibleMemberId: "m1", paymentAccountId: "a1" };
    expect(() =>
      assertPlannedControllerLimits(ctx("m1"), planned, { responsibleMemberId: "m1" }),
    ).not.toThrow();
    expect(() => assertPlannedControllerLimits(ctx("m2"), planned, {})).not.toThrow();
    for (const next of [
      { responsibleMemberId: "m2" },
      { isSharedExpense: true },
      { paymentAccountId: "a2" },
      { paymentAccountId: null },
    ]) {
      expect(() => assertPlannedControllerLimits(ctx("m2"), planned, next)).toThrow();
    }
    expect(() =>
      assertPlannedControllerLimits(
        ctx("m2"),
        { ...planned, isSharedExpense: true },
        { isSharedExpense: true },
      ),
    ).not.toThrow();
  });
});

describe("D-GES-55 poderes plenos do Administrador sobre o 'Só meu' de ex-membro", () => {
  const admin = { ...ctx("m2"), role: "ADMIN" } as RequestContext;
  it("canChangeStructure: dono; Admin só com dono ex-membro; Membro, dono da conta e lançador não", () => {
    expect(canChangeStructure("m1", member("m1"), false)).toBe(true);
    expect(canChangeStructure("m1", member("m2", "ADMIN"), true)).toBe(true);
    expect(canChangeStructure("m1", member("m2", "ADMIN"), false)).toBe(false); // dono ativo
    expect(canChangeStructure("m1", member("m2"), true)).toBe(false);
    expect(canChangeStructure("m1", member("m3"), false)).toBe(false);
  });
  it("com fullPower o Admin muda divisão, pagador e conta; sem ele, 403", () => {
    for (const next of [
      { isSharedExpense: true },
      { isSharedExpense: true, payerMemberId: "m1" }, // reenviar o ex-membro como pagador vale
      { accountId: "acc2" },
      { payerMemberId: "m2" },
    ]) {
      expect(() =>
        assertCanMakePersonal(admin, expense(), next, { fullPower: true }),
      ).not.toThrow();
      expect(() => assertCanMakePersonal(admin, expense(), next)).toThrow();
    }
  });
  it("SEC-048: ao dividir, outro pagador (o Admin ou um ativo) é recusado, com ou sem fullPower", () => {
    for (const payer of ["m2", "m3"]) {
      expect(() =>
        assertCanMakePersonal(
          admin,
          expense(),
          { isSharedExpense: true, payerMemberId: payer },
          { fullPower: true },
        ),
      ).toThrow(/pagador continua sendo quem pagou/);
    }
  });
  it("fullPower não permite entregar o 'Só meu' em nome de terceiro", () => {
    expect(() =>
      assertCanMakePersonal(admin, expense(), { payerMemberId: "m3" }, { fullPower: true }),
    ).toThrow(/Só meu/);
  });
  it("na prevista, fullPower dispensa os limites de responsável, divisão e 'Pagar com'", () => {
    const planned = { isSharedExpense: false, responsibleMemberId: "m1", paymentAccountId: "a1" };
    const next = { isSharedExpense: true, paymentAccountId: "a2" };
    expect(() =>
      assertPlannedControllerLimits(admin, planned, next, { fullPower: true }),
    ).not.toThrow();
    expect(() => assertPlannedControllerLimits(admin, planned, next)).toThrow();
    // trocar só o responsável (ainda "Só meu"), com fullPower, segue permitido (a trava de terceiro é outra)
    expect(() =>
      assertPlannedControllerLimits(
        admin,
        planned,
        { responsibleMemberId: "m2" },
        { fullPower: true },
      ),
    ).not.toThrow();
  });
  it("SEC-048 na prevista: ao dividir, outro responsável é recusado com fullPower", () => {
    const planned = { isSharedExpense: false, responsibleMemberId: "m1", paymentAccountId: "a1" };
    for (const responsibleMemberId of ["m2", "m3"]) {
      expect(() =>
        assertPlannedControllerLimits(
          admin,
          planned,
          { isSharedExpense: true, responsibleMemberId },
          { fullPower: true },
        ),
      ).toThrow(/pagador continua sendo quem pagou/);
    }
    expect(() =>
      assertPlannedControllerLimits(
        admin,
        planned,
        { isSharedExpense: true, responsibleMemberId: "m1" },
        { fullPower: true },
      ),
    ).not.toThrow();
  });
});

describe("SEC-049 dono ativo: o mesmo usuário com vínculo ativo na mesma família", () => {
  type M = { id: string; familyId: string; userId: string; removedAt: Date | null };
  const gone = new Date("2026-10-03T00:00:00Z");
  /** tx falso: só `member.findFirst`, com o filtro por `where` aplicado como o Prisma faria. */
  const fakeTx = (members: M[]) =>
    ({
      member: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) =>
          members.find(
            (m) =>
              (where.id === undefined || m.id === where.id) &&
              (where.familyId === undefined || m.familyId === where.familyId) &&
              (where.userId === undefined || m.userId === where.userId) &&
              (where.removedAt !== null || m.removedAt === null),
          ) ?? null,
      },
    }) as never;
  const actor = (memberId: string, userId: string, role: "ADMIN" | "MEMBER" = "MEMBER") =>
    ({ memberId, userId, role, familyId: "f1" }) as RequestContext;
  const base: M[] = [
    { id: "old", familyId: "f1", userId: "u-lucas", removedAt: gone },
    { id: "new", familyId: "f1", userId: "u-lucas", removedAt: null },
    { id: "adm", familyId: "f1", userId: "u-adm", removedAt: null },
    { id: "bye", familyId: "f1", userId: "u-bye", removedAt: gone },
    { id: "far", familyId: "f2", userId: "u-bye", removedAt: null }, // vínculo ativo em OUTRA família
  ];

  it("quem voltou é o próprio dono; o Admin deixa de ter poder pleno", async () => {
    const tx = fakeTx(base);
    expect(await ownerStanding(tx, actor("new", "u-lucas"), "old")).toEqual({
      ownerIsActor: true,
      ownerRemoved: false,
    });
    expect(await ownerStanding(tx, actor("adm", "u-adm", "ADMIN"), "old")).toEqual({
      ownerIsActor: false,
      ownerRemoved: false,
    });
    expect(await isAdminOverRemovedOwner(tx, actor("adm", "u-adm", "ADMIN"), "old")).toBe(false);
  });
  it("ex-membro de verdade (sem vínculo ativo na família) segue com o Admin; vínculo em outra família não conta", async () => {
    const tx = fakeTx(base);
    expect(await ownerStanding(tx, actor("adm", "u-adm", "ADMIN"), "bye")).toEqual({
      ownerIsActor: false,
      ownerRemoved: true,
    });
    expect(await isAdminOverRemovedOwner(tx, actor("adm", "u-adm", "ADMIN"), "bye")).toBe(true);
    expect(await isAdminOverRemovedOwner(tx, actor("adm", "u-adm"), "bye")).toBe(false); // Membro, não
  });
  it("vínculo de outra família (IDOR): o dono não é achado fora da família do ator", async () => {
    const tx = fakeTx(base);
    expect(await ownerStanding(tx, actor("x", "u-x"), "far")).toEqual({
      ownerIsActor: false,
      ownerRemoved: false,
    });
  });
  it("assertCanMakePersonal e limites da prevista: ownerIsActor age como dono", () => {
    const lucas = actor("new", "u-lucas");
    const cur = {
      kind: "EXPENSE",
      isSharedExpense: false,
      payerMemberId: "old",
      authorMemberId: "old",
    };
    expect(() => assertCanMakePersonal(lucas, cur, { isSharedExpense: true })).toThrow();
    expect(() =>
      assertCanMakePersonal(lucas, cur, { isSharedExpense: true }, { ownerIsActor: true }),
    ).not.toThrow();
    const planned = { isSharedExpense: false, responsibleMemberId: "old", paymentAccountId: "a1" };
    expect(() =>
      assertPlannedControllerLimits(lucas, planned, { isSharedExpense: true }),
    ).toThrow();
    expect(() =>
      assertPlannedControllerLimits(
        lucas,
        planned,
        { isSharedExpense: true },
        { ownerIsActor: true },
      ),
    ).not.toThrow();
  });
  it("UI: effectiveOwner e memberRefsWithReturn", () => {
    expect(effectiveOwner(null)).toEqual({ id: null, removed: false });
    expect(effectiveOwner({ id: "old", removed: true, activeId: "new" })).toEqual({
      id: "new",
      removed: false,
    });
    expect(effectiveOwner({ id: "bye", removed: true })).toEqual({ id: "bye", removed: true });
    expect(effectiveOwner({ id: "adm" })).toEqual({ id: "adm", removed: false });
    const refs = memberRefsWithReturn(
      base.filter((m) => m.familyId === "f1"),
      (m) => ({
        id: m.id,
        name: m.id,
        image: null,
        ...(m.removedAt ? { removed: true as const } : {}),
      }),
    );
    expect(refs.get("old")?.activeId).toBe("new");
    expect(refs.get("bye")?.activeId).toBeUndefined();
    expect(refs.get("new")?.activeId).toBeUndefined();
  });
});
