import { z } from "zod";
import { sanitizeMemberName } from "@/modules/familia/display-name";

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

export const ResendInvitationSchema = z.object({}).strict();

export const CreateInvitationSchema = z
  .object({
    email: emailSchema,
    role: RoleSchema.default("MEMBER"),
  })
  .strict();
export type CreateInvitationInput = z.input<typeof CreateInvitationSchema>;

// US-092b (SDD-033 §4.1): o corpo NUNCA traz joinedAt/role/userId (.strict()); joinedAt = now() só no servidor (SEC-060).
export const memberNameSchema = z
  .string({ error: "Informe o nome" })
  .transform(sanitizeMemberName) // SEC-063b: NFKC, sem invisíveis, espaços colapsados
  .pipe(z.string().min(2, "Use de 2 a 60 caracteres").max(60, "Use de 2 a 60 caracteres"));

export const CreateUnlinkedMemberSchema = z
  .object({
    name: memberNameSchema,
    email: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      emailSchema.optional(),
    ),
  })
  .strict();
export const CreateLinkedInvitationSchema = z.object({ email: emailSchema }).strict();
// US-095 (ADR-038 §5): editar o sem conta; `email: null` remove o e-mail. Ao menos um campo.
export const UpdateUnlinkedMemberSchema = z
  .object({ name: memberNameSchema.optional(), email: emailSchema.nullable().optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.email !== undefined, {
    message: "Informe o nome ou o e-mail",
  });
export type UpdateUnlinkedMemberInput = z.infer<typeof UpdateUnlinkedMemberSchema>;
export type UpdateUnlinkedMemberResponse = { member: MemberDTO & { canChangeRole: false } };
export type CreateLinkedInvitationInput = z.infer<typeof CreateLinkedInvitationSchema>;

export type CreateUnlinkedMemberInput = z.infer<typeof CreateUnlinkedMemberSchema>;

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
  /** Nulo para membro sem conta (US-092): o e-mail pendente nunca sai nesta lista. */
  email: string | null;
  image: string | null;
  role: Role;
  joinedAt: string;
  unlinked?: true;
  /** US-092b: só para ADMIN e só em membro sem conta; ausente para os demais (e nunca em `MemberRef`). */
  pendingEmail?: string | null;
  /** US-094a (ADR-038 §6): só ADMIN e só em sem conta; vencido conta como sem convite. */
  pendingInvitation?: { id: string; expiresAt: string } | null;
};

export type CreateUnlinkedMemberResponse = { member: MemberDTO & { canChangeRole: false } };

export type InvitationDTO = {
  id: string;
  email: string;
  role: Role;
  status: "PENDING" | "ACCEPTED" | "CANCELED" | "EXPIRED" | "DECLINED";
  expiresAt: string;
  isExpired: boolean;
  createdAt: string;
  invitedBy: { memberId: string; name: string };
  resendCount: number;
  /** US-094a: id do cadastro sem conta quando o convite é vinculado. */
  memberId: string | null;
  canResend: boolean; // PENDING, não vencido e resendCount < 3
};

export type RotatedInvitationResponse = {
  invitation: InvitationDTO;
  inviteUrl: string;
  emailStatus?: "SENT" | "FAILED"; // só no reenvio
};

export type FamilyEventDTO = {
  type:
    | "FAMILY_RENAMED"
    | "ROLE_CHANGED"
    | "SETTLEMENT_TOGGLED"
    | "MEMBER_REMOVED"
    | "MEMBER_LEFT"
    | "INVITATION_RESENT"
    | "AI_CONSENT_CHANGED"
    | "ASSISTANT_ACCESS_CHANGED"
    | "MEMBER_JOINED"
    | "CARD_OWNER_CHANGED"
    | "CARD_PAYER_ACCOUNT_CHANGED" // US-089
    | "MEMBER_CREATED" // US-092b
    | "MEMBER_UPDATED" // US-095
    | "MEMBER_LINKED" // US-094b
    | "TAG_RENAMED" // US-046 (SDD-016): gestão de tags
    | "TAG_MERGED"
    | "TAG_DELETED"
    | "INVOICE_IMPORTED" // US-068
    | "INVOICE_IMPORT_REVERTED"; // US-069
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
  exMembers: Array<{
    id: string;
    name: string;
    image: string | null;
    removedAt: string;
    deleted?: true;
    unlinked?: true;
  }>; // histórico (sem e-mail)
  events: FamilyEventDTO[]; // últimos 20 (trilha simples: autor e data)
  pendingInvitations: InvitationDTO[]; // [] para quem não é ADMIN
  declinedInvitations: InvitationDTO[]; // SEC-004: recusas dos últimos 30 dias ([] para quem não é ADMIN)
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
  /** US-096b: assinaturas ativas pagas por ele; passam ao mesmo destino das previstas. */
  subscriptions: Array<{ id: string; description: string }>;
  candidates: Array<{ id: string; name: string; role: Role }>;
  blockers: Array<"LAST_ADMIN" | "ONLY_MEMBER">;
  /** SEC-046: aviso de que contas/cartões reatribuídos dão controle sobre os "Só meu" lançados neles. */
  reassignNotice: string | null;
};
