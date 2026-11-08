import { uniqueViolation } from "@/lib/api/db-errors";
import { conflict, notFound, unprocessable } from "@/lib/api/errors";
import type { RequestContext, Tx } from "@/lib/api/types";
import { todayInFamilyTz } from "@/lib/dates";
import { toCents } from "@/lib/money";
import { invoiceDates, openInvoiceRef } from "@/modules/cartoes/cycle";
import { getOrCreateInvoice, type InvoiceRow } from "@/modules/cartoes/invoices";
import { activePayments } from "@/modules/cartoes/queries";
import { lockFamilySplit } from "@/modules/split/lock";
import { transacoesRepo } from "@/modules/transacoes/repo";
import { memberRefOf } from "@/modules/transacoes/service";
import {
  draftTotal,
  type ItemDraft,
  mapItem,
  type PlanDraft,
  refsOf,
  type SingleDraft,
} from "./confirm-map";
import { buildResponse } from "./confirm-response";
import { type ConfirmImportBody, type ConfirmItem } from "./confirm-schema";
import { itemInvalid, validateItems } from "./confirm-validate";
import { insertPlan, insertRevisions, insertSingles, type Written } from "./confirm-write";
import { activeBatchAt, activeImportKeys, postedParcels } from "./draft-history";
import { importKeys } from "./import-key";
import { verifyImportToken } from "./token";

const duplicate = (idx: number, reason: string) =>
  conflict("IMPORT_ITEM_DUPLICATE", "Um dos itens já foi lançado.", { idx, reason });

const alreadyExists = (importedAt?: Date) =>
  conflict(
    "IMPORT_ALREADY_EXISTS",
    "Este arquivo já foi importado neste cartão.",
    importedAt ? { importedAt: importedAt.toISOString() } : undefined,
  );

/** Violação dos índices únicos (corrida que escapou da checagem): vira 409 e a transação inteira desfaz. */
function translateUnique(e: unknown): unknown {
  const v = uniqueViolation(e);
  if (!v) return e;
  if (v.target.includes("import_batches") || v.target.includes("fileHash")) return alreadyExists();
  return conflict("IMPORT_ITEM_DUPLICATE", "Um dos itens já foi lançado.");
}

/**
 * US-068 (ADR-042 §10, spec 13 regras 15-17): confirma e grava o lote numa transação. Tudo ou nada.
 * Ordem das travas: família (rateio) → cartão → faturas por `ref` crescente (alvo + parcelas futuras).
 */
export async function confirmInvoiceImport(
  tx: Tx,
  ctx: RequestContext,
  cardId: string,
  body: ConfirmImportBody,
) {
  const token = verifyImportToken(
    body.importToken,
    { familyId: ctx.familyId, cardId },
    ctx.clock.now(),
  );
  if (!token) {
    throw unprocessable("IMPORT_TOKEN_INVALID", "A revisão expirou. Envie o arquivo de novo.");
  }
  await lockFamilySplit(tx, ctx.familyId); // ADR-021 §2: primeira trava
  const repo = transacoesRepo(tx, ctx.familyId);
  const card = await repo.findCardForPosting(cardId); // cartão travado antes de ler o ciclo
  if (!card) throw notFound("Cartão não encontrado.");
  const today = todayInFamilyTz(ctx.clock);
  if (body.invoiceRef > openInvoiceRef(today, card.closingDay)) {
    throw unprocessable("INVOICE_REF_INVALID", "Escolha a fatura aberta ou uma anterior.", [
      { path: "invoiceRef", message: "Fatura posterior à aberta" },
    ]);
  }
  const items = [...body.items].sort((a, b) => a.idx - b.idx);
  await validateItems(tx, ctx, items, today);

  // faturas: alvo + as das parcelas futuras, `FOR UPDATE` em ordem crescente de `ref`
  const keys = importKeys(
    cardId,
    body.invoiceRef,
    items.map((i) => ({
      date: i.date,
      amountInCents: BigInt(i.amountInCents).toString(),
      description: i.description,
      installment: i.installment,
    })),
  );
  const drafts = planDrafts(card, items, keys, body, today);
  const invoices = new Map<string, InvoiceRow>();
  for (const ref of refsOf(drafts, body.invoiceRef)) {
    invoices.set(ref, await getOrCreateInvoice(tx, ctx.familyId, card, ref));
  }
  const target = invoices.get(body.invoiceRef) as InvoiceRow;
  const paid = await activePayments(
    tx,
    ctx.familyId,
    [...invoices.values()].map((i) => i.id),
  );
  for (const inv of invoices.values()) {
    if (paid.has(inv.id)) {
      throw unprocessable(
        "INVOICE_PAID_LOCKED",
        "Esta fatura já foi paga e não aceita importação.",
        {
          ref: inv.ref,
        },
      );
    }
  }

  // dedupe no servidor, já sob as travas (o arquivo e os itens)
  const batchAt = await activeBatchAt(tx, ctx, cardId, token.fileHash);
  if (batchAt) throw alreadyExists(batchAt);
  await assertNoDuplicates(tx, ctx, { cardId, target, keys, items });

  const total = drafts.reduce((s, d) => s + draftTotal(d), 0n);
  try {
    const batch = await tx.importBatch.create({
      data: {
        familyId: ctx.familyId,
        cardId,
        invoiceId: target.id,
        fileHash: token.fileHash,
        source: token.source,
        itemCount: items.length,
        totalInCents: total,
        importedByMemberId: ctx.memberId,
        importedAt: ctx.clock.now(),
      },
    });
    const written = await writeAll(tx, ctx, {
      batchId: batch.id,
      cardId,
      target,
      invoices,
      drafts,
    });
    await tx.familyEvent.create({
      data: {
        familyId: ctx.familyId,
        type: "INVOICE_IMPORTED",
        actorMemberId: ctx.memberId,
        // só ids, contagem e total: nunca descrições nem conteúdo do arquivo (invariante 1)
        changes: {
          batchId: batch.id,
          cardId,
          invoiceId: target.id,
          itemCount: items.length,
          totalInCents: toCents(total),
        },
      },
    });
    return await buildResponse(tx, ctx, {
      batch,
      card,
      target,
      written,
      items,
      members: new Map((await repo.listMembers()).map((m) => [m.id, memberRefOf(m)] as const)),
    });
  } catch (e) {
    throw translateUnique(e);
  }
}

