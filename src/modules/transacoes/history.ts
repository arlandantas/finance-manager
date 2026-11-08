import { notFound } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { formatBRL } from "@/lib/money";
import type { Change } from "@/modules/contas/ledger";
import { transacoesRepo } from "@/modules/transacoes/repo";
import type { RevisionDTO } from "@/modules/transacoes/schemas";
import { memberRefOf } from "@/modules/transacoes/service";
import { SPLIT_MODE_LABEL } from "@/modules/transacoes/split-edit";

const FIELD_LABELS: Record<string, string> = {
  amountInCents: "Valor",
  description: "Descrição",
  categoryId: "Categoria",
  occurredOn: "Data",
  payerMemberId: "Quem pagou",
  isSharedExpense: "Dividir com a família",
  split: "Divisão",
  accountId: "Conta",
  note: "Observação",
  tags: "Tags",
  deletionReason: "Situação",
  "*": "Criação",
};

/** GET /transactions/:id/history (SDD-001 §3): mais recente primeiro, com rótulos resolvidos. */
export async function listHistory(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ items: RevisionDTO[] }> {
  const repo = transacoesRepo(tx, ctx.familyId);
  if (!(await repo.findById(id))) throw notFound("Lançamento não encontrado.");
  const members = new Map((await repo.listMembers()).map((m) => [m.id, memberRefOf(m)] as const));
  const accounts = new Map(
    (
      await tx.bankAccount.findMany({
        where: { familyId: ctx.familyId },
        select: { id: true, name: true },
      })
    ).map((a) => [a.id, a.name] as const),
  );
  const categories = new Map((await repo.listAllCategories()).map((c) => [c.id, c.name] as const));
  const label = (field: string, v: unknown): string | undefined => {
    if (v === null || v === undefined) return undefined;
    if (field === "accountId") return accounts.get(String(v));
    if (field === "categoryId") return categories.get(String(v));
    if (field === "payerMemberId") return members.get(String(v))?.name;
    if (field === "amountInCents") return formatBRL(Number(v));
    if (field === "isSharedExpense") return v ? "Comum" : "Pessoal";
    if (field === "split") return SPLIT_MODE_LABEL[v as "NONE" | "RULE" | "CUSTOM"];
    return undefined;
  };
  const rows = await repo.listRevisions(id);
  return {
    items: rows.map((r) => ({
      revision: r.revision,
      action: r.action,
      at: r.at.toISOString(),
      actor: members.get(r.actorMemberId) ?? { id: r.actorMemberId, name: "Membro", image: null },
      changes: (r.changes as Array<Change & { source?: string }>).map((c) => {
        const fromLabel = label(c.field, c.from);
        const toLabel = label(c.field, c.to);
        return {
          field: c.field,
          label: FIELD_LABELS[c.field] ?? c.field,
          from: c.from,
          to: c.to,
          ...(fromLabel !== undefined ? { fromLabel } : {}),
          ...(toLabel !== undefined ? { toLabel } : {}),
          ...(c.source ? { source: c.source } : {}),
        };
      }),
    })),
  };
}
