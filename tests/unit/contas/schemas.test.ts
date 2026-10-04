import { describe, expect, it } from "vitest";
import { CreateAccountSchema, RenameAccountSchema } from "@/modules/contas/schemas";

const issues = (input: unknown) => {
  const r = CreateAccountSchema.safeParse(input);
  return r.success
    ? []
    : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
};

describe("US-004 Campos obrigatórios: CreateAccountSchema", () => {
  it("sem nome e sem tipo: mensagens nos campos", () => {
    const list = issues({});
    expect(list).toContainEqual({ path: "name", message: "Informe o nome da conta" });
    expect(list).toContainEqual({ path: "type", message: "Escolha o tipo da conta" });
  });

  it("nome vazio, curto ou só espaços", () => {
    for (const name of ["", " a ", "   "]) {
      expect(issues({ name, type: "CHECKING" })).toContainEqual({
        path: "name",
        message: "Informe o nome da conta",
      });
    }
  });

  it("nome com mais de 60 caracteres", () => {
    expect(issues({ name: "x".repeat(61), type: "CHECKING" })).toContainEqual({
      path: "name",
      message: "O nome deve ter no máximo 60 caracteres",
    });
  });

  it("tipo inválido", () => {
    expect(issues({ name: "Itaú", type: "CREDIT" })).toContainEqual({
      path: "type",
      message: "Escolha o tipo da conta",
    });
  });

  it("padrões: instituição Outro, saldo 0; aceita saldo negativo (cheque especial)", () => {
    expect(CreateAccountSchema.parse({ name: "  Itaú Mariana ", type: "CHECKING" })).toEqual({
      name: "Itaú Mariana",
      institution: "Outro",
      type: "CHECKING",
      openingBalanceInCents: 0,
    });
    expect(
      CreateAccountSchema.parse({ name: "Itaú", type: "CHECKING", openingBalanceInCents: -30000 })
        .openingBalanceInCents,
    ).toBe(-30000);
  });

  it("saldo inicial precisa ser inteiro de centavos e dentro do limite", () => {
    expect(
      issues({ name: "Itaú", type: "CHECKING", openingBalanceInCents: 10.5 }).length,
    ).toBeGreaterThan(0);
    expect(
      issues({ name: "Itaú", type: "CHECKING", openingBalanceInCents: 10_000_000_000 }).length,
    ).toBeGreaterThan(0);
  });

  it("é strict: rejeita familyId e campos desconhecidos", () => {
    expect(issues({ name: "Itaú", type: "CHECKING", familyId: "x" }).length).toBeGreaterThan(0);
  });

  it("data de abertura precisa ser data válida", () => {
    expect(issues({ name: "Itaú", type: "CHECKING", openingDate: "2026-13-40" })).toContainEqual({
      path: "openingDate",
      message: "Data inválida",
    });
  });
});

describe("US-004 Renomear conta: RenameAccountSchema", () => {
  it("exige nome válido e version >= 1", () => {
    expect(RenameAccountSchema.safeParse({ name: "Itaú Principal", version: 1 }).success).toBe(
      true,
    );
    expect(RenameAccountSchema.safeParse({ name: "a", version: 1 }).success).toBe(false);
    expect(RenameAccountSchema.safeParse({ name: "Itaú Principal" }).success).toBe(false);
    expect(RenameAccountSchema.safeParse({ name: "Itaú Principal", version: 0 }).success).toBe(
      false,
    );
  });
});
