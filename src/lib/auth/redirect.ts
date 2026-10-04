/** Aceita somente caminhos relativos locais (anti open redirect, SDD-003 §1). */
export function safeCallbackUrl(raw: string | null | undefined): string {
  if (!raw) return "/";
  return /^\/(?!\/)[^\\]*$/.test(raw) ? raw : "/";
}
