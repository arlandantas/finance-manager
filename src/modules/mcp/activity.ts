import { badRequest } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { addDays, daysBetween, fromDbDate, todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { shortMonthLabel } from "@/modules/analise-ia/labels";
import {
  type ActivityItemDTO,
  type ActivityOutcome,
  type ActivityQuery,
  type ActivityResponse,
  type LimitField,
} from "@/modules/mcp/activity-schemas";
import { toConnectionDTO } from "@/modules/mcp/connections";

// SDD-027 §5 (+ §R2.6): lê SÓ os eventos do membro da sessão. Nunca há o conteúdo devolvido à IA:
// a auditoria não o guarda (SDD-024 §7). Nomes de categoria/conta/cartão são resolvidos agora.
const TOOL_LABEL: Record<string, string> = {
  listar_cadastros: "Consultou contas, cartões e categorias",
  consultar_saldos: "Consultou saldos",
  resumo_do_mes: "Consultou o resumo do mês",
  gastos_por_categoria: "Consultou gastos por categoria",
  cartoes_e_faturas: "Consultou cartões e faturas",
  listar_lancamentos: "Consultou lançamentos",
  previstas_do_mes: "Consultou contas a pagar",
  lancar_despesa: "Lançou despesa",
  propor_lancamento: "Propôs uma despesa (aguarda confirmação)",
  consultar_proposta: "Consultou uma proposta",
  confirmacao_no_app: "Você confirmou uma proposta",
  recusa_no_app: "Você recusou uma proposta",
  modo_confirmacao: "Você alterou o modo de confirmação",
};

const OUTCOME_LABEL: Record<ActivityOutcome, string> = {
  OK: "Concluído",
  DENIED_SCOPE: "Sem permissão",
  INVALID: "Pedido inválido",
  RATE_LIMITED: "Limite de uso",
  ERROR: "Erro",
  LIMIT_EXCEEDED: "Bloqueado pelo seu limite",
};

const TYPE_LABEL: Record<string, string> = {
  EXPENSE: "despesas",
  INCOME: "receitas",
  TRANSFER: "transferências",
  INVOICE_PAYMENT: "pagamentos de fatura",
};

const LIMIT_FIELDS = new Set<string>(["maxAmountPerTxCents", "maxTxPerDay", "maxTxPerHour"]);
const MAX_RANGE_DAYS = 366;

type Cursor = { t: string; i: string };
const encodeCursor = (c: Cursor) => Buffer.from(JSON.stringify(c)).toString("base64url");
function decodeCursor(raw: string): Cursor | null {
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<Cursor>;
    return typeof v.t === "string" && typeof v.i === "string" && !Number.isNaN(Date.parse(v.t))
      ? { t: v.t, i: v.i }
      : null;
  } catch {
    return null;
  }
}

const brDate = (iso: string) => iso.split("-").reverse().join("/");
const asArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];

/** Janela em UTC para `[from, to]` (datas de calendário no fuso da família, que não tem horário de verão). */
function windowOf(ctx: RequestContext, q: ActivityQuery): { start: Date; end: Date } {
  const today = todayInFamilyTz(ctx.clock);
  if (q.range && (q.from || q.to)) {
    throw badRequest("VALIDATION_ERROR", "Use range ou from/to, não ambos");
  }
  const to = q.to ?? today;
  const from =
    q.from ??
    (q.range === "7d"
      ? addDays(to, -6)
      : q.range === "month"
        ? `${to.slice(0, 7)}-01`
        : addDays(to, -29));
  if (from > to) throw badRequest("VALIDATION_ERROR", "Intervalo inválido");
  if (daysBetween(from, to) > MAX_RANGE_DAYS) {
    throw badRequest("VALIDATION_ERROR", "Escolha um intervalo de até 12 meses");
  }
  return {
    start: new Date(`${from}T00:00:00-03:00`),
    end: new Date(`${addDays(to, 1)}T00:00:00-03:00`),
  };
}

