import { describe, expect, it } from "vitest";
import { CreateTransactionSchema } from "@/modules/transacoes/schemas";

const uuid = "11111111-1111-4111-8111-111111111111";
const base = { type: "EXPENSE", accountId: uuid, categoryId: uuid, amountInCents: 15050 } as const;

const messages = (input: unknown) => {
  const r = CreateTransactionSchema.safeParse(input);
  return r.success
    ? []
    : r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
};

describe("US-005 Valor obrigatório e positivo: CreateTransactionSchema", () => {
  it.each([0, -5, 1.5, undefined])(
    "valor %j => 'Informe um valor maior que zero'",
    (amountInCents) => {
      expect(messages({ ...base, amountInCents })).toContainEqual({
        path: "amountInCents",
        message: "Informe um valor maior que zero",
      });
    },
  );

  it("valor acima do limite", () => {
    expect(messages({ ...base, amountInCents: 10_000_000_000 })).toContainEqual({
      path: "amountInCents",
      message: "Valor acima do limite permitido",
    });
  });
});

describe("US-005 Categoria obrigatória", () => {
  it("sem categoryId => 'Escolha uma categoria'", () => {
    const { categoryId: _c, ...rest } = base;
    expect(messages(rest)).toContainEqual({ path: "categoryId", message: "Escolha uma categoria" });
  });

  it("despesa sem conta nem cartão => 'Escolha uma conta ou um cartão' (SDD-008 §10)", () => {
    const { accountId: _a, ...rest } = base;
    expect(messages(rest)).toContainEqual({
      path: "accountId",
      message: "Escolha uma conta ou um cartão",
    });
  });

  it("conta e cartão juntos => 'Informe a conta ou o cartão, não os dois'", () => {
    expect(messages({ ...base, cardId: "7b9c4f6e-2d7e-4f6a-9d3e-0a1b2c3d4e5f" })).toContainEqual({
      path: "cardId",
      message: "Informe a conta ou o cartão, não os dois",
    });
  });

  it("compra no cartão (cardId sem conta) é válida; receita com cardId => rejeitada (.strict)", () => {
    const { accountId: _a, ...rest } = base;
    const card = "7b9c4f6e-2d7e-4f6a-9d3e-0a1b2c3d4e5f";
    expect(messages({ ...rest, cardId: card })).toEqual([]);
    expect(messages({ ...base, type: "INCOME", cardId: card }).length).toBeGreaterThan(0);
  });
});

describe("US-005 Descrição omitida", () => {
  it("ausente, vazia e só espaços são tratadas como ausentes", () => {
    for (const description of [undefined, "", "   "]) {
      const r = CreateTransactionSchema.parse({ ...base, description });
      expect((r as { description?: string }).description).toBeUndefined();
    }
  });

  it("2..100 caracteres quando informada", () => {
    expect(messages({ ...base, description: "a" })).toContainEqual({
      path: "description",
      message: "A descrição precisa ter entre 2 e 100 caracteres",
    });
    expect(messages({ ...base, description: "x".repeat(101) })).toContainEqual({
      path: "description",
      message: "A descrição precisa ter entre 2 e 100 caracteres",
    });
    expect(CreateTransactionSchema.parse({ ...base, description: "  Feira  " })).toMatchObject({
      description: "Feira",
    });
  });
});

describe("US-005/US-006 padrões e campos proibidos", () => {
  it("despesa: isSharedExpense padrão false (Só meu, US-030)", () => {
    expect(CreateTransactionSchema.parse(base)).toMatchObject({ isSharedExpense: false });
  });

  it("(infra) .strict(): familyId e authorMemberId são rejeitados", () => {
    expect(messages({ ...base, familyId: uuid }).length).toBeGreaterThan(0);
    expect(messages({ ...base, authorMemberId: uuid }).length).toBeGreaterThan(0);
  });

  it("Interface de receita não exibe divisão: isSharedExpense em receita é rejeitado", () => {
    expect(messages({ ...base, type: "INCOME", isSharedExpense: true }).length).toBeGreaterThan(0);
    expect(CreateTransactionSchema.safeParse({ ...base, type: "INCOME" }).success).toBe(true);
  });

  it("tipo inválido ou ausente", () => {
    expect(messages({ ...base, type: "TRANSFER_OUT" }).length).toBeGreaterThan(0);
    const { type: _t, ...rest } = base;
    expect(messages(rest).length).toBeGreaterThan(0);
  });

  it("data de calendário válida", () => {
    expect(messages({ ...base, occurredOn: "2026-02-31" })).toContainEqual({
      path: "occurredOn",
      message: "Data inválida",
    });
  });
});

describe("US-024 busca por descrição (q) e mensagem única", () => {
  it("q: 2..50 caracteres, com trim", async () => {
    const { ListTransactionsQuerySchema } = await import("@/modules/transacoes/schemas");
    expect(ListTransactionsQuerySchema.parse({ q: "  bairro " }).q).toBe("bairro");
    expect(ListTransactionsQuerySchema.safeParse({ q: "a" }).error?.issues[0]?.message).toBe(
      "Digite ao menos 2 letras",
    );
    expect(ListTransactionsQuerySchema.safeParse({ q: "x".repeat(51) }).success).toBe(false);
  });

  it("escapeLike trata %, _ e \\ como literais", async () => {
    const { escapeLike } = await import("@/modules/transacoes/extrato");
    expect(escapeLike("100%_a\\b")).toBe("100\\%\\_a\\\\b");
  });

  it("a mesma mensagem vale para descrição curta e longa em despesa, receita e edição", async () => {
    const { DESCRIPTION_MSG, UpdateTransactionSchema } = await import(
      "@/modules/transacoes/schemas"
    );
    expect(DESCRIPTION_MSG).toBe("A descrição precisa ter entre 2 e 100 caracteres");
    for (const description of ["a", "x".repeat(101)]) {
      const r = UpdateTransactionSchema.safeParse({ version: 1, description });
      expect(r.error?.issues[0]?.message).toBe(DESCRIPTION_MSG);
    }
  });
});
