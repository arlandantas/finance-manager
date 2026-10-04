import { z } from "zod";
import { versionSchema } from "@/lib/schemas";

// SDD-007 §2. Lista fechada de ícones: 11 padrão + 15 novas.
export const CATEGORY_ICON_KEYS = [
  "shopping-cart",
  "home",
  "receipt",
  "car",
  "pill",
  "graduation-cap",
  "utensils",
  "package",
  "wallet",
  "trending-up",
  "plus-circle",
  "paw-print",
  "baby",
  "plane",
  "shirt",
  "gift",
  "dumbbell",
  "tv",
  "wrench",
  "heart",
  "briefcase",
  "fuel",
  "bus",
  "coffee",
  "music",
  "book-open",
] as const;
export type CategoryIconKey = (typeof CATEGORY_ICON_KEYS)[number];

/** Rótulos acessíveis dos ícones na galeria. */
export const CATEGORY_ICON_LABELS: Record<CategoryIconKey, string> = {
  "shopping-cart": "Carrinho",
  home: "Casa",
  receipt: "Recibo",
  car: "Carro",
  pill: "Remédio",
  "graduation-cap": "Formatura",
  utensils: "Talheres",
  package: "Pacote",
  wallet: "Carteira",
  "trending-up": "Gráfico em alta",
  "plus-circle": "Mais",
  "paw-print": "Patinha",
  baby: "Bebê",
  plane: "Avião",
  shirt: "Camiseta",
  gift: "Presente",
  dumbbell: "Halter",
  tv: "TV",
  wrench: "Chave inglesa",
  heart: "Coração",
  briefcase: "Maleta",
  fuel: "Combustível",
  bus: "Ônibus",
  coffee: "Café",
  music: "Música",
  "book-open": "Livro",
};

export const MAX_CATEGORIES_PER_KIND = 40;

export const MIN_NAME_MESSAGE = "Informe um nome com ao menos 2 caracteres";
export const MAX_NAME_MESSAGE = "O nome deve ter no máximo 30 caracteres";

const nameSchema = z
  .string({ error: MIN_NAME_MESSAGE })
  .trim()
  .min(2, MIN_NAME_MESSAGE)
  .max(30, MAX_NAME_MESSAGE);
const iconSchema = z.enum(CATEGORY_ICON_KEYS, { error: "Escolha um ícone" });

export const CreateCategorySchema = z
  .object({
    kind: z.enum(["EXPENSE", "INCOME"], { error: "Escolha o tipo da categoria" }),
    name: nameSchema,
    icon: iconSchema.default("package"),
  })
  .strict();
export type CreateCategoryInput = z.input<typeof CreateCategorySchema>;
export type CreateCategoryParsed = z.output<typeof CreateCategorySchema>;

export const UpdateCategorySchema = z
  .object({
    version: versionSchema,
    name: nameSchema.optional(),
    icon: iconSchema.optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.icon !== undefined, { message: "Nada para alterar" });
export type UpdateCategoryInput = z.input<typeof UpdateCategorySchema>;

export const CategoryStateSchema = z.object({ version: versionSchema }).strict(); // archive / unarchive

export const CategoriesQuerySchema = z
  .object({
    kind: z.enum(["EXPENSE", "INCOME"]).optional(),
    includeArchived: z
      .enum(["true", "false"])
      .transform((v) => v === "true")
      .optional(),
  })
  .strict();

export type CategoryDTO = {
  id: string;
  name: string;
  kind: "EXPENSE" | "INCOME";
  icon: string;
  archived: boolean;
  version: number;
};
