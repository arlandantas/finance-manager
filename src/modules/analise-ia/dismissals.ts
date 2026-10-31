import { badRequest, notFound } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { dismissalKeyOf } from "@/modules/analise-ia/build-dto";
import type { AvoidableDismissalDTO } from "@/modules/analise-ia/dto";
import type { RefMap } from "@/modules/analise-ia/payload";
import type { CreateDismissalInput } from "@/modules/analise-ia/schemas";
import { toMemberRef } from "@/modules/familia/display-name";

// SDD-023 §3, §4: "Importante para nós" (US-071). O descarte é DA FAMÍLIA, vale para categoria +
// descrição normalizada (ou série) e entra nas próximas análises como regra: o recorrente descartado
// não entra no payload. O motivo opcional NUNCA sai do banco.

type Row = {
  kind: string;
  categoryId: string;
  descriptionKey: string | null;
  recurringExpenseId: string | null;
};
const keyOf = (r: Row) =>
  dismissalKeyOf({
    kind: r.kind as "RECURRING" | "CATEGORY",
    categoryId: r.categoryId,
    descriptionKey: r.descriptionKey,
    recurringExpenseId: r.recurringExpenseId,
  });

/** Chaves de descarte da família, no mesmo formato usado por `buildAnalysisPayload`. */
export async function loadDismissedKeys(tx: Tx, familyId: string): Promise<Set<string>> {
  const rows = await tx.avoidableDismissal.findMany({
    where: { familyId },
    select: { kind: true, categoryId: true, descriptionKey: true, recurringExpenseId: true },
  });
  return new Set(rows.map(keyOf));
}

const isUuid = (s: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

async function toDto(
  tx: Tx,
  ctx: RequestContext,
  rows: Array<{
    id: string;
    kind: string;
    displayName: string;
    categoryId: string;
    reason: string | null;
    byMemberId: string;
    createdAt: Date;
  }>,
): Promise<AvoidableDismissalDTO[]> {
  const members = await tx.member.findMany({
    where: { familyId: ctx.familyId },
    include: { user: true },
  });
  const byId = new Map(members.map((m) => [m.id, m] as const));
  const cats = await tx.category.findMany({
    where: { familyId: ctx.familyId, id: { in: [...new Set(rows.map((r) => r.categoryId))] } },
    select: { id: true, name: true },
  });
  const catName = new Map(cats.map((c) => [c.id, c.name] as const));
  return rows.map((r) => {
    const m = byId.get(r.byMemberId);
    return {
      id: r.id,
      kind: r.kind as "RECURRING" | "CATEGORY",
      displayName: r.displayName,
      categoryId: r.categoryId,
      categoryName: catName.get(r.categoryId) ?? "Categoria",
      reason: r.reason,
      by: {
        ...(m ? toMemberRef(m) : { name: "Membro", image: null }),
        id: r.byMemberId,
      },
      at: r.createdAt.toISOString(),
    };
  });
}

/** POST /ai/avoidable-dismissals: idempotente pela chave natural (devolve o existente). */
export async function createDismissal(
  tx: Tx,
  ctx: RequestContext,
  input: CreateDismissalInput,
): Promise<AvoidableDismissalDTO> {
  if (!isUuid(input.analysisId)) throw notFound("Análise não encontrada.");
  const analysis = await tx.spendingAnalysis.findFirst({
    where: { id: input.analysisId, familyId: ctx.familyId },
    select: { refMap: true },
  });
  if (!analysis) throw notFound("Análise não encontrada.");
  const refMap = analysis.refMap as RefMap;
  const rec = refMap.recurring[input.key];
  const categoryId = refMap.categories[input.key];
  let data: Row & { displayName: string };
  if (rec) {
    data = {
      kind: "RECURRING",
      categoryId: rec.categoryId,
      descriptionKey: rec.descriptionKey,
      recurringExpenseId: rec.recurringExpenseId,
      displayName: rec.displayName,
    };
  } else if (categoryId) {
    const cat = await tx.category.findFirst({
      where: { id: categoryId, familyId: ctx.familyId },
      select: { name: true },
    });
    data = {
      kind: "CATEGORY",
      categoryId,
      descriptionKey: null,
      recurringExpenseId: null,
      displayName: cat?.name ?? "Categoria",
    };
  } else {
    throw badRequest("VALIDATION_ERROR", "Sugestão inválida para esta análise");
  }
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`dismiss:${ctx.familyId}`}, 0))::text`;
  const existing = await tx.avoidableDismissal.findFirst({
    where: {
      familyId: ctx.familyId,
      kind: data.kind,
      categoryId: data.categoryId,
      descriptionKey: data.descriptionKey,
      recurringExpenseId: data.recurringExpenseId,
    },
  });
  const row =
    existing ??
    (await tx.avoidableDismissal.create({
      data: {
        familyId: ctx.familyId,
        ...data,
        reason: input.reason ? input.reason : null,
        byMemberId: ctx.memberId,
        createdAt: ctx.clock.now(),
      },
    }));
  return (await toDto(tx, ctx, [row]))[0] as AvoidableDismissalDTO;
}

/** GET /ai/avoidable-dismissals: "Sugestões descartadas" (qualquer membro). */
export async function listDismissals(
  tx: Tx,
  ctx: RequestContext,
): Promise<{ items: AvoidableDismissalDTO[] }> {
  const rows = await tx.avoidableDismissal.findMany({
    where: { familyId: ctx.familyId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  return { items: await toDto(tx, ctx, rows) };
}

/** POST /ai/avoidable-dismissals/:id/restore: "Voltar a sugerir" (também o "Desfazer"). */
export async function restoreDismissal(
  tx: Tx,
  ctx: RequestContext,
  id: string,
): Promise<{ restored: true }> {
  if (!isUuid(id)) throw notFound("Sugestão descartada não encontrada.");
  const r = await tx.avoidableDismissal.deleteMany({ where: { id, familyId: ctx.familyId } });
  if (r.count === 0) throw notFound("Sugestão descartada não encontrada.");
  return { restored: true };
}
