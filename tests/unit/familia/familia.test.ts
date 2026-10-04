import { describe, expect, it } from "vitest";
import { DEFAULT_CATEGORIES } from "@/modules/familia/default-categories";
import { CreateFamilySchema, CreateInvitationSchema, emailSchema } from "@/modules/familia/schemas";
import { suggestFamilyName } from "@/modules/familia/suggest-name";

const INVALID = "Informe um nome com pelo menos 2 caracteres";

describe("US-002 Nome sugerido: suggestFamilyName", () => {
  it.each([
    ["Mariana Silva", "Família Silva"],
    ["Mariana", ""],
    ["  Ana  Maria de Souza ", "Família Souza"],
    ["", ""],
    [null, ""],
    ["João D", ""],
  ])("%j => %j", (nome, esperado) => {
    expect(suggestFamilyName(nome)).toBe(esperado);
  });
});

describe("US-002 Nome inválido: CreateFamilySchema", () => {
  it.each(["", " a ", "a", "   "])("rejeita %j com a mensagem do PO", (name) => {
    const r = CreateFamilySchema.safeParse({ name });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe(INVALID);
  });

  it("rejeita nome ausente com a mesma mensagem", () => {
    const r = CreateFamilySchema.safeParse({});
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]?.message).toBe(INVALID);
  });

  it("aparam espaços, limitam a 60 caracteres e são strict", () => {
    expect(CreateFamilySchema.parse({ name: "  Família Silva " })).toEqual({
      name: "Família Silva",
    });
    expect(CreateFamilySchema.safeParse({ name: "x".repeat(61) }).success).toBe(false);
    expect(CreateFamilySchema.safeParse({ name: "Família", familyId: "x" }).success).toBe(false);
  });
});

describe("US-002 Criar família com sucesso: categorias padrão", () => {
  it("8 categorias de despesa e 3 de receita, com os nomes exatos e ordem estável", () => {
    const despesas = DEFAULT_CATEGORIES.filter((c) => c.kind === "EXPENSE").map((c) => c.name);
    const receitas = DEFAULT_CATEGORIES.filter((c) => c.kind === "INCOME").map((c) => c.name);
    expect(despesas).toEqual([
      "Supermercado",
      "Moradia",
      "Contas e serviços",
      "Transporte",
      "Saúde",
      "Educação",
      "Lazer e restaurantes",
      "Outros",
    ]);
    expect(receitas).toEqual(["Salário", "Rendimentos", "Outras receitas"]);
  });
});

describe("US-003 (base) e-mail", () => {
  it("normaliza e valida", () => {
    expect(emailSchema.parse("  Lucas@Exemplo.COM ")).toBe("lucas@exemplo.com");
    for (const bad of ["lucas@", "lucas", "", "@x.com"]) {
      const r = emailSchema.safeParse(bad);
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0]?.message).toBe("Informe um e-mail válido");
    }
  });

  it("convite: papel padrão MEMBER e strict", () => {
    expect(CreateInvitationSchema.parse({ email: "a@b.com" })).toEqual({
      email: "a@b.com",
      role: "MEMBER",
    });
    expect(CreateInvitationSchema.safeParse({ email: "a@b.com", familyId: "x" }).success).toBe(
      false,
    );
  });
});
