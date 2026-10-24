import { createHash } from "node:crypto";
import { z } from "zod";
import { CATEGORY_ICON_KEYS, type CategoryIconKey } from "@/modules/categorias/schemas";

// SDD-023 §2.1 / ADR-029 §2, §3, §5: o payload enviado ao LLM é CONSTRUÍDO (nunca filtrado de objetos de
// domínio) e validado por um schema Zod `.strict()` em todos os níveis. PURO: sem Next, Prisma nem relógio.
// O único texto livre é o rótulo saneado da categoria. Acrescentar um campo exige mudar o teste de chaves
// e o ADR-029.

const centsInt = z.number().int().min(0).max(10_000_000_000);
const relMonth = z.number().int().min(-5).max(0);
const categoryRef = z.string().regex(/^C([1-9]|[1-9]\d)$/);

/** Sem dígitos, `@` nem `:`; só letras, espaços e pontuação simples. */
export const SafeLabelSchema = z
  .string()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{M} ,.&/()'-]+$/u);
export const CategoryIconSchema = z.enum(CATEGORY_ICON_KEYS);

export const AnalysisPayloadSchema = z
  .object({
    schemaVersion: z.literal(1),
    locale: z.literal("pt-BR"),
    currency: z.literal("BRL"),
    partial: z.boolean(), // o mês 0 é o corrente
    months: z
      .array(
        z.object({ rel: relMonth, expenseInCents: centsInt, incomeInCents: centsInt }).strict(),
      )
      .min(2)
      .max(6),
    categories: z
      .array(
        z
          .object({
            ref: categoryRef,
            label: SafeLabelSchema,
            icon: CategoryIconSchema,
            totals: z
              .array(
                z
                  .object({
                    rel: relMonth,
                    amountInCents: centsInt,
                    count: z.number().int().min(0).max(100000),
                  })
                  .strict(),
              )
              .max(6),
          })
          .strict(),
      )
      .max(60),
    recurring: z
      .array(
        z
          .object({
            ref: z.string().regex(/^R([1-9]|1[0-5])$/),
            categoryRef,
            source: z.enum(["SCHEDULED", "DETECTED"]),
            monthlyAvgInCents: centsInt,
            presentIn: z.array(relMonth).min(2).max(6),
          })
          .strict(),
      )
      .max(15),
  })
  .strict();
export type AnalysisPayload = z.infer<typeof AnalysisPayloadSchema>;

// ── Entradas (agregados já calculados no servidor) ──

export type SpendingAggregates = {
  months: { rel: number; expenseInCents: number; incomeInCents: number }[];
  categories: {
    id: string;
    name: string;
    icon: CategoryIconKey;
    totals: { rel: number; amountInCents: number; count: number }[];
  }[];
};

export type RecurringCandidate = {
  descriptionKey: string | null;
  displayName: string; // só local: nunca vai ao payload
  categoryId: string;
  source: "SCHEDULED" | "DETECTED";
  recurringExpenseId: string | null;
  monthlyAvgInCents: number;
  presentIn: number[];
};

export type RefMap = {
  categories: Record<string, string /* categoryId */>;
  recurring: Record<
    string,
    {
      descriptionKey: string | null;
      displayName: string;
      categoryId: string;
      source: "SCHEDULED" | "DETECTED";
      recurringExpenseId: string | null;
    }
  >;
};

/** Chave de descarte (US-071) de um recorrente: o candidato descartado não entra no payload. */
export function recurringDismissKey(c: {
  categoryId: string;
  descriptionKey: string | null;
  recurringExpenseId: string | null;
}): string {
  return `RECURRING|${c.categoryId}|${c.descriptionKey ?? c.recurringExpenseId ?? ""}`;
}

// ── Saneamento do rótulo (ADR-029 §3) ──

const FALLBACK_LABEL = "Outra categoria";
const STOPWORDS = new Set(["de", "da", "do", "das", "dos", "e", "a", "o"]);
// Defesa extra (não está no SDD): rótulos com cara de instrução ao modelo viram a categoria genérica.
const INSTRUCTION_LIKE =
  /\b(ignor\w*|desconsider\w*|esque[cç]\w*|instru[cç]\w*|prompt|system|assistant|developer|regras?|previous|override|jailbreak)\b/i;

/** Minúsculas, sem acento (NFD). */
export function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** Palavras (≥ 3 letras, fora conectivos) dos nomes, sobrenomes e partes de e-mail dos membros. */
export function memberWordSet(memberNames: string[]): Set<string> {
  const out = new Set<string>();
  for (const entry of memberNames) {
    for (const w of fold(entry.normalize("NFKC")).split(/[^a-z0-9]+/)) {
      if (w.length >= 3 && !STOPWORDS.has(w)) out.add(w);
    }
  }
  return out;
}

