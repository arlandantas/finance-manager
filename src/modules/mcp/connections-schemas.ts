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
  items: ConnectionDTO[];
};

export const BLOCKED_NOTICE = "O Administrador bloqueou o acesso por assistente";

export const SetAssistantAccessSchema = z
  .object({ enabled: z.boolean(), familyVersion: versionSchema })
  .strict();
export type SetAssistantAccessInput = z.infer<typeof SetAssistantAccessSchema>;

export const RevokeConnectionSchema = z.object({}).strict();
