/** Normalização única de e-mail (SDD-003 §1): trim + minúsculas. */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
