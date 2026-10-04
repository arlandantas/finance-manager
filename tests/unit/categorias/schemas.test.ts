import { describe, expect, it } from "vitest";
import { CATEGORY_ICON_MAP_KEYS } from "@/components/category-icon";
import {
  CATEGORY_ICON_KEYS,
  CATEGORY_ICON_LABELS,
  CreateCategorySchema,
  UpdateCategorySchema,
} from "@/modules/categorias/schemas";

const issues = (input: unknown) => {
  const r = CreateCategorySchema.safeParse(input);
  return r.success
    ? []
    : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
};

describe("US-014 Nome muito curto / longo (CreateCategorySchema)", () => {
  it("'A' => mensagem de mínimo", () => {
    expect(issues({ kind: "EXPENSE", name: "A" })).toContainEqual({
      path: "name",
      message: "Informe um nome com ao menos 2 caracteres",
    });
    expect(issues({ kind: "EXPENSE", name: "   " })).toContainEqual({
      path: "name",
      message: "Informe um nome com ao menos 2 caracteres",
    });
  });

  it("31 caracteres => mensagem de máximo; 30 passa", () => {
    expect(issues({ kind: "EXPENSE", name: "x".repeat(31) })).toContainEqual({
      path: "name",
      message: "O nome deve ter no máximo 30 caracteres",
    });
    expect(issues({ kind: "EXPENSE", name: "x".repeat(30) })).toEqual([]);
  });

  it("nome é aparado e o ícone padrão é 'package'", () => {
    const r = CreateCategorySchema.parse({ kind: "INCOME", name: "  Pet  " });
    expect(r).toEqual({ kind: "INCOME", name: "Pet", icon: "package" });
  });

  it("tipo ausente e ícone fora da lista", () => {
    expect(issues({ name: "Pet" })).toContainEqual({
      path: "kind",
      message: "Escolha o tipo da categoria",
    });
    expect(issues({ kind: "EXPENSE", name: "Pet", icon: "banana" })).toContainEqual({
      path: "icon",
      message: "Escolha um ícone",
    });
  });

  it(".strict() rejeita familyId e archivedAt", () => {
    expect(issues({ kind: "EXPENSE", name: "Pet", familyId: "x" }).length).toBeGreaterThan(0);
    expect(issues({ kind: "EXPENSE", name: "Pet", archivedAt: "x" }).length).toBeGreaterThan(0);
  });
});

describe("US-014 UpdateCategorySchema", () => {
  it("exige name ou icon", () => {
    expect(UpdateCategorySchema.safeParse({ version: 1 }).success).toBe(false);
    expect(UpdateCategorySchema.safeParse({ version: 1, name: "Pet" }).success).toBe(true);
    expect(UpdateCategorySchema.safeParse({ version: 1, icon: "heart" }).success).toBe(true);
  });
});

describe("US-014 (infra) Ícones", () => {
  it("toda chave de CATEGORY_ICON_KEYS tem ícone e rótulo; são 26 chaves", () => {
    expect(CATEGORY_ICON_KEYS).toHaveLength(26);
    for (const k of CATEGORY_ICON_KEYS) {
      expect(CATEGORY_ICON_MAP_KEYS).toContain(k);
      expect(CATEGORY_ICON_LABELS[k]).toBeTruthy();
    }
  });
});
