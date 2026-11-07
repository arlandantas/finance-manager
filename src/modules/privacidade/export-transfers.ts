import type { Tx } from "@/lib/api/types";
import { fromDbDate } from "@/lib/dates";
import { toCents } from "@/lib/money";

/**
 * US-100: transferências previstas da família. Não há "Só meu" nelas (ADR-037 §1): qualquer membro ativo as
 * vê, então todas saem. Sem nome de terceiros: só ids de conta, transferência e autor.
 */
export async function exportPlannedTransfers(tx: Tx, familyId: string) {
  const rows = await tx.plannedTransfer.findMany({
    where: { familyId },
    orderBy: [{ dueOn: "asc" }, { id: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    contaOrigemId: r.fromAccountId,
    contaDestinoId: r.toAccountId,
    valorEmCentavos: toCents(r.amountInCents),
    vencimento: fromDbDate(r.dueOn),
    descricao: r.description,
    situacao: r.status,
    transferenciaId: r.transferGroupId,
    autorId: r.authorMemberId,
    criadaEm: r.createdAt.toISOString(),
    excluidaEm: r.deletedAt ? r.deletedAt.toISOString() : null,
  }));
}
