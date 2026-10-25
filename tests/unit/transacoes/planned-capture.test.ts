import { describe, expect, it } from "vitest";
import { violatesPlannedCapture } from "@/modules/transacoes/ownership";

// SEC-038: regra pura (usada pela UI do drawer de previstas e pela API).
const row = { isSharedExpense: true, responsibleMemberId: "A", authorMemberId: "B" };
describe("violatesPlannedCapture", () => {
  it("terceiro não torna 'Só meu' nem se põe como responsável", () => {
    expect(violatesPlannedCapture({ memberId: "C" }, row, { isSharedExpense: false })).toBe(true);
    expect(violatesPlannedCapture({ memberId: "C" }, row, { responsibleMemberId: "C" })).toBe(true);
  });
  it("responsável atual e autor", () => {
    expect(violatesPlannedCapture({ memberId: "A" }, row, { isSharedExpense: false })).toBe(false);
    expect(violatesPlannedCapture({ memberId: "B" }, row, { responsibleMemberId: "B" })).toBe(
      false,
    );
    expect(violatesPlannedCapture({ memberId: "B" }, row, { isSharedExpense: false })).toBe(true);
  });
  it("não restringe edição comum nem escolher outro como responsável", () => {
    expect(violatesPlannedCapture({ memberId: "C" }, row, {})).toBe(false);
    expect(violatesPlannedCapture({ memberId: "C" }, row, { responsibleMemberId: "B" })).toBe(
      false,
    );
  });
  it("'Só meu' atual é tratado por assertCanWritePlanned", () => {
    expect(
      violatesPlannedCapture(
        { memberId: "C" },
        { ...row, isSharedExpense: false },
        { responsibleMemberId: "C" },
      ),
    ).toBe(false);
  });
});
