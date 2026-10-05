import { formatBRL } from "@/lib/money";
import { SPLIT_COPY } from "@/modules/split/copy";
import type { SettlementDTO } from "@/modules/split/schemas";

const firstName = (name: string) => name.split(" ")[0] ?? name;

/** Frase-herói do acerto (SDD-011 §4.3, texto neutro); a Home usa os mesmos textos. */
export function heroText(s: Pick<SettlementDTO, "status" | "suggestions">): {
  title: string;
  detail?: string;
} {
  const first = s.suggestions[0];
  switch (s.status) {
    case "PENDING":
      return first
        ? {
            title: SPLIT_COPY.heroPending(
              firstName(first.from.name),
              firstName(first.to.name),
              formatBRL(first.amountInCents),
            ),
          }
        : { title: SPLIT_COPY.allOk };
    case "BALANCED":
    case "SETTLED":
      return { title: SPLIT_COPY.allOk };
    case "EMPTY":
      return { title: SPLIT_COPY.empty, detail: SPLIT_COPY.emptyHint };
    case "NEEDS_MORE_MEMBERS":
      return { title: SPLIT_COPY.needsMembers };
  }
}
