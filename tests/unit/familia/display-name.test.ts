import { describe, expect, it } from "vitest";
import {
  memberDisplayName,
  memberFirstName,
  memberOptionLabel,
  nameKey,
  RESERVED_NAME_KEYS,
  samePerson,
  sanitizeMemberName,
  toMemberRef,
  UNLINKED_BADGE,
} from "@/modules/familia/display-name";

const user = (o: { name?: string | null; email?: string; deletedAt?: Date | null } = {}) => ({
  name: o.name === undefined ? "Mariana Silva" : o.name,
  email: o.email ?? "mariana@exemplo.com",
  deletedAt: o.deletedAt ?? null,
});

describe("US-092a memberDisplayName (SDD-033 §8.1-1)", () => {
  it("members.name vence user.name, que vence a parte local do e-mail", () => {
    expect(memberDisplayName({ name: "Mari", user: user() })).toBe("Mari");
    expect(memberDisplayName({ name: null, user: user() })).toBe("Mariana Silva");
    expect(memberDisplayName({ user: user({ name: null }) })).toBe("mariana");
  });

  it("sem conta (user nulo): usa members.name; sem nada, 'Membro'", () => {
    expect(memberDisplayName({ name: "Ana", user: null })).toBe("Ana");
    expect(memberDisplayName({ user: null })).toBe("Membro");
  });

  it("conta excluída: nunca o nome antigo, nem o members.name", () => {
    const deleted = user({ name: "Conta excluída", deletedAt: new Date() });
    expect(memberDisplayName({ name: "Bia", user: deleted })).toBe("Conta excluída");
    expect(memberDisplayName({ name: null, user: deleted })).toBe("Conta excluída");
  });

  it("memberFirstName", () => {
    expect(memberFirstName({ name: "Ana Maria Souza", user: null })).toBe("Ana");
    expect(memberFirstName({ user: user() })).toBe("Mariana");
  });

  it("nameKey ignora caixa, acentos, espaços repetidos e caracteres invisíveis", () => {
    expect(nameKey("  Ána  Maria ")).toBe(nameKey("ana maria"));
    expect(nameKey("Ana​")).toBe(nameKey("Ana"));
    expect(nameKey("Ａna")).toBe(nameKey("Ana")); // forma de compatibilidade (NFKC)
    expect(sanitizeMemberName("  A‮b   c ")).toBe("Ab c");
  });

  it("termos reservados batem pela chave", () => {
    expect(RESERVED_NAME_KEYS.has(nameKey("Conta excluída"))).toBe(true);
    expect(RESERVED_NAME_KEYS.has(nameKey("Sem acesso ao App"))).toBe(true);
    expect(RESERVED_NAME_KEYS.has(nameKey("Ana"))).toBe(false);
  });
});

describe("US-092a toMemberRef e samePerson", () => {
  it("sem conta leva unlinked; ex-membro sem conta leva removed e unlinked; nunca e-mail", () => {
    expect(toMemberRef({ id: "m1", name: "Ana", user: null })).toEqual({
      id: "m1",
      name: "Ana",
      image: null,
      unlinked: true,
    });
    const ex = toMemberRef({ id: "m2", name: "Beto", removedAt: new Date(), user: null });
    expect(ex).toMatchObject({ removed: true, unlinked: true });
    expect(JSON.stringify(ex)).not.toContain("@");
  });

  it("com conta não leva unlinked", () => {
    expect(toMemberRef({ id: "m1", user: { ...user(), image: "x.png" } })).toEqual({
      id: "m1",
      name: "Mariana Silva",
      image: "x.png",
    });
  });

  it("samePerson: null/undefined nunca são iguais a nada (SEC-058)", () => {
    expect(samePerson("a", "a")).toBe(true);
    expect(samePerson("a", "b")).toBe(false);
    expect(samePerson(null, null)).toBe(false);
    expect(samePerson(undefined, undefined)).toBe(false);
    expect(samePerson(null, "a")).toBe(false);
  });
});

describe("US-093a memberOptionLabel", () => {
  it("sem conta ganha o sufixo textual; com conta fica só o nome", () => {
    expect(memberOptionLabel({ name: "Ana", unlinked: true })).toBe("Ana · sem acesso ao app");
    expect(memberOptionLabel({ name: "Lucas" })).toBe("Lucas");
    expect(UNLINKED_BADGE).toBe("Sem acesso ao app");
  });
});
