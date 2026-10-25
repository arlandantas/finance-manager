import { ApiError } from "@/lib/api/errors";
import type { Tx, UserContext } from "@/lib/api/types";
import { localPart } from "@/lib/auth/dev-login-guard";
import { fromDbDate } from "@/lib/dates";
import {
  EXPORT_MAX_BYTES,
  type ExportFile,
  ExportSchema,
} from "@/modules/privacidade/export-schema";
import { isPersonalExpense, personalOwnerId } from "@/modules/transacoes/ownership";

// SEC-017b (SDD-028 §7.3): exportar os dados do titular. Só lê; roda numa transação READ ONLY.
// O mesmo mapeamento serve ao membro ativo (família atual completa) e ao ex-membro (só o que ele fez ou pagou).

const ts = (d: Date) => d.toISOString();
const tsOrNull = (d: Date | null) => (d ? d.toISOString() : null);
const num = (b: bigint) => Number(b);

type MemberWithUser = {
  id: string;
  role: "ADMIN" | "MEMBER";
  removedAt: Date | null;
  user: { name: string | null; email: string };
};
const displayName = (m: MemberWithUser) => m.user.name ?? localPart(m.user.email);

type TxRow = Awaited<ReturnType<typeof loadTransactions>>[number];

/** Lote de ids por consulta: bem abaixo do limite de 32.767 parâmetros do protocolo (SEC-032). */
const BATCH = 5000;

