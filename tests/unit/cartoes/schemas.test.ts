import { describe, expect, it } from "vitest";
import { CreateCardSchema, UpdateCardSchema } from "@/modules/cartoes/schemas";

const issues = (input: unknown) => {
  const r = CreateCardSchema.safeParse(input);
  return r.success
    ? []
    : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
};

describe("US-015 Campos obrigatórios e limites (CreateCardSchema)", () => {
  it("sem nome, limite e dias => as 4 mensagens exatas", () => {
    const list = issues({});
    expect(list).toContainEqual({ path: "name", message: "Informe o nome do cartão" });
    expect(list).toContainEqual({
      path: "limitInCents",
      message: "Informe um limite maior que zero",
    });
    expect(list).toContainEqual({
      path: "closingDay",
      message: "Escolha o dia de fechamento (1 a 28)",
    });
    expect(list).toContainEqual({
      path: "dueDay",
      message: "Escolha o dia de vencimento (1 a 28)",
    });
  });

  it("dias fora de 1..28 ou não inteiros", () => {
    for (const day of [31, 29, 0, -1, 1.5]) {
      expect(issues({ name: "Nu", limitInCents: 100, closingDay: day, dueDay: 5 })).toContainEqual({
        path: "closingDay",
        message: "Escolha o dia de fechamento (1 a 28)",
      });
    }
    expect(issues({ name: "Nu", limitInCents: 100, closingDay: 1, dueDay: 28 })).toEqual([]);
    expect(issues({ name: "Nu", limitInCents: 100, closingDay: 28, dueDay: 1 })).toEqual([]);
  });

  it("limite inválido: 0, negativo, fracionado e acima do máximo", () => {
    for (const limit of [0, -1]) {
      expect(issues({ name: "Nu", limitInCents: limit, closingDay: 1, dueDay: 2 })).toContainEqual({
        path: "limitInCents",
        message: "Informe um limite maior que zero",
      });
    }
    expect(issues({ name: "Nu", limitInCents: 1.5, closingDay: 1, dueDay: 2 })).toContainEqual({
      path: "limitInCents",
      message: "O limite deve ser um número inteiro de centavos",
    });
    expect(
      issues({ name: "Nu", limitInCents: 10_000_000_000, closingDay: 1, dueDay: 2 }),
    ).toContainEqual({
      path: "limitInCents",
      message: "Valor acima do limite permitido",
    });
  });

  it("nome aparado, instituição padrão 'Outro' e .strict()", () => {
    const r = CreateCardSchema.parse({
      name: "  Nubank  ",
      limitInCents: 500000,
      closingDay: 25,
      dueDay: 5,
    });
    expect(r).toMatchObject({ name: "Nubank", institution: "Outro" });
    expect(
      issues({ name: "Nu", limitInCents: 1, closingDay: 1, dueDay: 2, familyId: "x" }).length,
    ).toBeGreaterThan(0);
    expect(
      issues({ name: "Nu", limitInCents: 1, closingDay: 1, dueDay: 2, closingDate: "x" }).length,
    ).toBeGreaterThan(0);
  });
});

describe("US-015 UpdateCardSchema", () => {
  it("exige ao menos um campo além de version", () => {
    expect(UpdateCardSchema.safeParse({ version: 1 }).success).toBe(false);
    expect(UpdateCardSchema.safeParse({ version: 1, limitInCents: 600000 }).success).toBe(true);
  });
});

describe("US-089 conta pagadora (SDD-030 §9.1)", () => {
  const base = { name: "Nubank", limitInCents: 100000, closingDay: 10, dueDay: 20 };
  const uuid = "11111111-1111-4111-8111-111111111111";

  it("aceita uuid, null e omitido; rejeita não-uuid com a mensagem", () => {
    expect(CreateCardSchema.safeParse({ ...base, paymentAccountId: uuid }).success).toBe(true);
    expect(CreateCardSchema.safeParse({ ...base, paymentAccountId: null }).success).toBe(true);
    expect(CreateCardSchema.safeParse(base).success).toBe(true);
    const r = CreateCardSchema.safeParse({ ...base, paymentAccountId: "abc" });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe("Escolha uma conta bancária ativa");
  });

  it("Update só com paymentAccountId: null não cai em 'Nada para alterar'", () => {
    expect(UpdateCardSchema.safeParse({ version: 1, paymentAccountId: null }).success).toBe(true);
    expect(UpdateCardSchema.safeParse({ version: 1 }).success).toBe(false);
  });
});
