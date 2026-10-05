import { Prisma } from "@/generated/prisma/client";
import { unprocessable } from "@/lib/api/errors";
import type { Tx } from "@/lib/api/types";
import { invoiceDates } from "@/modules/cartoes/cycle";

export type InvoiceRow = { id: string; ref: string; closingDate: string; dueDate: string };

/**
 * SDD-008 §4.3. Cria a fatura do ciclo sob demanda e devolve a linha TRAVADA (`FOR UPDATE`).
 * 1) `FOR SHARE` no cartão impede o PATCH do ciclo durante a criação;
 * 2) `INSERT … ON CONFLICT DO NOTHING` (única por cartão e mês de fechamento);
 * 3) `SELECT … FOR UPDATE` serializa toda escrita que muda o conteúdo da fatura.
 * Operações que tocam duas faturas chamam em ordem crescente de `ref` (evita deadlock).
 */
export async function getOrCreateInvoice(
  tx: Tx,
  familyId: string,
  card: { id: string; closingDay: number; dueDay: number },
  ref: string,
): Promise<InvoiceRow> {
  const locked = await tx.$queryRaw<Array<{ archivedAt: Date | null; deletedAt: Date | null }>>`
    SELECT "archivedAt", "deletedAt" FROM credit_cards WHERE id = ${card.id}::uuid AND "familyId" = ${familyId}::uuid FOR SHARE`;
  // US-033: depois do lock, cartão arquivado/excluído não recebe compra nova
  if (!locked[0] || locked[0].archivedAt !== null || locked[0].deletedAt !== null) {
    throw unprocessable("INVALID_REFERENCE", "Escolha um cartão", [
      { path: "cardId", message: "Escolha um cartão" },
    ]);
  }
  const { closingDate, dueDate } = invoiceDates(ref, card.closingDay, card.dueDay);
  await tx.$executeRaw`
    INSERT INTO card_invoices (id, "familyId", "cardId", "referenceMonth", "closingDate", "dueDate")
    VALUES (gen_random_uuid(), ${familyId}::uuid, ${card.id}::uuid, ${ref}, ${closingDate}::date, ${dueDate}::date)
    ON CONFLICT ("cardId", "referenceMonth") DO NOTHING`;
  const rows = await tx.$queryRaw<InvoiceRow[]>`
    SELECT id, "referenceMonth" AS ref,
           to_char("closingDate", 'YYYY-MM-DD') AS "closingDate",
           to_char("dueDate", 'YYYY-MM-DD') AS "dueDate"
    FROM card_invoices
    WHERE "cardId" = ${card.id}::uuid AND "familyId" = ${familyId}::uuid AND "referenceMonth" = ${ref}
    FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new Error("Fatura não encontrada após a criação");
  return row;
}

/** Trava (FOR UPDATE) faturas já existentes pelo id, em ordem crescente de `referenceMonth`. */
export async function lockInvoices(tx: Tx, familyId: string, ids: string[]): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;
  await tx.$queryRaw`
    SELECT id FROM card_invoices
    WHERE "familyId" = ${familyId}::uuid
      AND id IN (${Prisma.join(unique.map((id) => Prisma.sql`${id}::uuid`))})
    ORDER BY "referenceMonth" ASC, id ASC
    FOR UPDATE`;
}