export function sanitizeCategoryLabel(name: string, memberNames: string[]): string {
  const words = memberWordSet(memberNames);
  const kept: string[] = [];
  for (const raw of name.normalize("NFKC").split(/\s+/)) {
    if (!raw) continue;
    if (/@|https?:|www\./i.test(raw)) continue; // e-mail ou URL: descarta o token inteiro
    let token = raw;
    if (/\d/.test(token)) {
      token = token.replace(/\d+/g, "");
      if (!/\p{L}/u.test(token)) continue; // sobrou só pontuação de um número (CPF, cartão)
    }
    token = token.replace(/[^\p{L}\p{M},.&/()'-]/gu, ""); // só o conjunto permitido
    if (!token) continue;
    // palavra a palavra, inclusive coladas por pontuação ("Lucas&Silva", "joão/maria")
    kept.push(
      token.replace(/[\p{L}\p{M}]+/gu, (w) => {
        const bare = fold(w);
        return bare.length >= 3 && words.has(bare) ? "pessoa" : w;
      }),
    );
  }
  let label = kept.join(" ").replace(/\s+/g, " ").trim();
  if (INSTRUCTION_LIKE.test(label)) return FALLBACK_LABEL;
  if (label.length > 40) label = label.slice(0, 40).trim();
  if (!/\p{L}/u.test(label)) return FALLBACK_LABEL;
  return label;
}

// ── Prova de anonimização (ADR-029 §5) ──

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

function collectStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) for (const x of v) collectStrings(x, out);
  else if (v && typeof v === "object") for (const x of Object.values(v)) collectStrings(x, out);
  return out;
}

/**
 * Lança se QUALQUER string do payload contiver um identificador proibido (sem caixa nem acento) ou um
 * UUID. Proibido de uma só palavra casa por palavra inteira ("ana" não acusa "banana"); frases, e-mails
 * e números casam por trecho.
 */
export function assertNoIdentifiers(payload: unknown, forbidden: string[]): void {
  const strings = collectStrings(payload).map((s) => fold(s.normalize("NFKC")));
  for (const s of strings) {
    if (UUID.test(s)) throw new Error("payload contém um identificador (UUID)");
    if (s.includes("@")) throw new Error("payload contém um e-mail");
  }
  for (const raw of forbidden) {
    const f = fold(raw.normalize("NFKC")).trim();
    if (f.length < 3) continue;
    const single = /^[a-z0-9]+$/.test(f);
    for (const s of strings) {
      const hit = single ? s.split(/[^a-z0-9]+/).includes(f) : s.includes(f);
      if (hit) throw new Error("payload contém um dado identificável");
    }
  }
}

// ── Construção ──

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: T[], rnd: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j] as T, a[i] as T];
  }
  return a;
}

/**
 * PURO: refs `C*`/`R*` sorteados por pedido (PRNG semeado, testável); só o necessário entra.
 * Mais de 60 categorias: ficam as de maior total no período. Recorrente descartado, com categoria fora do
 * payload ou presente em menos de 2 meses não entra.
 */
export function buildAnalysisPayload(i: {
  aggregates: SpendingAggregates;
  recurring: RecurringCandidate[];
  dismissedKeys: Set<string>;
  memberNames: string[];
  partial: boolean;
  seed: string;
}): { payload: AnalysisPayload; refMap: RefMap } {
  const rnd = seededRandom(i.seed);
  const total = (c: SpendingAggregates["categories"][number]) =>
    c.totals.reduce((s, t) => s + t.amountInCents, 0);
  const cats = [...i.aggregates.categories]
    .filter((c) => c.totals.some((t) => t.amountInCents > 0 || t.count > 0))
    .sort((a, b) => total(b) - total(a))
    .slice(0, 60);
  const ordered = shuffled(cats, rnd);
  const refMap: RefMap = { categories: {}, recurring: {} };
  const catRefById = new Map<string, string>();
  const categories = ordered.map((c, idx) => {
    const ref = `C${idx + 1}`;
    refMap.categories[ref] = c.id;
    catRefById.set(c.id, ref);
    return {
      ref,
      label: sanitizeCategoryLabel(c.name, i.memberNames),
      icon: c.icon,
      totals: c.totals.map((t) => ({ rel: t.rel, amountInCents: t.amountInCents, count: t.count })),
    };
  });
  const recurringIn = i.recurring
    .filter((r) => !i.dismissedKeys.has(recurringDismissKey(r)))
    .filter((r) => catRefById.has(r.categoryId) && r.presentIn.length >= 2)
    .sort((a, b) => b.monthlyAvgInCents - a.monthlyAvgInCents)
    .slice(0, 15);
  const recurring = shuffled(recurringIn, rnd).map((r, idx) => {
    const ref = `R${idx + 1}`;
    refMap.recurring[ref] = {
      descriptionKey: r.descriptionKey,
      displayName: r.displayName,
      categoryId: r.categoryId,
      source: r.source,
      recurringExpenseId: r.recurringExpenseId,
    };
    return {
      ref,
      categoryRef: catRefById.get(r.categoryId) as string,
      source: r.source,
      monthlyAvgInCents: r.monthlyAvgInCents,
      presentIn: [...r.presentIn].sort((a, b) => a - b),
    };
  });
  const payload = AnalysisPayloadSchema.parse({
    schemaVersion: 1,
    locale: "pt-BR",
    currency: "BRL",
    partial: i.partial,
    months: [...i.aggregates.months].sort((a, b) => a.rel - b.rel),
    categories,
    recurring,
  });
  assertNoIdentifiers(payload, i.memberNames);
  return { payload, refMap };
}

// ── "O que será enviado" = o que é enviado ──

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([k, x]) => [k, sortKeys(x)]),
    );
  }
  return v;
}

/** JSON canônico (chaves ordenadas, sem espaços): exibido ao usuário, enviado ao LLM e base do hash. */
export function canonicalJson(payload: AnalysisPayload): string {
  return JSON.stringify(sortKeys(payload));
}

export function previewHash(payload: AnalysisPayload): string {
  return createHash("sha256").update(canonicalJson(payload)).digest("hex");
}
