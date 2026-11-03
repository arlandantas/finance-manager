import { describe, expect, it } from "vitest";
import { plannedCopy } from "@/modules/previstas/copy";
import { compareReceivables, sliceReceivables } from "@/modules/previstas/rules";
import {
  CreatePlannedExpenseSchema,
  type ReceivableItemDTO,
  UpdatePlannedExpenseSchema,
} from "@/modules/previstas/schemas";

const uuid = "11111111-1111-4111-8111-111111111111";
const item = (title: string, dueOn: string, isOverdue: boolean): ReceivableItemDTO => ({
  id: title,
  title,
  dueOn,
  amountInCents: 100,
  isOverdue,
  category: { id: uuid, name: "Salário", icon: "x" },
  responsible: { id: uuid, name: "Mariana", image: null },
  destinationAccount: null,
  isSharedExpense: false,
  href: "/previstas?tab=receber",
});

describe("US-051 plannedCopy por kind", () => {
  it("mensagens de receita", () => {
    const c = plannedCopy("INCOME");
    expect(c.created).toBe("Receita prevista cadastrada");
    expect(c.alreadyPaid).toBe("Esta receita prevista já foi recebida");
    expect(c.notPaid).toBe("Esta receita prevista não foi recebida");
    expect(c.futureDate).toBe("A data do recebimento não pode ser futura");
    expect(c.versionConflict("Lucas")).toBe(
      "Esta receita prevista foi alterada por Lucas. Recarregue para continuar.",
    );
    expect(c.undoAction).toBe("Desfazer recebimento");
  });
  it("mensagens de despesa não mudaram", () => {
    const c = plannedCopy("EXPENSE");
    expect(c.alreadyPaid).toBe("Esta despesa prevista já foi paga");
    expect(c.notPaid).toBe("Esta despesa prevista não está paga");
    expect(c.futureDate).toBe("A data do pagamento não pode ser futura");
    expect(c.paidLocked).toBe(
      "Despesa prevista paga não pode ser alterada. Use Desfazer pagamento.",
    );
    expect(c.linkedToPlanned).toBe(
      "Esta despesa veio de uma despesa prevista. Use Desfazer pagamento.",
    );
  });
});

describe("US-051 schemas", () => {
  const base = { description: "Salário", amountInCents: 500000, categoryId: uuid };
  it("kind padrão EXPENSE", () => {
    const r = CreatePlannedExpenseSchema.parse(base);
    expect(r.kind).toBe("EXPENSE");
  });
  it("receita dividida => 'Receita não é dividida'", () => {
    const r = CreatePlannedExpenseSchema.safeParse({
      ...base,
      kind: "INCOME",
      isSharedExpense: true,
    });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Receita não é dividida");
  });
  it("valor zero => 'Informe um valor maior que zero'", () => {
    const r = CreatePlannedExpenseSchema.safeParse({ ...base, kind: "INCOME", amountInCents: 0 });
    expect(r.error?.issues[0]?.message).toBe("Informe um valor maior que zero");
  });
  it("PATCH rejeita kind (strict)", () => {
    expect(UpdatePlannedExpenseSchema.safeParse({ version: 1, kind: "EXPENSE" }).success).toBe(
      false,
    );
  });
});

describe("US-051 recorte de A receber", () => {
  const period = { start: "2026-10-01", end: "2026-10-31" };
  const all = [
    item("B", "2026-10-20", false),
    item("A", "2026-10-05", true),
    item("Antiga", "2026-09-10", true),
    item("Futura", "2026-11-02", false),
  ];
  it("mês corrente: período + atrasadas anteriores, atrasadas primeiro", () => {
    expect(sliceReceivables(all, { period, isCurrent: true }).map((i) => i.title)).toEqual([
      "Antiga",
      "A",
      "B",
    ]);
  });
  it("outro mês: só o que cai no período", () => {
    expect(sliceReceivables(all, { period, isCurrent: false }).map((i) => i.title)).toEqual([
      "A",
      "B",
    ]);
  });
  it("ordem: atrasada, data, título", () => {
    expect(
      compareReceivables(item("Z", "2026-10-01", true), item("A", "2026-10-01", false)),
    ).toBeLessThan(0);
  });
});
