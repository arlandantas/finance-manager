import { z } from "zod";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { lockFamilyAdmins } from "@/modules/familia/manage";
import { scrubIdempotencyMentioning } from "@/modules/privacidade/delete-account";

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
  "assistant_proposals", // US-076c: antes de mcp_grants, transactions, categories, contas e cartões (FKs RESTRICT)
  "mcp_audit_events",
  "mcp_grants",
  "ai_consent_events",
  "member_assistant_limits",
  "llm_usage_events",
  "spending_analyses",
  "llm_budget_months",
  "avoidable_dismissals",
  "category_suggestion_dismissals",
  "settlement_review_dismissals",
  "transaction_revisions",
  "transaction_splits",
  "planned_expenses",
  "planned_transfers", // US-100: antes de bank_accounts e transfer_groups (FKs RESTRICT)
  "recurring_transfers", // US-101: depois das ocorrências, antes de bank_accounts e members
  "subscription_charges", // US-096: antes de transactions e card_subscriptions (FKs RESTRICT)
  "card_subscription_amounts",
  "card_subscriptions",
  "transaction_tags", // US-045: antes de transactions e tags (FKs RESTRICT)
  "tags",
  "transactions",
  "installment_plans",
  "import_batches", // US-067: depois de transactions e installment_plans (FK RESTRICT), antes de card_invoices, cartões e membros
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
    // US-092a: cadastros sem conta não impedem excluir a família (são apagados com ela)
    where: {
      familyId: ctx.familyId,
      removedAt: null,
      userId: { not: null },
      NOT: { id: ctx.memberId },
    },
  });
  if (others > 0) throw conflict("HAS_OTHER_MEMBERS", HAS_OTHER_MEMBERS_MSG);
  if (body.confirmFamilyName.trim() !== family.name) {
    throw unprocessable("NAME_MISMATCH", NAME_MISMATCH_MSG);
  }

  // SEC-031: respostas guardadas para idempotência (24 h) citam ids, nomes e observações da família, inclusive
  // nas linhas de OUTROS usuários; somem na hora, junto com as de quem pertenceu à família.
  const members = await tx.member.findMany({
    where: { familyId: ctx.familyId },
    select: { id: true, userId: true },
  });
  await tx.$executeRaw`DELETE FROM idempotency_records
    WHERE "userId" = ANY(${members.flatMap((m) => (m.userId ? [m.userId] : []))}::uuid[]) AND "responseStatus" <> 0`; // 0 = a reserva desta requisição
  // SEC-039: só ids únicos (família e membros); o nome da família é texto livre e não é procurado em outras famílias
  await scrubIdempotencyMentioning(tx, {
    identifiers: [ctx.familyId, ...members.map((m) => m.id)],
  });

  // Liga a exceção controlada às travas SÓ para esta família e só nesta transação (set_config local).
  await tx.$executeRaw`SELECT set_config('app.purge_family', ${ctx.familyId}, true)`;
  for (const table of FAMILY_TABLES_DELETE_ORDER) {
    await tx.$executeRawUnsafe(`DELETE FROM "${table}" WHERE "familyId" = $1::uuid`, ctx.familyId);
  }
  await tx.$executeRaw`DELETE FROM families WHERE id = ${ctx.familyId}::uuid`;
  await tx.$executeRaw`SELECT set_config('app.purge_family', '', true)`;
  // sem o nome da família: a resposta fica guardada para idempotência e não pode reter dado excluído (SEC-031)
  return { deleted: true as const };
}
