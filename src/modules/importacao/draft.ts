import type { RequestContext, Tx } from "@/lib/api/types";
import { daysBetween, FAMILY_TIMEZONE } from "@/lib/dates";
import { normalizeDescription } from "@/modules/analise-ia/recurring";
import {
  activeBatchAt,
  activeImportKeys,
  type Candidate,
  cardCandidates,
  categoryHistory,
  fallbackCategoryId,
  postedParcels,
} from "./draft-history";
import { defaultSelected, GROUPS, isImportableKind } from "./groups";
import { importKeys, occurrences } from "./import-key";
import { type ImportDraft, type ImportDraftItem, ImportDraftSchema } from "./schemas";
import { issueImportToken } from "./token";
import { reconcileTotal } from "./total";

/** Item como sai do parser (CSV) ou da reconciliação (PDF): ainda sem categoria, grupo definitivo nem marcas. */
export type ExtractedDraftItem = Omit<
  ImportDraftItem,
  "selected" | "group" | "occurrence" | "categoryId" | "payerMemberId" | "flags" | "duplicateOf"
> & { needsAttention?: boolean };

export type ExtractedInput = {
  cardId: string;
  ownerMemberId: string;
  invoiceRef: string;
  source: "CSV" | "PDF";
  fileHash: string;
  declared: ImportDraft["declared"];
  warnings: ImportDraft["warnings"];
  items: ExtractedDraftItem[];
};

const MAX_DAYS = 3;
const brDay = (d: Date) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: FAMILY_TIMEZONE,
    day: "2-digit",
    month: "2-digit",
  }).format(d);

/** Descrição igual ou contida (uma na outra) após normalizar; vazia nunca casa. */
function sameDescription(a: string, b: string): boolean {
  const x = normalizeDescription(a);
  const y = normalizeDescription(b);
  return x !== "" && y !== "" && (x === y || x.includes(y) || y.includes(x));
}

function possibleDuplicate(item: ExtractedDraftItem, pool: Candidate[]): Candidate | undefined {
  if (item.date === null || item.amountInCents === null) return undefined;
  const date = item.date;
  const amount = BigInt(item.amountInCents);
  return pool.find(
    (c) =>
      c.amountInCents === amount &&
      Math.abs(daysBetween(c.date, date)) <= MAX_DAYS &&
      sameDescription(c.description, item.description),
  );
}

/**
 * US-067 (spec 13 regras 11-14): transforma os itens extraídos no rascunho revisável. Só leitura: nada de domínio
 * é gravado. Duplicados e categoria usam sempre o `familyId` da sessão e só o que o membro enxerga.
 */
export async function buildDraft(
  tx: Tx,
  ctx: RequestContext,
  input: ExtractedInput,
): Promise<ImportDraft> {
  const { items } = input;
  const keys = importKeys(input.cardId, input.invoiceRef, items);
  const ords = occurrences(items);
  const [imported, history, outros, batchAt] = await Promise.all([
    activeImportKeys(tx, ctx, keys),
    categoryHistory(
      tx,
      ctx,
      items.filter((i) => i.kind === "PURCHASE" || i.kind === "FEE").map((i) => i.description),
    ),
    fallbackCategoryId(tx, ctx),
    activeBatchAt(tx, ctx, input.cardId, input.fileHash),
  ]);
  const dates = items.flatMap((i) => (i.date ? [i.date] : [])).sort();
  const first = dates[0];
  const last = dates[dates.length - 1];
  const pool: Candidate[] =
    first && last ? await cardCandidates(tx, ctx, input.cardId, first, last) : [];
  const invoice = items.some((i) => i.installment)
    ? await tx.cardInvoice.findFirst({
        where: { familyId: ctx.familyId, cardId: input.cardId, referenceMonth: input.invoiceRef },
        select: { id: true },
      })
    : null;
  const parcels = invoice ? await postedParcels(tx, ctx, input.cardId, invoice.id) : [];

  const out: ImportDraftItem[] = items.map((item, n) => {
    const flags: ImportDraftItem["flags"] = [];
    let selected = defaultSelected(item.kind);
    let duplicateOf: string | undefined;
    let categoryId: string | null = null;
    if (isImportableKind(item.kind)) {
      if (item.needsAttention) flags.push("NEEDS_ATTENTION");
      categoryId = history.get(normalizeDescription(item.description)) ?? outros;
      if (categoryId === null) flags.push("NEEDS_ATTENTION");
      const key = keys[n] as string;
      const amount = item.amountInCents === null ? null : BigInt(item.amountInCents);
      const posted =
        item.installment && amount !== null
          ? parcels.find(
              (c) =>
                c.installmentNo === item.installment?.no &&
                c.installmentCount === item.installment.count &&
                c.amountInCents === amount,
            )
          : undefined;
      if (imported.has(key)) flags.push("ALREADY_IMPORTED");
      else if (posted) flags.push("ALREADY_POSTED_PARCEL");
      else {
        const dup = possibleDuplicate(item, pool);
        if (dup) {
          flags.push("POSSIBLE_DUPLICATE");
          duplicateOf = dup.id;
        }
      }
      if (flags.length > 0) selected = false;
    } else {
      selected = false;
    }
    const { needsAttention: _n, ...rest } = item;
    return {
      ...rest,
      occurrence: ords[n] as number,
      selected: batchAt ? false : selected,
      group: GROUPS[item.kind],
      categoryId,
      payerMemberId: input.ownerMemberId,
      flags,
      ...(duplicateOf ? { duplicateOf } : {}),
    };
  });

  const totals = reconcileTotal(out, input.declared.totalInCents);
  const warnings = [...input.warnings];
  if (input.declared.totalInCents !== undefined && totals.difference !== 0n) {
    warnings.push({
      code: "TOTAL_MISMATCH",
      message: "A soma dos itens não bate com o total declarado na fatura.",
    });
  }
  if (batchAt) {
    warnings.push({
      code: "FILE_ALREADY_IMPORTED",
      message: `Este arquivo já foi importado em ${brDay(batchAt)}.`,
    });
  }
  return ImportDraftSchema.parse({
    importToken: issueImportToken(
      {
        familyId: ctx.familyId,
        cardId: input.cardId,
        fileHash: input.fileHash,
        source: input.source,
      },
      ctx.clock.now(),
    ),
    source: input.source,
    fileHash: input.fileHash,
    invoiceRef: input.invoiceRef,
    declared: input.declared,
    items: out,
    totals: {
      itemsTotal: String(totals.itemsTotal),
      selectedTotal: String(totals.selectedTotal),
      difference: String(totals.difference),
    },
    warnings,
    ...(batchAt ? { alreadyImportedAt: batchAt.toISOString() } : {}),
  });
}
