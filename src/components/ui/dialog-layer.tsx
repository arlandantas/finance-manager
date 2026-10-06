"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Camada única de diálogos (US-056, SDD-019 §1): cada diálogo aberto recebe uma profundidade
 * (0, 1, 2…) pela ordem de abertura. Overlay z = 40 + 20·d e conteúdo z = 50 + 20·d, de modo que
 * uma confirmação aberta de dentro de outro diálogo cobre o de baixo (overlay próprio).
 * Esc e clique fora já respeitam a pilha do Radix (só o de cima fecha).
 */
const stack: symbol[] = [];

export function dialogZ(depth: number): { overlay: number; content: number } {
  return { overlay: 40 + 20 * depth, content: 50 + 20 * depth };
}

export function useDialogDepth(open: boolean): number {
  const [depth, setDepth] = useState(0);
  useLayoutEffect(() => {
    if (!open) return;
    const id = Symbol("dialog");
    stack.push(id);
    setDepth(stack.length - 1);
    return () => {
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
  return depth;
}
