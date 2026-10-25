import { describe, expect, it } from "vitest";
import { canWriteTransaction, isPersonalExpense } from "@/modules/transacoes/ownership";

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
  it("dono = pagador; outro membro não escreve", () => {
    expect(canWriteTransaction(row(), member("m1"), false)).toBe(true);
    expect(canWriteTransaction(row(), member("m2"), false)).toBe(false);
    expect(canWriteTransaction(row(), member("m2", "ADMIN"), false)).toBe(false);
  });
  it("autor que não pagou não escreve; sem pagador, o autor é o dono", () => {
    expect(canWriteTransaction(row({ payerMemberId: "m2" }), member("m1"), false)).toBe(false);
    expect(canWriteTransaction(row({ payerMemberId: null }), member("m1"), false)).toBe(true);
  });
  it("dono removido: somente leitura para todos", () => {
    expect(canWriteTransaction(row(), member("m2"), true)).toBe(false);
    expect(canWriteTransaction(row(), member("m2", "ADMIN"), true)).toBe(false);
    expect(canWriteTransaction(row(), member("m1"), true)).toBe(false);
  });
  it("despesa dividida e receita: qualquer membro", () => {
    expect(canWriteTransaction(row({ isSharedExpense: true }), member("m2"), false)).toBe(true);
    expect(canWriteTransaction(row({ kind: "INCOME" }), member("m2"), false)).toBe(true);
  });
});
