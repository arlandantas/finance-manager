import { z } from "zod";

// US-069 (spec 13, regra 18): corpo da reversão `.strict()`. `familyId`, autor e carimbo nunca vêm do cliente.
export const RevertImportBodySchema = z
  .object({
    version: z.number().int().min(1),
    confirmEditedItems: z.boolean().optional(),
    confirmSettledPeriod: z.boolean().optional(),
  })
  .strict();
export type RevertImportBody = z.infer<typeof RevertImportBodySchema>;
