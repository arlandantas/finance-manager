// SEC-017c (US-080): nome gravado em `users.name` quando a conta é excluída. As telas mostram o ex-membro como
// "ex-membro (conta excluída)" em vez de "Conta excluída (ex-membro)".
export const DELETED_ACCOUNT_NAME = "Conta excluída";

/** Rótulo de quem aparece no histórico: membro ativo = nome; ex-membro = "nome (ex-membro)"; conta excluída = "ex-membro (conta excluída)". */
export function memberLabel(m: { name: string; removed?: true | undefined }): string {
  if (m.name === DELETED_ACCOUNT_NAME) return "ex-membro (conta excluída)";
  return m.removed ? `${m.name} (ex-membro)` : m.name;
}
