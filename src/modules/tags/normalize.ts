/**
 * Normalização das tags (SDD-016 §4.1, ADR-022 §1). PURO: sem banco, relógio nem Next.
 * A unicidade por família vive em `nameKey`; `name` guarda a grafia da 1ª criação.
 */
export const TAG_MIN = 2;
export const TAG_MAX = 30;
export const MAX_TAGS_PER_TRANSACTION = 20;
export const SOFT_TAG_LIMIT = 3;

/** Grafia gravada: NFC, sem espaços nas pontas, espaços internos viram hífen ("Viagem  Nordeste" ⇒ "Viagem-Nordeste"). */
export function canonicalTagName(name: string): string {
  return name.normalize("NFC").trim().replace(/\s+/g, "-");
}

/** Chave de unicidade: sem acento, minúscula, espaços ⇒ hífen, hífens repetidos ⇒ um. Idempotente. */
export function normalizeTagKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("pt-BR")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-{2,}/g, "-");
}

export type TagInputName = { name: string; key: string };

/** Remove duplicatas por chave mantendo a 1ª grafia (ordem de entrada). */
export function dedupeTagNames(names: string[]): TagInputName[] {
  const seen = new Map<string, TagInputName>();
  for (const raw of names) {
    const key = normalizeTagKey(raw);
    if (!seen.has(key)) seen.set(key, { name: canonicalTagName(raw), key });
  }
  return [...seen.values()];
}