async function loadTransactions(tx: Tx, familyId: string, mine: string[] | null) {
  const rows = await tx.transaction.findMany({
    where: {
      familyId,
      ...(mine ? { OR: [{ authorMemberId: { in: mine } }, { payerMemberId: { in: mine } }] } : {}),
    },
    orderBy: [{ occurredOn: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
  // As divisões vêm em lotes (um `include` único passava de 32 mil parâmetros com ~33 mil lançamentos).
  const splitsBy = new Map<string, Awaited<ReturnType<typeof tx.transactionSplit.findMany>>>();
  for (let i = 0; i < rows.length; i += BATCH) {
    const ids = rows.slice(i, i + BATCH).map((r) => r.id);
    const splits = await tx.transactionSplit.findMany({
      where: { familyId, transactionId: { in: ids } },
    });
    for (const sp of splits) {
      const list = splitsBy.get(sp.transactionId) ?? [];
      list.push(sp);
      splitsBy.set(sp.transactionId, list);
    }
  }
  return rows.map((r) => ({ ...r, splits: splitsBy.get(r.id) ?? [] }));
}

const mapTransaction = (t: TxRow, hideNote = false) => ({
  id: t.id,
  tipo: t.kind,
  direcao: t.direction,
  contaId: t.accountId,
  cartaoId: t.cardId,
  faturaId: t.invoiceId,
  valorEmCentavos: num(t.amountInCents),
  data: fromDbDate(t.occurredOn),
  competencia: fromDbDate(t.competenceOn),
  categoriaId: t.categoryId,
  descricao: t.description,
  observacao: hideNote ? null : t.note,
  pagadorId: t.payerMemberId,
  autorId: t.authorMemberId,
  dividida: t.isSharedExpense,
  modoDivisao: t.splitMode,
  ...(t.splits.length > 0
    ? {
        divisao: t.splits
          .map((s) => ({ membroId: s.memberId, bps: s.bps, valorEmCentavos: num(s.amountInCents) }))
          .sort((a, b) => a.membroId.localeCompare(b.membroId)),
      }
    : {}),
  acertoId: t.transferGroupId,
  planoParcelasId: t.installmentPlanId,
  parcela: t.installmentNo,
  parcelas: t.installmentCount,
  origem: t.origin,
  criadoEm: ts(t.createdAt),
  excluidoEm: tsOrNull(t.deletedAt),
});

async function currentFamily(tx: Tx, familyId: string, memberId: string, myIds: string[]) {
  const family = await tx.family.findUniqueOrThrow({ where: { id: familyId } });
  const members = await tx.member.findMany({
    where: { familyId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
  });
  // "Só meu" de OUTRA pessoa (despesa não dividida, prevista ou recorrente) é dado pessoal dela: não sai no
  // meu arquivo, embora as telas ainda a mostrem (DEV-101).
  const mine = new Set(myIds);
  const visibleToMe = (t: TxRow) => !isPersonalExpense(t) || mine.has(personalOwnerId(t));
  // SEC-050 (D-GES-57): a observação de um "Só meu" de ex-membro que o Administrador tornou dividido não vai para o
  // arquivo dos demais (a descrição vai, é necessária ao acerto). Ex-membro = saiu e o usuário não tem vínculo ativo
  // na família (quem voltou é o próprio dono, SEC-049).
  const activeUsers = new Set(members.filter((m) => m.removedAt === null).map((m) => m.userId));
  const gone = new Set(
    members.filter((m) => m.removedAt !== null && !activeUsers.has(m.userId)).map((m) => m.id),
  );
  const foreignGone = (memberId: string | null, authorId: string | null) =>
    memberId !== null &&
    gone.has(memberId) &&
    !mine.has(memberId) &&
    !(authorId && mine.has(authorId));
  const [accounts, cards, categories, txs, planned, recurring, groups] = await Promise.all([
    tx.bankAccount.findMany({
      where: { familyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.creditCard.findMany({ where: { familyId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] }),
    tx.category.findMany({ where: { familyId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    loadTransactions(tx, familyId, null),
    tx.plannedExpense.findMany({ where: { familyId }, orderBy: [{ dueOn: "asc" }, { id: "asc" }] }),
    tx.recurringExpense.findMany({
      where: { familyId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    }),
    tx.transferGroup.findMany({
      where: { familyId },
      orderBy: [{ occurredOn: "asc" }, { id: "asc" }],
    }),
  ]);
  return {
    id: family.id,
    nome: family.name,
    meuMembroId: memberId,
    membros: members.map((m) => ({
      id: m.id,
      nome: displayName(m),
      papel: m.role,
      exMembro: m.removedAt !== null,
    })),
    contas: accounts.map((a) => ({
      id: a.id,
      nome: a.name,
      instituicao: a.institution,
      tipo: a.type,
      titularId: a.ownerMemberId,
      forasDoDisponivel: a.excludeFromAvailable,
      arquivadaEm: tsOrNull(a.archivedAt),
      excluidaEm: tsOrNull(a.deletedAt),
      criadaEm: ts(a.createdAt),
    })),
    cartoes: cards.map((c) => ({
      id: c.id,
      nome: c.name,
      instituicao: c.institution,
      titularId: c.ownerMemberId,
      limiteEmCentavos: num(c.limitInCents),
      diaFechamento: c.closingDay,
      diaVencimento: c.dueDay,
      arquivadoEm: tsOrNull(c.archivedAt),
      excluidoEm: tsOrNull(c.deletedAt),
      criadoEm: ts(c.createdAt),
    })),
    categorias: categories.map((c) => ({
      id: c.id,
      nome: c.name,
      tipo: c.kind,
      icone: c.icon,
      arquivadaEm: tsOrNull(c.archivedAt),
    })),
    lancamentos: txs
      .filter(visibleToMe)
      .map((t) =>
        mapTransaction(
          t,
          t.kind === "EXPENSE" &&
            t.isSharedExpense &&
            foreignGone(t.payerMemberId, t.authorMemberId),
        ),
      ),
    previstas: planned
      .filter((p) => p.isSharedExpense || mine.has(p.responsibleMemberId))
      .map((p) => ({
        id: p.id,
        descricao: p.description,
        valorEmCentavos: num(p.amountInCents),
        vencimento: fromDbDate(p.dueOn),
        categoriaId: p.categoryId,
        responsavelId: p.responsibleMemberId,
        dividida: p.isSharedExpense,
        observacao:
          p.isSharedExpense && foreignGone(p.responsibleMemberId, p.authorMemberId) ? null : p.note,
        situacao: p.status,
        lancamentoPagoId: p.paidTransactionId,
        recorrenciaId: p.seriesId,
        criadaEm: ts(p.createdAt),
        excluidaEm: tsOrNull(p.deletedAt),
      })),
    recorrentes: recurring
      .filter((r) => r.isSharedExpense || mine.has(r.responsibleMemberId))
      .map((r) => ({
        id: r.id,
        descricao: r.description,
        valorEmCentavos: num(r.amountInCents),
        categoriaId: r.categoryId,
        responsavelId: r.responsibleMemberId,
        dividida: r.isSharedExpense,
        contaPagamentoId: r.paymentAccountId,
        diaDoMes: r.dayOfMonth,
        mesInicial: fromDbDate(r.startMonth),
        mesFinal: r.endMonth ? fromDbDate(r.endMonth) : null,
        encerradaEm: tsOrNull(r.endedAt),
        criadaEm: ts(r.createdAt),
      })),
    acertos: groups.map((g) => ({
      id: g.id,
      tipo: g.kind,
      data: fromDbDate(g.occurredOn),
      periodo: g.settlementPeriod,
      devedorId: g.settlementFromMemberId,
      credorId: g.settlementToMemberId,
      autorId: g.authorMemberId,
      criadoEm: ts(g.createdAt),
      desfeitoEm: tsOrNull(g.deletedAt),
    })),
  };
}

async function formerFamily(tx: Tx, familyId: string, mine: string[]) {
  const family = await tx.family.findUniqueOrThrow({ where: { id: familyId } });
  const members = await tx.member.findMany({
    where: { familyId },
    include: { user: { select: { name: true, email: true } } },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
  });
  // SEC-029: o ex-membro segue a mesma regra do ativo: "Só meu" de OUTRA pessoa não sai, nem a observação
  // que a dona escreveu depois, ainda que ele tenha cadastrado o lançamento.
  const own = new Set(mine);
  const txs = (await loadTransactions(tx, familyId, mine)).filter(
    (t) => !isPersonalExpense(t) || own.has(personalOwnerId(t)),
  );
  // Só os nomes de quem aparece nos lançamentos exportados (nunca e-mail, papel ou outros dados).
  const seen = new Set(mine);
  for (const t of txs) {
    seen.add(t.authorMemberId);
    if (t.payerMemberId) seen.add(t.payerMemberId);
  }
  return {
    id: family.id,
    nome: family.name,
    meuMembroId: mine[0] as string,
    membros: members.filter((m) => seen.has(m.id)).map((m) => ({ id: m.id, nome: displayName(m) })),
    lancamentos: txs.map((t) => mapTransaction(t)),
  };
}

/** Monta o arquivo. Lança 413 acima do teto de bytes (o pedido segue pelo suporte). */
export async function buildExport(
  tx: Tx,
  ctx: Pick<UserContext, "userId" | "clock">,
  maxBytes: number = EXPORT_MAX_BYTES,
): Promise<{ file: ExportFile; json: string }> {
  await tx.$executeRaw`SET TRANSACTION READ ONLY`;
  const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  const memberships = await tx.member.findMany({
    where: { userId: ctx.userId },
    include: { family: { select: { id: true, name: true } } },
    orderBy: [{ joinedAt: "asc" }, { id: "asc" }],
  });
  const myIds = memberships.map((m) => m.id);
  const active = memberships.find((m) => m.removedAt === null) ?? null;

  const consents = await tx.aiConsentEvent.findMany({
    where: { memberId: { in: myIds } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  const grants = await tx.mcpGrant.findMany({
    where: { userId: ctx.userId },
    include: { client: { select: { clientName: true } } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  const familiaAtual = active
    ? await currentFamily(
        tx,
        active.familyId,
        active.id,
        memberships.filter((m) => m.familyId === active.familyId).map((m) => m.id),
      )
    : null;
  const former = new Map<string, string[]>();
  for (const m of memberships) {
    if (active && m.familyId === active.familyId) continue;
    former.set(m.familyId, [...(former.get(m.familyId) ?? []), m.id]);
  }
  const familiasAnteriores = [];
  for (const [familyId, ids] of former)
    familiasAnteriores.push(await formerFamily(tx, familyId, ids));

  const file: ExportFile = ExportSchema.parse({
    version: 1,
    geradoEm: ts(ctx.clock.now()),
    perfil: {
      nome: user.name,
      email: user.email,
      criadoEm: ts(user.createdAt),
    },
    vinculos: memberships.map((m) => ({
      familiaId: m.familyId,
      familia: m.family.name,
      membroId: m.id,
      papel: m.role,
      entrouEm: ts(m.joinedAt),
      saiuEm: tsOrNull(m.removedAt),
      motivoSaida: m.removalKind,
    })),
    consentimentos: consents.map((c) => ({
      familiaId: c.familyId,
      finalidade: c.purpose,
      acao: c.action,
      versaoDoTexto: c.textVersion,
      em: ts(c.createdAt),
    })),
    conexoesAssistente: grants.map((g) => ({
      id: g.id,
      familiaId: g.familyId,
      cliente: g.client?.clientName ?? g.label,
      tipo: g.kind,
      permissoes: g.scopes,
      situacao: g.status,
      criadaEm: ts(g.createdAt),
      expiraEm: ts(g.expiresAt),
      revogadaEm: tsOrNull(g.revokedAt),
      ultimoUsoEm: tsOrNull(g.lastUsedAt),
    })),
    familiaAtual,
    familiasAnteriores,
  });
  const json = JSON.stringify(file);
  if (Buffer.byteLength(json, "utf8") > maxBytes) {
    throw new ApiError(
      413,
      "EXPORT_TOO_LARGE",
      "Seus dados são grandes demais para baixar aqui. Fale com o suporte.",
    );
  }
  return { file, json };
}
