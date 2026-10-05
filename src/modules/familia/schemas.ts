import { z } from "zod";

export const emailSchema = z
  .string({ error: "Informe um e-mail válido" })
  .trim()
  .toLowerCase()
  .pipe(z.email("Informe um e-mail válido"))
  .pipe(z.string().max(254, "Informe um e-mail válido"));

export const RoleSchema = z.enum(["ADMIN", "MEMBER"]);
export type Role = z.infer<typeof RoleSchema>;

export const CreateFamilySchema = z
  .object({
    name: z
      .string({ error: "Informe um nome com pelo menos 2 caracteres" })
      .trim()
      .min(2, "Informe um nome com pelo menos 2 caracteres")
      .max(60, "O nome deve ter no máximo 60 caracteres"),
    settlementEnabled: z.boolean().optional(), // padrão: ligado (US-028)
  })
  .strict();
export type CreateFamilyInput = z.infer<typeof CreateFamilySchema>;

export const UpdateFamilySettingsSchema = z
  .object({
    version: z.number().int().min(1),
    settlementEnabled: z.boolean(),
    confirmPending: z.boolean().optional(), // true = "Desligar mesmo assim"
  })
  .strict();
export type UpdateFamilySettingsInput = z.infer<typeof UpdateFamilySettingsSchema>;

export const CreateInvitationSchema = z
  .object({
    email: emailSchema,
    role: RoleSchema.default("MEMBER"),
  })
  .strict();
export type CreateInvitationInput = z.input<typeof CreateInvitationSchema>;

export const DevLoginSchema = z
  .object({
    email: emailSchema,
    name: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

// ── DTOs ──
export type MeDTO = {
  user: { id: string; name: string | null; email: string; image: string | null };
  membership: null | {
    memberId: string;
    familyId: string;
    familyName: string;
    role: Role;
    settlementEnabled: boolean;
  };
};

export type MemberDTO = {
  memberId: string;
  name: string;
  email: string;
  image: string | null;
  role: Role;
  joinedAt: string;
};

export type InvitationDTO = {
  id: string;
  email: string;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "CANCELED" | "EXPIRED";
  expiresAt: string;
  isExpired: boolean;
  createdAt: string;
  invitedBy: { memberId: string; name: string };
};

export type FamilyDTO = {
  family: { id: string; name: string; settlementEnabled: boolean; version: number };
  currentMemberId: string;
  currentRole: Role;
  members: MemberDTO[];
  pendingInvitations: InvitationDTO[]; // [] para quem não é ADMIN
};

export type CreateFamilyResponse = {
  family: { id: string; name: string };
  member: { id: string; role: "ADMIN" };
};

export type CreateInvitationResponse = {
  invitation: InvitationDTO;
  inviteUrl: string;
  emailStatus: "SENT" | "FAILED";
};