/** GET /assistant/activity — só os eventos do membro da sessão. */
export async function listActivity(
  tx: Tx,
  ctx: RequestContext,
  q: ActivityQuery,
): Promise<ActivityResponse> {
  const cursor = q.cursor ? decodeCursor(q.cursor) : null;
  if (q.cursor && !cursor) throw badRequest("INVALID_CURSOR", "Cursor inválido");
  const { start, end } = windowOf(ctx, q);

  const rows = await tx.mcpAuditEvent.findMany({
    where: {
      familyId: ctx.familyId,
      memberId: ctx.memberId,
      createdAt: { gte: start, lt: end },
      ...(q.grantId ? { grantId: q.grantId } : {}),
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: new Date(cursor.t) } },
              { createdAt: new Date(cursor.t), id: { lt: cursor.i } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: q.limit + 1,
  });
  const hasMore = rows.length > q.limit;
  const page = rows.slice(0, q.limit);

  // nomes atuais de categorias/contas/cartões citados nos parâmetros permitidos
  const ids = (key: string) => [
    ...new Set(page.flatMap((r) => asArray((r.params as Record<string, unknown>)[key]))),
  ];
  const cardIds = [
    ...ids("cardIds"),
    ...page.flatMap((r) => {
      const c = (r.params as Record<string, unknown>).cardId;
      return typeof c === "string" ? [c] : [];
    }),
  ];
  const [cats, accs, cards, txs, grants] = await Promise.all([
    tx.category.findMany({
      where: { familyId: ctx.familyId, id: { in: ids("categoryIds") } },
      select: { id: true, name: true },
    }),
    tx.bankAccount.findMany({
      where: { familyId: ctx.familyId, id: { in: ids("accountIds") } },
      select: { id: true, name: true },
    }),
    tx.creditCard.findMany({
      where: { familyId: ctx.familyId, id: { in: cardIds } },
      select: { id: true, name: true },
    }),
    tx.transaction.findMany({
      where: {
        familyId: ctx.familyId,
        id: { in: page.flatMap((r) => (r.transactionId ? [r.transactionId] : [])) },
      },
      select: {
        id: true,
        description: true,
        amountInCents: true,
        occurredOn: true,
        deletedAt: true,
      },
    }),
    tx.mcpGrant.findMany({
      where: { familyId: ctx.familyId, memberId: ctx.memberId },
      include: { client: { select: { clientName: true, redirectUris: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  const catName = new Map(cats.map((c) => [c.id, c.name] as const));
  const accName = new Map(accs.map((c) => [c.id, c.name] as const));
  const cardName = new Map(cards.map((c) => [c.id, c.name] as const));
  const txById = new Map(txs.map((t) => [t.id, t] as const));
  const grantLabel = new Map(grants.map((g) => [g.id, g.label] as const));

  const items: ActivityItemDTO[] = page.map((r) => {
    const p = r.params as Record<string, unknown>;
    const bits: string[] = [];
    if (typeof p.period === "string") {
      bits.push(p.period === "current" ? "mês atual" : shortMonthLabel(p.period));
    }
    if (typeof p.from === "string" && typeof p.to === "string" && r.kind === "TOOL") {
      bits.push(`${brDate(p.from)} a ${brDate(p.to)}`);
    }
    for (const id of asArray(p.categoryIds)) bits.push(catName.get(id) ?? "categoria removida");
    for (const id of asArray(p.accountIds)) bits.push(accName.get(id) ?? "conta removida");
    for (const id of [...asArray(p.cardIds), ...(typeof p.cardId === "string" ? [p.cardId] : [])]) {
      bits.push(cardName.get(id) ?? "cartão removido");
    }
    if (typeof p.type === "string") bits.push(TYPE_LABEL[p.type] ?? p.type);
    const t = r.transactionId ? txById.get(r.transactionId) : undefined;
    const toolLabel =
      r.kind === "TOOL"
        ? (TOOL_LABEL[r.tool ?? ""] ?? "Usou o assistente")
        : r.kind === "CONNECTED"
          ? "Conectou o assistente"
          : r.kind === "REVOKED"
            ? "Você revogou o assistente"
            : r.kind === "BLOCKED"
              ? "Acesso bloqueado pelo Administrador"
              : "Você alterou um limite de lançamento";
    const change =
      r.kind === "LIMITS_CHANGED" && typeof p.field === "string" && LIMIT_FIELDS.has(p.field)
        ? {
            field: p.field as LimitField,
            from: typeof p.from === "number" ? p.from : null,
            to: typeof p.to === "number" ? p.to : null,
          }
        : null;
    return {
      id: r.id,
      at: r.createdAt.toISOString(),
      assistant: {
        grantId: r.grantId,
        label: r.grantId ? (grantLabel.get(r.grantId) ?? r.clientName) : "Configurações",
      },
      kind: r.kind,
      tool: r.tool,
      toolLabel,
      scopeText: r.kind === "TOOL" && bits.length > 0 ? bits.join(" · ") : null,
      outcome: r.outcome,
      outcomeLabel: OUTCOME_LABEL[r.outcome],
      transaction: t
        ? {
            id: t.id,
            description: t.description,
            amountInCents: toCents(t.amountInCents),
            occurredOn: fromDbDate(t.occurredOn),
            deleted: t.deletedAt !== null,
          }
        : null,
      limitChange: change,
    };
  });

  const last = page[page.length - 1];
  const now = ctx.clock.now();
  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor({ t: last.createdAt.toISOString(), i: last.id }) : null,
    assistants: grants.map((g) => {
      const c = toConnectionDTO(g, now);
      return { grantId: g.id, label: g.label, status: c.status };
    }),
  };
}
