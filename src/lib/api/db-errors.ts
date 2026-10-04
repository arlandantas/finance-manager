import { Prisma } from "@/generated/prisma/client";

/** Erro de violação de unicidade (P2002), com o texto de alvo/índice quando disponível. */
export function uniqueViolation(e: unknown): { target: string } | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return null;
  const meta = (e.meta ?? {}) as { target?: unknown; driverAdapterError?: unknown };
  const target = Array.isArray(meta.target) ? meta.target.join(",") : String(meta.target ?? "");
  const adapter = meta.driverAdapterError ? JSON.stringify(meta.driverAdapterError) : "";
  return { target: `${target} ${adapter} ${e.message}`.trim() };
}

export const isUniqueViolation = (e: unknown, hint?: string): boolean => {
  const v = uniqueViolation(e);
  return v !== null && (hint === undefined || v.target.includes(hint));
};
