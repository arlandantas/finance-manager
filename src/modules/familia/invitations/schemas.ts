import { z } from "zod";

// SDD-028 §1.3: aceite explícito de convite (SEC-004).
export const MyInvitationSchema = z
  .object({
    id: z.uuid(),
    familyName: z.string(), // texto do Administrador: exibir como texto puro (React escapa)
    inviterName: z.string(),
    role: z.enum(["ADMIN", "MEMBER"]),
    expiresAt: z.iso.datetime(),
  })
  .strict();
export type MyInvitationDTO = z.infer<typeof MyInvitationSchema>;

export const MyInvitationsResponseSchema = z
  .object({ invitations: z.array(MyInvitationSchema).max(20) })
  .strict();
export type MyInvitationsResponse = z.infer<typeof MyInvitationsResponseSchema>;

export const AcceptInvitationBodySchema = z
  .object({
    token: z.string().min(20).max(200).optional(), // presente quando veio de /convite/[token]
  })
  .strict();

export const AcceptInvitationResponseSchema = z
  .object({
    membership: z
      .object({
        familyId: z.uuid(),
        familyName: z.string(),
        role: z.enum(["ADMIN", "MEMBER"]),
      })
      .strict(),
  })
  .strict();
export type AcceptInvitationResponse = z.infer<typeof AcceptInvitationResponseSchema>;

export const DeclineInvitationBodySchema = z.object({}).strict();
