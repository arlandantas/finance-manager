import { z } from "zod";
import { versionSchema } from "@/lib/schemas";

// SDD-025 §2 (+ §8.1): contratos de conexões do assistente. Sem segredos: nenhuma credencial é exibida.
export type ConnectionStatus = "ACTIVE" | "REVOKED" | "EXPIRED";
export type ConnectionRevokedReason =
  | "MEMBER"
  | "FAMILY_BLOCKED"
  | "MEMBER_REMOVED"
  | "REFRESH_REUSE"
  | "CODE_REUSE"
  | "CLIENT";

export type ConnectionDTO = {
  id: string;
  /** US-074b: conexão OAuth ou token pessoal. */
  kind: "OAUTH" | "PAT";
  label: string;
  clientName: string;
  redirectHost: string;
  scopes: Array<"read" | "write">;
  /** Texto do PO (US-074): "Consulta" | "Consulta e lançamento". */
  scopeLabel: "Consulta" | "Consulta e lançamento";
  status: ConnectionStatus;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  revokedReason: ConnectionRevokedReason | null;
  /** US-076c: o pedido do assistente só cria proposta; o membro confirma no app. */
  requireConfirmation: boolean;
};

export type AssistantSettingsDTO = {
  mcpUrl: string;
  /** `MCP_ENABLED` do servidor. */
  enabled: boolean;
  familyAllows: boolean;
  canEditFamilySwitch: boolean;
  familyVersion: number;
  blockedNotice: string | null;
  /** US-074c: chaves do token pessoal (servidor e família). */
  patEnabled: { env: boolean; family: boolean };
  /** Servidor + família + acesso por assistente ligados. */
  canCreatePat: boolean;
  items: ConnectionDTO[];
};

export const BLOCKED_NOTICE = "O Administrador bloqueou o acesso por assistente";

export const SetAssistantAccessSchema = z
  .object({
    enabled: z.boolean().optional(),
    /** US-074c: chave do token pessoal (só ADMIN). */
    patEnabled: z.boolean().optional(),
    familyVersion: versionSchema,
  })
  .strict()
  .refine((v) => v.enabled !== undefined || v.patEnabled !== undefined, {
    message: "Informe a chave a alterar",
  });
export type SetAssistantAccessInput = z.infer<typeof SetAssistantAccessSchema>;

export const RevokeConnectionSchema = z.object({}).strict();
