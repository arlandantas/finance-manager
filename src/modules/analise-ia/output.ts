import { z } from "zod";
import { type AnalysisPayload, fold, memberWordSet } from "@/modules/analise-ia/payload";

// SDD-023 §2.2: a saída da LLM NÃO tem campos numéricos. Todo valor exibido é calculado pelo app.
// Texto da IA com dígito, "R$", "%", URL ou nome de membro é SUBSTITUÍDO por texto padrão local.
// PURO.

const shortText = z.string().trim().min(1).max(240);
export const AnalysisOutputSchema = z
  .object({
    summary: z.string().trim().min(1).max(500),
    categories: z
      .array(
        z
          .object({
            ref: z.string(),
            class: z.enum(["ESSENTIAL", "IMPORTANT", "SUPERFLUOUS"]),
            reason: shortText,
          })
          .strict(),
      )
      .max(60),
    avoidable: z.array(z.object({ ref: z.string(), reason: shortText }).strict()).max(10),
  })
  .strict();
export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

export type CategoryClass = "ESSENTIAL" | "IMPORTANT" | "SUPERFLUOUS" | "UNCLASSIFIED";

/** Resultado reconciliado, gravado em `spending_analyses.result`. Nenhum campo numérico. */
export type AnalysisResult = {
  summary: string;
  summaryFromAi: boolean;
  categories: { ref: string; class: CategoryClass; reason: string; reasonFromAi: boolean }[];
  avoidable: { ref: string; reason: string; reasonFromAi: boolean }[];
};

/** Resposta de domínio inválida (refs desconhecidos/duplicados): vira `LLM_INVALID_RESPONSE`. */
export class InvalidAnalysisOutput extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "InvalidAnalysisOutput";
  }
}

const CLASS_PT: Record<Exclude<CategoryClass, "UNCLASSIFIED">, string> = {
  ESSENTIAL: "Essencial",
  IMPORTANT: "Importante",
  SUPERFLUOUS: "Supérfluo",
};
export const CLASS_LABEL: Record<CategoryClass, string> = {
  ...CLASS_PT,
  UNCLASSIFIED: "Sem classificação",
};

export const DEFAULT_SUMMARY =
  "Veja abaixo como cada categoria foi classificada e onde pode haver margem para economizar.";
export const DEFAULT_UNCLASSIFIED = "A análise não classificou esta categoria.";
export const DEFAULT_AVOIDABLE_RECURRING =
  "Gasto recorrente que se repete nos meses analisados. Vale conferir se ainda faz sentido.";
export const DEFAULT_AVOIDABLE_CATEGORY =
  "Categoria com margem para reduzir. Vale conferir os lançamentos.";
const defaultClassReason = (c: Exclude<CategoryClass, "UNCLASSIFIED">) =>
  `Classificada como ${CLASS_PT[c]} neste mês`;

const URL_RE = /https?:|www\.|\.com\b|\.br\b/i;

/** `null` se o texto traz número, "R$", "%", URL ou nome de membro. */
export function cleanAiText(text: string, memberNames: string[]): string | null {
  const t = text.normalize("NFKC").trim();
  if (!t) return null;
  if (/\d|R\$|%/.test(t) || URL_RE.test(t)) return null;
  const words = memberWordSet(memberNames);
  for (const w of fold(t).split(/[^a-z0-9]+/)) {
    if (w.length >= 3 && words.has(w)) return null;
  }
  return t;
}

/**
 * Validação de domínio depois do schema: refs ⊂ enviados e sem duplicatas (senão `InvalidAnalysisOutput`);
 * categoria enviada sem classificação ⇒ "Sem classificação"; textos sujos ⇒ texto padrão.
 */
export function reconcileOutput(
  out: AnalysisOutput,
  payload: AnalysisPayload,
  memberNames: string[],
): AnalysisResult {
  const catRefs = new Set(payload.categories.map((c) => c.ref));
  const recRefs = new Set(payload.recurring.map((r) => r.ref));
  const seenCat = new Set<string>();
  for (const c of out.categories) {
    if (!catRefs.has(c.ref)) throw new InvalidAnalysisOutput("ref de categoria desconhecido");
    if (seenCat.has(c.ref)) throw new InvalidAnalysisOutput("ref de categoria duplicado");
    seenCat.add(c.ref);
  }
  const seenAv = new Set<string>();
  for (const a of out.avoidable) {
    if (!catRefs.has(a.ref) && !recRefs.has(a.ref)) {
      throw new InvalidAnalysisOutput("ref de gasto evitável desconhecido");
    }
    if (seenAv.has(a.ref)) throw new InvalidAnalysisOutput("ref de gasto evitável duplicado");
    seenAv.add(a.ref);
  }
  const byRef = new Map(out.categories.map((c) => [c.ref, c]));
  const summaryClean = cleanAiText(out.summary, memberNames);
  return {
    summary: summaryClean ?? DEFAULT_SUMMARY,
    summaryFromAi: summaryClean !== null,
    categories: payload.categories.map((c) => {
      const o = byRef.get(c.ref);
      if (!o) {
        return {
          ref: c.ref,
          class: "UNCLASSIFIED" as const,
          reason: DEFAULT_UNCLASSIFIED,
          reasonFromAi: false,
        };
      }
      const clean = cleanAiText(o.reason, memberNames);
      return {
        ref: c.ref,
        class: o.class,
        reason: clean ?? defaultClassReason(o.class),
        reasonFromAi: clean !== null,
      };
    }),
    avoidable: out.avoidable.map((a) => {
      const clean = cleanAiText(a.reason, memberNames);
      return {
        ref: a.ref,
        reason:
          clean ?? (recRefs.has(a.ref) ? DEFAULT_AVOIDABLE_RECURRING : DEFAULT_AVOIDABLE_CATEGORY),
        reasonFromAi: clean !== null,
      };
    }),
  };
}
