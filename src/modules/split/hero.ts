import { formatBRL } from "@/lib/money";
import type { SettlementDTO } from "@/modules/split/schemas";

const firstName = (name: string) => name.split(" ")[0] ?? name;

/** Frase-herói do acerto (SDD-002 §6.1); a Home usa os mesmos textos (SDD-005 §4.2). */
export function heroText(s: Pick<SettlementDTO, "status" | "suggestions">): {
  title: string;
  detail?: string;
} {
  const first = s.suggestions[0];
  switch (s.status) {
    case "PENDING":
      return first
        ? {
            title: `${firstName(first.from.name)} deve ${formatBRL(first.amountInCents)} para ${firstName(first.to.name)}`,
          }
        : { title: "Tudo certo neste mês" };
    case "BALANCED":
    case "SETTLED":
      return { title: "Tudo certo neste mês" };
    case "EMPTY":
      return {
        title: "Nenhuma despesa comum neste mês.",
        detail: "Marque despesas como Dividir com a família para vê-las aqui.",
      };
    case "NEEDS_MORE_MEMBERS":
      return { title: "O acerto exige pelo menos dois membros" };
  }
}
