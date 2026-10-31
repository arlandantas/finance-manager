import { localPart } from "@/lib/auth/dev-login-guard";
import { DELETED_ACCOUNT_NAME } from "@/lib/deleted-account";
import type { MemberRef } from "@/lib/schemas";

/**
 * Fonte ÚNICA do nome de membro (US-092a, SDD-033 §3.2, D-033-2). `Member.userId` pode ser nulo (membro sem conta):
 * nenhuma outra leitura de `user.name`/`localPart` para nome de membro.
 */
export type MemberNameSource = {
  /** `members.name`: rótulo do cadastro (sem conta) ou nome escolhido no aceite (094b). */
  name?: string | null | undefined;
  user: { name: string | null; email: string; deletedAt?: Date | null | undefined } | null;
};

/** Nome do membro em toda tela, relatório, exportação, MCP e evento (ADR-033 §2.2 e §2.3). */
export function memberDisplayName(m: MemberNameSource): string {
  if (m.user?.deletedAt) return m.user.name ?? DELETED_ACCOUNT_NAME; // conta excluída: nunca o nome antigo
  return m.name ?? m.user?.name ?? (m.user ? localPart(m.user.email) : "Membro");
}

export const memberFirstName = (m: MemberNameSource): string =>
  memberDisplayName(m).split(" ")[0] as string;

/** "Mesma pessoa": nunca compara `NULL` (SEC-058). `null`/`undefined` nunca são iguais a nada. */
export function samePerson(a: string | null | undefined, b: string | null | undefined): boolean {
  return a != null && b != null && a === b;
}

/** Saneamento (SEC-063b): NFKC, sem invisíveis/controle/bidi, espaços colapsados. É o valor gravado. */
export function sanitizeMemberName(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/[\p{Cf}\p{Cc}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Chave de unicidade: saneado, sem acentos, sem caixa. */
export function nameKey(s: string): string {
  return sanitizeMemberName(s).normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR");
}

/** Termos do sistema que não podem ser nome de membro (422 `NAME_RESERVED`, 092b). */
export const RESERVED_NAME_KEYS = new Set([
  "conta excluida",
  "ex-membro",
  "ex membro",
  "administrador",
  "sem acesso ao app",
  "assistente",
  "membro",
  "voce",
]);

/** `MemberRef` único (SDD-033 §3.3): `unlinked` vem de `userId == null`; ex-membro sem conta leva `removed` e `unlinked`. */
export type MemberRefSource = {
  id: string;
  name?: string | null | undefined;
  removedAt?: Date | null | undefined;
  user: {
    name: string | null;
    email: string;
    image: string | null;
    deletedAt?: Date | null | undefined;
  } | null;
};

export function toMemberRef(m: MemberRefSource): MemberRef {
  return {
    id: m.id,
    name: memberDisplayName(m),
    image: m.user?.image ?? null,
    ...(m.removedAt ? { removed: true as const } : {}),
    ...(m.user?.deletedAt ? { deleted: true as const } : {}),
    ...(m.user === null ? { unlinked: true as const } : {}),
  };
}

/** US-093a (SDD-034 §3.1): selo e rótulo de membro sem conta nos seletores e telas. */
export const UNLINKED_BADGE = "Sem acesso ao app";

/** Texto de <option>/<radio> (não cabe selo dentro de <option>): "Ana · sem acesso ao app". */
export function memberOptionLabel(m: { name: string; unlinked?: true | undefined }): string {
  return m.unlinked ? `${m.name} · sem acesso ao app` : m.name;
}

/** US-093a (SDD-034 §3.2, D-034-6): titular sem conta (conta ou cartão) só por ADMIN. */
export const UNLINKED_OWNER_ADMIN_ONLY = "UNLINKED_OWNER_ADMIN_ONLY";
export const UNLINKED_OWNER_ADMIN_ONLY_MESSAGE =
  "Só um Administrador pode pôr como titular quem não tem acesso ao app.";
