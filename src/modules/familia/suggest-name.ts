/**
 * Nome sugerido da família (SDD-003 §4.4): último token do nome com >= 2 letras.
 * "Mariana Silva" -> "Família Silva"; "Mariana" -> "".
 */
export function suggestFamilyName(userName: string | null | undefined): string {
  const tokens = (userName ?? "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 2) return "";
  const last = tokens[tokens.length - 1] as string;
  return last.replace(/[^\p{L}]/gu, "").length >= 2 ? `Família ${last}` : "";
}
