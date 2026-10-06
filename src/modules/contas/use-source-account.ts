"use client";

import { useEffect, useState } from "react";
import type { AccountDTO } from "@/modules/contas/schemas";
import {
  insufficient,
  type SourceSuggestion,
  suggestSourceAccount,
} from "@/modules/contas/suggest-source";

export const SOURCE_REASON_TEXT: Record<SourceSuggestion["reason"], string> = {
  OWNER_ENOUGH: "Conta do titular com saldo suficiente",
  OTHER_ENOUGH: "Outra conta com saldo suficiente",
  HIGHEST_BALANCE: "Nenhuma conta cobre o valor",
  NONE: "",
};

/** Marca textual do seletor: permanece com os valores ocultos (US-023). */
export const INSUFFICIENT_TEXT = "saldo insuficiente";

/**
 * Conta de origem de um pagamento (US-023, SDD-013 §6): sugere por `suggestSourceAccount`, recalcula ao
 * mudar o valor enquanto o usuário não escolheu e, depois da escolha manual (`userPicked`), respeita-a.
 */
export function useSourceAccount(o: {
  open: boolean;
  amountInCents: number;
  ownerMemberId: string | undefined;
  accounts: AccountDTO[];
  /** Conta já prevista (US-059): vale enquanto ativa e enquanto o usuário não escolher outra. */
  preferredAccountId?: string | null | undefined;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  useEffect(() => {
    if (o.open) setPicked(null);
  }, [o.open]);
  const suggestion = suggestSourceAccount({
    amountInCents: o.amountInCents,
    ownerMemberId: o.ownerMemberId ?? "",
    accounts: o.accounts.map((a) => ({
      id: a.id,
      ownerMemberId: a.owner.id,
      balanceInCents: a.balanceInCents,
      archived: false,
      usageCountByMe: a.usageCountByMe,
    })),
  });
  const preferred = o.accounts.some((a) => a.id === o.preferredAccountId)
    ? (o.preferredAccountId ?? null)
    : null;
  const accountId = picked ?? preferred ?? suggestion.accountId ?? "";
  return {
    accountId,
    pick: (id: string) => setPicked(id),
    userPicked: picked !== null,
    suggestion,
    reasonText:
      picked !== null ? "" : preferred ? "Conta prevista" : SOURCE_REASON_TEXT[suggestion.reason],
    optionSuffix: (a: AccountDTO) =>
      insufficient(a, o.amountInCents) ? ` · ${INSUFFICIENT_TEXT}` : "",
  };
}
