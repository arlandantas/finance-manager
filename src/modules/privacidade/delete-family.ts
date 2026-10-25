import { z } from "zod";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { lockFamilyAdmins } from "@/modules/familia/manage";

// SEC-017d (SDD-028 §7.5, US-081): excluir a família inteira. Única exceção à regra "nada é apagado" (ADR-019):
// só o Administrador que é o ÚNICO membro ativo, só a própria família, tudo numa transação.

export const DeleteFamilyBodySchema = z.object({ confirmFamilyName: z.string().max(200) }).strict();
export type DeleteFamilyBody = z.output<typeof DeleteFamilyBodySchema>;

export const HAS_OTHER_MEMBERS_MSG = "Remova os outros membros antes de excluir a família.";
export const NAME_MISMATCH_MSG = "O nome digitado não confere com o da família";

/**
 * Tabelas com `familyId`, na ordem de dependência (filhas antes das mães). O teste de integração compara esta
 * lista com o `information_schema` (tabela nova com `familyId` sem entrada aqui reprova) e exige `count = 0`
 * em todas depois da exclusão. As tabelas sem `familyId` que dependem destas saem por `ON DELETE CASCADE`
 * (`mcp_tokens` via grant, `split_shares` via regra, `transaction_splits` já tem `familyId`).
 */
export const FAMILY_TABLES_DELETE_ORDER = [
  "mcp_audit_events",
  "mcp_grants",
  "ai_consent_events",
  "member_assistant_limits",
  "llm_usage_events",
  "spending_analyses",
  "llm_budget_months",
  "avoidable_dismissals",
  "category_suggestion_dismissals",
  "transaction_revisions",
  "transaction_splits",
  "planned_expenses",
  "transactions",
  "installment_plans",
  "recurring_expenses",
  "card_invoices",
  "credit_cards",
  "bank_accounts",
  "transfer_groups",
  "split_rule_versions",
  "split_migration_snapshots",
  "data_migrations",
  "categories",
  "family_events",
  "invitations",
  "members",
] as const;

/** POST /family/delete. */
export async function deleteFamily(tx: Tx, ctx: RequestContext, body: DeleteFamilyBody) {
  await lockFamilyAdmins(tx, ctx, true); // serializa com remoção/saída/rebaixamento e exige Administrador ativo
  const rows = await tx.$queryRaw<Array<{ name: string }>>`
    SELECT name FROM families WHERE id = ${ctx.familyId}::uuid FOR UPDATE`;
  const family = rows[0];
  if (!family) throw notFound("Família não encontrada.");

  const others = await tx.member.count({
    where: { familyId: ctx.familyId, removedAt: null, NOT: { id: ctx.memberId } },
  });
  if (others > 0) throw conflict("HAS_OTHER_MEMBERS", HAS_OTHER_MEMBERS_MSG);
  if (body.confirmFamilyName.trim() !== family.name) {
    throw unprocessable("NAME_MISMATCH", NAME_MISMATCH_MSG);
  }

  // Liga a exceção controlada às travas SÓ para esta família e só nesta transação (set_config local).
  await tx.$executeRaw`SELECT set_config('app.purge_family', ${ctx.familyId}, true)`;
  for (const table of FAMILY_TABLES_DELETE_ORDER) {
    await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "familyId" = $1::uuid`, ctx.familyId);
  }
  await tx.$executeRaw`DELETE FROM families WHERE id = ${ctx.familyId}::uuid`;
  await tx.$executeRaw`SELECT set_config('app.purge_family', '', true)`;
  return { deleted: true as const, familyName: family.name };
}
