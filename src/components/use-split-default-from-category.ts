"use client";

import { useReducer } from "react";
import type { SplitModeValue } from "@/components/split-mode-selector";

/**
 * US-044: modo de divisão do lançamento novo. A categoria com `defaultSplit` sugere "Pela regra" enquanto a pessoa
 * não escolheu (`userPicked`); escolha manual vale até fechar o formulário e nunca é desfeita pela categoria.
 */
export type SplitPick = {
  mode: SplitModeValue;
  userPicked: boolean;
  base: SplitModeValue; // padrão do modo da porta ("Já aconteceu" = Só meu)
  categoryDefault: boolean;
};

export type SplitPickEvent =
  | { type: "category"; defaultSplit: boolean }
  | { type: "pick"; mode: SplitModeValue }
  | { type: "base"; base: SplitModeValue }
  | { type: "reset"; base: SplitModeValue };

export const initialSplitPick = (base: SplitModeValue): SplitPick => ({
  mode: base,
  userPicked: false,
  base,
  categoryDefault: false,
});

const suggested = (s: Pick<SplitPick, "base" | "categoryDefault">): SplitModeValue =>
  s.categoryDefault ? "RULE" : s.base;

export function splitPickReducer(state: SplitPick, e: SplitPickEvent): SplitPick {
  switch (e.type) {
    case "pick":
      return { ...state, mode: e.mode, userPicked: true };
    case "reset":
      return initialSplitPick(e.base);
    case "category": {
      const next = { ...state, categoryDefault: e.defaultSplit };
      return state.userPicked ? next : { ...next, mode: suggested(next) };
    }
    case "base": {
      const next = { ...state, base: e.base };
      return state.userPicked ? next : { ...next, mode: suggested(next) };
    }
  }
}

export function useSplitDefaultFromCategory(base: SplitModeValue) {
  const [state, dispatch] = useReducer(splitPickReducer, base, initialSplitPick);
  return {
    mode: state.mode,
    userPicked: state.userPicked,
    pick: (mode: SplitModeValue) => dispatch({ type: "pick", mode }),
    onCategory: (defaultSplit: boolean) => dispatch({ type: "category", defaultSplit }),
    setBase: (b: SplitModeValue) => dispatch({ type: "base", base: b }),
    reset: (b: SplitModeValue) => dispatch({ type: "reset", base: b }),
  };
}
