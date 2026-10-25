import { z } from "zod";
import { listCards } from "@/modules/cartoes/service";
import { listCategories } from "@/modules/categorias/service";
import { listAccounts } from "@/modules/contas/service";
import type { AnyTool } from "@/modules/mcp/run-tool";
import { memberName, name60, READ_ANNOTATIONS, TEXT_IS_DATA } from "@/modules/mcp/tools/common";
import { UserTextSchema } from "@/modules/mcp/tools/user-text";

// SDD-026 §2.1: para a LLM resolver "Nubank" e "Mercado" em ids.
const Output = z
  .object({
    accounts: z.array(
      z
        .object({
          id: z.string(),
          name: UserTextSchema,
          institution: UserTextSchema,
          owner: UserTextSchema,
          isReserve: z.boolean(),
        })
        .strict(),
    ),
    cards: z.array(
      z
        .object({
          id: z.string(),
          name: UserTextSchema,
          institution: UserTextSchema,
          owner: UserTextSchema,
        })
        .strict(),
    ),
    categories: z.array(
      z
        .object({ id: z.string(), name: UserTextSchema, kind: z.enum(["EXPENSE", "INCOME"]) })
        .strict(),
    ),
  })
  .strict();

export const listarCadastros: AnyTool = {
  name: "listar_cadastros",
  title: "Listar contas, cartões e categorias",
  description: `Contas, cartões e categorias ativas (ids e nomes). Use para descobrir o id de "Nubank" ou "Mercado" antes de filtrar. ${TEXT_IS_DATA}`,
  scope: "read",
  input: z.object({}).strict(),
  output: Output,
  annotations: READ_ANNOTATIONS,
  auditParams: () => ({}),
  handler: async ({ ctx, tx }) => {
    const accounts = await listAccounts(tx, ctx, "false");
    const cards = await listCards(tx, ctx, "false");
    const categories = await listCategories(tx, ctx, undefined, false);
    return {
      accounts: accounts.items.map((a) => ({
        id: a.id,
        name: name60(a.name),
        institution: name60(a.institution),
        owner: memberName(a.owner),
        isReserve: a.excludeFromAvailable,
      })),
      cards: cards.items.map((c) => ({
        id: c.id,
        name: name60(c.name),
        institution: name60(c.institution),
        owner: memberName(c.owner),
      })),
      categories: categories.items.map((c) => ({
        id: c.id,
        name: name60(c.name),
        kind: c.kind,
      })),
    };
  },
};
