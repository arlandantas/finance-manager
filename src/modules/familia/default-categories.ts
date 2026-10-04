// Categorias padrão da família (SDD-003 §4.3). A ordem é o `sortOrder`; os nomes são exatos.
export type DefaultCategory = { kind: "EXPENSE" | "INCOME"; name: string; icon: string };

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { kind: "EXPENSE", name: "Supermercado", icon: "shopping-cart" },
  { kind: "EXPENSE", name: "Moradia", icon: "home" },
  { kind: "EXPENSE", name: "Contas e serviços", icon: "receipt" },
  { kind: "EXPENSE", name: "Transporte", icon: "car" },
  { kind: "EXPENSE", name: "Saúde", icon: "pill" },
  { kind: "EXPENSE", name: "Educação", icon: "graduation-cap" },
  { kind: "EXPENSE", name: "Lazer e restaurantes", icon: "utensils" },
  { kind: "EXPENSE", name: "Outros", icon: "package" },
  { kind: "INCOME", name: "Salário", icon: "wallet" },
  { kind: "INCOME", name: "Rendimentos", icon: "trending-up" },
  { kind: "INCOME", name: "Outras receitas", icon: "plus-circle" },
];