/** Mapeia os itens (puro) e confere que a parcela `n` cai na fatura alvo. */
function planDrafts(
  card: { closingDay: number; dueDay: number },
  items: ConfirmItem[],
  keys: string[],
  body: ConfirmImportBody,
  today: string,
): ItemDraft[] {
  const { closingDate } = invoiceDates(body.invoiceRef, card.closingDay, card.dueDay);
  const plan = {
    closingDay: card.closingDay,
    dueDay: card.dueDay,
    invoiceRef: body.invoiceRef,
    closingDate,
    today,
  };
  const list = items.map((item, n) => mapItem(item, keys[n] as string, plan));
  for (const d of list) {
    if (d.kind === "PLAN" && d.parcels[0]?.invoiceRef !== body.invoiceRef) {
      throw itemInvalid(d.item.idx, "installment", "A parcela não cai nesta fatura.");
    }
  }
  return list;
}

/** `ALREADY_IMPORTED` e `ALREADY_POSTED_PARCEL` (regra 13) rechecados no servidor: 409 com o `idx`. */
async function assertNoDuplicates(
  tx: Tx,
  ctx: RequestContext,
  a: { cardId: string; target: InvoiceRow; keys: string[]; items: ConfirmItem[] },
): Promise<void> {
  const used = await activeImportKeys(tx, ctx, a.keys);
  const parcels = a.items.some((i) => i.installment)
    ? await postedParcels(tx, ctx, a.cardId, a.target.id)
    : [];
  for (const [n, item] of a.items.entries()) {
    if (used.has(a.keys[n] as string)) throw duplicate(item.idx, "ALREADY_IMPORTED");
    const inst = item.installment;
    const amount = BigInt(item.amountInCents);
    if (
      inst &&
      parcels.some(
        (p) =>
          p.installmentNo === inst.no &&
          p.installmentCount === inst.count &&
          p.amountInCents === amount,
      )
    ) {
      throw duplicate(item.idx, "ALREADY_POSTED_PARCEL");
    }
  }
}

async function writeAll(
  tx: Tx,
  ctx: RequestContext,
  a: {
    batchId: string;
    cardId: string;
    target: InvoiceRow;
    invoices: Map<string, InvoiceRow>;
    drafts: ItemDraft[];
  },
): Promise<Map<string, Written>> {
  const byKey = new Map<string, Written>();
  const singles = a.drafts.filter((d): d is SingleDraft => d.kind === "SINGLE");
  const singleRows = await insertSingles(
    tx,
    ctx,
    { batchId: a.batchId, cardId: a.cardId, invoice: a.target },
    singles,
  );
  await insertRevisions(tx, ctx, singleRows);
  for (const [i, w] of singleRows.entries()) byKey.set((singles[i] as SingleDraft).key, w);
  for (const p of a.drafts.filter((d): d is PlanDraft => d.kind === "PLAN")) {
    const { written } = await insertPlan(
      tx,
      ctx,
      { batchId: a.batchId, cardId: a.cardId, invoices: a.invoices },
      p,
    );
    await insertRevisions(tx, ctx, written);
    const first = written.find((w) => w.row.importKey === p.key) as Written;
    byKey.set(p.key, first);
  }
  return byKey;
}
