import type { FakeFixtures } from "@/modules/ia/fake-adapter";

// SDD-023 §8.3: respostas do provedor SIMULADO para a análise. Como as referências C*/R* são sorteadas por
// pedido, cada fixture é uma função do `input` (o payload canônico) e usa só os refs que vieram nele.
// Somente dev/teste: o provedor real nunca passa por aqui.

type In = {
  categories: { ref: string; label: string }[];
  recurring: { ref: string; categoryRef: string }[];
};

const ESSENTIAL = /moradia|supermercado|mercado|sa[uú]de|transporte|contas|educa/i;
const SUPERFLUOUS = /lazer|restaurante|outros|streaming/i;
const cls = (label: string) =>
  ESSENTIAL.test(label) ? "ESSENTIAL" : SUPERFLUOUS.test(label) ? "SUPERFLUOUS" : "IMPORTANT";

const REASON: Record<string, string> = {
  ESSENTIAL: "Despesa básica da rotina da casa",
  IMPORTANT: "Melhora a vida da família, mas pode ser ajustada",
  SUPERFLUOUS: "Dá para reduzir sem prejuízo para a rotina",
};

function ok(i: In) {
  const categories = i.categories.map((c) => ({
    ref: c.ref,
    class: cls(c.label),
    reason: REASON[cls(c.label)] as string,
  }));
  const superfluousRefs = new Set(
    i.categories.filter((c) => cls(c.label) === "SUPERFLUOUS").map((c) => c.ref),
  );
  const avoidable = [
    ...i.recurring
      .filter((r) => superfluousRefs.has(r.categoryRef))
      .map((r) => ({ ref: r.ref, reason: "Assinatura presente em todos os meses" })),
    ...i.categories
      .filter((c) => cls(c.label) === "SUPERFLUOUS")
      .map((c) => ({ ref: c.ref, reason: "Gasto que costuma variar e pode ser reduzido" })),
  ].slice(0, 10);
  return {
    summary:
      "A família mantém as despesas essenciais estáveis e tem margem em lazer e assinaturas recorrentes.",
    categories,
    avoidable,
  };
}

const withFirstReason = (i: In, text: string) => {
  const base = ok(i);
  const first = base.categories.find((c) => c.class === "SUPERFLUOUS") ?? base.categories[0];
  if (first) first.reason = text;
  return base;
};

export const spendingAnalysisFixtures: NonNullable<FakeFixtures["SPENDING_ANALYSIS"]> = {
  ok,
  invalid_json: () => "{ isto não é json",
  schema_violation: (i: In) => ({
    summary: "Resumo",
    categories: i.categories.map((c) => ({ ref: c.ref, class: "TALVEZ", reason: "x" })),
    avoidable: [],
  }),
  // O número está no TEXTO do motivo: o app o substitui; o valor mostrado continua sendo o do sistema.
  numbers_in_text: (i: In) => {
    const base = withFirstReason(i, "Lazer custou R$ 999,00 neste mês");
    base.summary = "A família gastou R$ 999,00 em lazer, 35% a mais";
    return base;
  },
  member_name_in_text: (i: In) => {
    const base = withFirstReason(i, "Mariana gastou mais que Lucas nesta categoria");
    base.summary = "Lucas e Mariana têm gastos parecidos";
    return base;
  },
  unknown_ids: (i: In) => {
    const base = ok(i);
    base.categories.push({ ref: "C99", class: "ESSENTIAL", reason: "Categoria que não existe" });
    return base;
  },
  duplicate_refs: (i: In) => {
    const base = ok(i);
    if (base.categories[0]) base.categories.push({ ...base.categories[0] });
    return base;
  },
};
