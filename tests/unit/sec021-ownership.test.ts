import { describe, expect, it } from "vitest";
import type { RequestContext } from "@/lib/api/types";
import {
  assertCanMakePersonal,
  assertPlannedControllerLimits,
  canChangeStructure,
  canWritePlanned,
  canWriteTransaction,
  controllerNames,
  isPersonalExpense,
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
      { payerMemberId: "m3", isSharedExpense: true },
      { accountId: "acc2" },
      { payerMemberId: "m2" },
    ]) {
      expect(() =>
        assertCanMakePersonal(admin, expense(), next, { fullPower: true }),
      ).not.toThrow();
      expect(() => assertCanMakePersonal(admin, expense(), next)).toThrow();
    }
  });
  it("fullPower não permite entregar o 'Só meu' em nome de terceiro", () => {
    expect(() =>
      assertCanMakePersonal(admin, expense(), { payerMemberId: "m3" }, { fullPower: true }),
    ).toThrow(/Só meu/);
  });
  it("na prevista, fullPower dispensa os limites de responsável, divisão e 'Pagar com'", () => {
    const planned = { isSharedExpense: false, responsibleMemberId: "m1", paymentAccountId: "a1" };
    const next = { responsibleMemberId: "m3", isSharedExpense: true, paymentAccountId: "a2" };
    expect(() =>
      assertPlannedControllerLimits(admin, planned, next, { fullPower: true }),
    ).not.toThrow();
    expect(() => assertPlannedControllerLimits(admin, planned, next)).toThrow();
  });
});
