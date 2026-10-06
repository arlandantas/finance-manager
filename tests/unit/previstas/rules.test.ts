import { describe, expect, it } from "vitest";
import { formatBRL } from "@/lib/money";
import {
  comparePayables,
  differenceLabel,
  isHomeEligible,
  isPlannedOverdue,
  plannedDifference,
} from "@/modules/previstas/rules";
import type { PayableItemDTO } from "@/modules/previstas/schemas";
import {
  CreatePlannedExpenseSchema,
  PayPlannedExpenseSchema,
  UpdatePlannedExpenseSchema,
} from "@/modules/previstas/schemas";

const uuid = "11111111-1111-4111-8111-111111111111";
const issues = (input: unknown) => {
  const r = CreatePlannedExpenseSchema.safeParse(input);
  return r.success
    ? []
    : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
};

describe("US-018 Vencimento passado fica atrasado (isPlannedOverdue)", () => {
  it("dueOn < hoje => atrasada; dueOn = hoje ou futura => não", () => {
    expect(isPlannedOverdue({ status: "PREVISTO", dueOn: "2026-10-27" }, "2026-10-28")).toBe(true);
    expect(isPlannedOverdue({ status: "PREVISTO", dueOn: "2026-10-28" }, "2026-10-28")).toBe(false);
    expect(isPlannedOverdue({ status: "PREVISTO", dueOn: "2026-10-29" }, "2026-10-28")).toBe(false);
  });
  it("paga nunca é atrasada", () => {
    expect(isPlannedOverdue({ status: "PAGO", dueOn: "2026-01-01" }, "2026-10-28")).toBe(false);
  });
});

describe("US-019 Diferença entre efetivo e previsto", () => {
  it("positiva, negativa e zero", () => {
    expect(plannedDifference(65000, 68250)).toBe(3250);
    expect(plannedDifference(65000, 60000)).toBe(-5000);
    expect(plannedDifference(65000, 65000)).toBe(0);
  });
  it("rótulo ao vivo", () => {
    expect(differenceLabel(3250, formatBRL)).toBe(`+${formatBRL(3250)} sobre o previsto`);
    expect(differenceLabel(-1000, formatBRL)).toBe(`-${formatBRL(1000)} abaixo do previsto`);
    expect(differenceLabel(0, formatBRL)).toBe("Igual ao previsto");
  });
});

describe("US-018 Bloco 'A pagar' da Home e ordenação", () => {
  it("elegível: atrasado, hoje e até hoje + 7 (borda); hoje + 8 fora", () => {
    expect(isHomeEligible("2026-10-20", "2026-10-28", "2026-11-04")).toBe(true);
    expect(isHomeEligible("2026-10-28", "2026-10-28", "2026-11-04")).toBe(true);
    expect(isHomeEligible("2026-11-04", "2026-10-28", "2026-11-04")).toBe(true);
    expect(isHomeEligible("2026-11-05", "2026-10-28", "2026-11-04")).toBe(false);
  });
  it("comparePayables: atrasados primeiro, depois vencimento, depois título", () => {
    const item = (title: string, dueOn: string, isOverdue: boolean): PayableItemDTO => ({
      type: "PLANNED",
      id: title,
      title,
      dueOn,
      amountInCents: 1,
      isOverdue,
      responsible: null,
      isSharedExpense: true,
      isRecurring: false,
      paymentAccountName: null,
      href: "",
    });
    const list = [
      item("Luz", "2026-10-30", false),
      item("Água", "2026-10-30", false),
      item("Internet", "2026-10-20", true),
      item("Escola", "2026-10-25", true),
    ].sort(comparePayables);
    expect(list.map((i) => i.title)).toEqual(["Internet", "Escola", "Água", "Luz"]);
  });
});

describe("US-018 Campos obrigatórios (CreatePlannedExpenseSchema)", () => {
  it("sem descrição, valor e categoria => 3 mensagens exatas", () => {
    const list = issues({});
    expect(list).toContainEqual({ path: "description", message: "Informe a descrição" });
    expect(list).toContainEqual({
      path: "amountInCents",
      message: "Informe um valor maior que zero",
    });
    expect(list).toContainEqual({ path: "categoryId", message: "Escolha uma categoria" });
  });
  it("descrição 'A' => mínimo de 2; vazia => 'Informe a descrição'", () => {
    expect(issues({ description: "A", amountInCents: 100, categoryId: uuid })).toContainEqual({
      path: "description",
      message: "A descrição deve ter no mínimo 2 caracteres",
    });
    expect(issues({ description: "  ", amountInCents: 100, categoryId: uuid })).toContainEqual({
      path: "description",
      message: "Informe a descrição",
    });
  });
  it("valor 0, descrição longa, observação longa, .strict()", () => {
    const ok = { description: "Luz", amountInCents: 100, categoryId: uuid };
    expect(issues({ ...ok, amountInCents: 0 }).length).toBeGreaterThan(0);
    expect(issues({ ...ok, description: "x".repeat(101) })).toContainEqual({
      path: "description",
      message: "A descrição deve ter no máximo 100 caracteres",
    });
    expect(issues({ ...ok, note: "x".repeat(501) })).toContainEqual({
      path: "note",
      message: "A observação deve ter no máximo 500 caracteres",
    });
    for (const extra of [{ status: "PAGO" }, { paidTransactionId: uuid }, { familyId: uuid }]) {
      expect(issues({ ...ok, ...extra }).length).toBeGreaterThan(0);
    }
    expect(issues(ok)).toEqual([]);
  });
  it("padrão de 'Dividir com a família' é desligado: Só meu (US-030, D-GES-15)", () => {
    expect(
      CreatePlannedExpenseSchema.parse({ description: "Luz", amountInCents: 1, categoryId: uuid })
        .isSharedExpense,
    ).toBe(false);
  });
});

describe("US-019 Schemas de baixa e edição", () => {
  it("baixa: conta obrigatória e valor > 0", () => {
    const r = PayPlannedExpenseSchema.safeParse({ version: 1, amountInCents: 0 });
    const msgs = r.success ? [] : r.error.issues.map((i) => i.message);
    expect(msgs).toContain("Escolha a conta do pagamento");
    expect(msgs).toContain("Informe um valor maior que zero");
  });
  it("edição aceita note null e rejeita campos estranhos", () => {
    expect(UpdatePlannedExpenseSchema.safeParse({ version: 1, note: null }).success).toBe(true);
    expect(UpdatePlannedExpenseSchema.safeParse({ version: 1, status: "PAGO" }).success).toBe(
      false,
    );
  });
});
