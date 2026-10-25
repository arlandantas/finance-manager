import { describe, expect, it } from "vitest";
import {
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
  it("dono removido: somente leitura para todos, inclusive dono da conta e lançador", () => {
    expect(canWriteTransaction(row({ accountOwnerMemberId: "m2" }), member("m2"), true)).toBe(
      false,
    );
    expect(canWriteTransaction(row({ payerMemberId: "m3" }), member("m1"), true)).toBe(false);
    expect(canWriteTransaction(row(), member("m2"), true)).toBe(false);
    expect(canWriteTransaction(row(), member("m2", "ADMIN"), true)).toBe(false);
    expect(canWriteTransaction(row(), member("m1"), true)).toBe(false);
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
  });
});
