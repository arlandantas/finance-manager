import { z } from "zod";

// US-050 (SDD-017 §2): paleta fechada de 10 cores por conta/cartão. PURO (entra em PURE do check:imports).
export const ACCOUNT_COLORS = [
  "BLUE",
  "GREEN",
  "PURPLE",
  "ORANGE",
  "PINK",
  "TEAL",
  "RED",
  "YELLOW",
  "GRAY",
  "BROWN",
] as const;
export type AccountColor = (typeof ACCOUNT_COLORS)[number];

export const ACCOUNT_COLOR_LABEL: Record<AccountColor, string> = {
  BLUE: "Azul",
  GREEN: "Verde",
  PURPLE: "Roxo",
  ORANGE: "Laranja",
  PINK: "Rosa",
  TEAL: "Turquesa",
  RED: "Vermelho",
  YELLOW: "Amarelo",
  GRAY: "Cinza",
  BROWN: "Marrom",
};

export const accountColorSchema = z.enum(ACCOUNT_COLORS, { error: "Escolha uma cor" });

/** 1ª cor da paleta ainda não usada; se todas estão em uso, a menos usada (empate: ordem da paleta). */
export function pickNextColor(used: readonly AccountColor[]): AccountColor {
  const count = new Map<AccountColor, number>(ACCOUNT_COLORS.map((c) => [c, 0]));
  for (const c of used) count.set(c, (count.get(c) ?? 0) + 1);
  let best: AccountColor = ACCOUNT_COLORS[0];
  let bestCount = Number.POSITIVE_INFINITY;
  for (const c of ACCOUNT_COLORS) {
    const n = count.get(c) ?? 0;
    if (n < bestCount) {
      best = c;
      bestCount = n;
    }
  }
  return best;
}
