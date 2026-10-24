import { z } from "zod";
import { versionSchema } from "@/lib/schemas";

// SDD-022 §2: o cliente nunca envia o texto, só a versão que exibiu (prova de que viu a vigente).
export const AiPurposeSchema = z.enum(["SPENDING_ANALYSIS", "INVOICE_IMPORT"]);
export const EnableConsentSchema = z
  .object({ textVersion: z.number().int().min(1), familyVersion: versionSchema })
  .strict();
export const DisableConsentSchema = z.object({ familyVersion: versionSchema }).strict();
export type EnableConsentInput = z.infer<typeof EnableConsentSchema>;
export type DisableConsentInput = z.infer<typeof DisableConsentSchema>;
