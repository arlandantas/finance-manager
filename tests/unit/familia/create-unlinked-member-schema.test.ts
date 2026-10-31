import { describe, expect, it } from "vitest";
import { CreateUnlinkedMemberSchema } from "@/modules/familia/schemas";

// US-092b (SDD-033 §8.1.2)
const parse = (v: unknown) => CreateUnlinkedMemberSchema.safeParse(v);

describe("CreateUnlinkedMemberSchema", () => {
  it("nome 1/2/60/61 caracteres", () => {
    expect(parse({ name: "A" }).success).toBe(false);
    expect(parse({ name: "Ab" }).success).toBe(true);
    expect(parse({ name: "A".repeat(60) }).success).toBe(true);
    expect(parse({ name: "A".repeat(61) }).success).toBe(false);
  });
  it("espaços colapsados, aparados e invisíveis removidos", () => {
    expect(parse({ name: "  Ana   Maria  " }).data?.name).toBe("Ana Maria");
    expect(parse({ name: "Ana​" }).data?.name).toBe("Ana");
    expect(parse({ name: "Ａna" }).data?.name).toBe("Ana");
    expect(parse({ name: " ​ " }).success).toBe(false);
  });
  it("e-mail vazio => undefined; maiúsculas => minúsculo; inválido recusa", () => {
    expect(parse({ name: "Ana", email: "" }).data?.email).toBeUndefined();
    expect(parse({ name: "Ana", email: "  " }).data?.email).toBeUndefined();
    expect(parse({ name: "Ana" }).data?.email).toBeUndefined();
    expect(parse({ name: "Ana", email: "Ana@Exemplo.COM" }).data?.email).toBe("ana@exemplo.com");
    expect(parse({ name: "Ana", email: "x" }).success).toBe(false);
  });
  it("campo extra recusa (.strict())", () => {
    expect(parse({ name: "Ana", joinedAt: "2020-01-01" }).success).toBe(false);
    expect(parse({ name: "Ana", role: "ADMIN" }).success).toBe(false);
    expect(parse({ name: "Ana", userId: "x" }).success).toBe(false);
  });
});
