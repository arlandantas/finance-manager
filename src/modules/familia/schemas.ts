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

const FAMILY_NAME_MSG = "Informe um nome com 2 a 60 caracteres";
export const UpdateFamilySchema = z
  .object({
    version: z.number().int().min(1),
    name: z
      .string({ error: FAMILY_NAME_MSG })
      .trim()
      .min(2, FAMILY_NAME_MSG)
      .max(60, FAMILY_NAME_MSG),
  })
  .strict();
export type UpdateFamilyInput = z.infer<typeof UpdateFamilySchema>;
export const ChangeRoleSchema = z.object({ role: RoleSchema }).strict();

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

export type FamilyEventDTO = {
  type:
    | "FAMILY_RENAMED"
    | "ROLE_CHANGED"
    | "SETTLEMENT_TOGGLED"
    | "MEMBER_REMOVED"
    | "MEMBER_LEFT"
    | "INVITATION_RESENT";
  actor: { id: string; name: string };
  target: { id: string; name: string } | null;
  changes: Record<string, unknown>;
  at: string;
};

export type FamilyDTO = {
  family: { id: string; name: string; settlementEnabled: boolean; version: number };
  currentMemberId: string;
  currentRole: Role;
  members: Array<MemberDTO & { canChangeRole: boolean }>;
  exMembers: Array<{ id: string; name: string; image: string | null; removedAt: string }>; // histórico (sem e-mail)
  events: FamilyEventDTO[]; // últimos 20 (trilha simples: autor e data)
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

export const RemoveMemberSchema = z
  .object({
    acknowledgeSettlement: z.boolean().default(false),
    reassign: z
      .object({
        accounts: z.record(z.uuid(), z.uuid()).default({}), // contaId => novo titular
        cards: z.record(z.uuid(), z.uuid()).default({}), // cartaoId => novo titular
        plannedTo: z.uuid().optional(), // padrão: quem remove (na saída: um ADMIN ativo escolhido)
      })
      .strict()
      .default({ accounts: {}, cards: {} }),
  })
  .strict();
export type RemoveMemberInput = z.input<typeof RemoveMemberSchema>;
export type RemoveMemberParsed = z.output<typeof RemoveMemberSchema>;

export type RemovalReviewDTO = {
  member: { id: string; name: string; image: string | null };
  isSelf: boolean;
  settlement: {
    enabled: boolean;
    totalInCents: number;
    months: Array<{ period: string; toSettleInCents: number }>;
  };
  accounts: Array<{
    id: string;
    name: string;
    balanceInCents: number;
    mustReassign: boolean;
    defaultAction: "ARCHIVE" | "REASSIGN";
  }>;
  cards: Array<{
    id: string;
    name: string;
    unpaidInCents: number;
    mustReassign: boolean;
    defaultAction: "ARCHIVE" | "REASSIGN";
  }>;
  planned: Array<{ id: string; description: string; dueOn: string }>;
  candidates: Array<{ id: string; name: string; role: Role }>;
  blockers: Array<"LAST_ADMIN" | "ONLY_MEMBER">;
};
