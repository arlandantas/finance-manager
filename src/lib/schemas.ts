import { z } from "zod";

// Contratos comuns (SDD-000 §6)
export const uuidSchema = z.uuid({ error: "Identificador inválido" });
export const versionSchema = z.number().int().min(1);
export const periodKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Período inválido");
export const idempotencyKeySchema = z.uuid();

export const memberRefSchema = z.object({
  id: uuidSchema,
  name: z.string(),
  image: z.string().nullable(),
});
export type MemberRef = z.infer<typeof memberRefSchema>;
