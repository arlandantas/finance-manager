import { setDevClockOverride } from "@/lib/clock";
import { call } from "./call";
import { testDb } from "./db";
import type { CardFixture, FamilyFixture } from "./factories";

/**
 * Compra parcelada gerada pelo SERVIÇO (via rota), nunca por SQL: exercita criação atômica, faturas
 * e o gatilho de competência (SDD-014 §5). Só para a integração (usa `call`, que carrega as rotas).
 */
export async function makeInstallmentPurchase(
  fx: FamilyFixture,
  o: {
    card: CardFixture;
    total: number;
    count: number;
    purchaseOn: string;
    category?: string;
    description?: string;
    author?: string;
    note?: string;
  },
) {
  const author = (o.author ? fx.byName[o.author] : fx.members[0]) ?? fx.members[0];
  const categoryId = (
    await testDb().category.findFirstOrThrow({
      where: { familyId: fx.family.id, name: o.category ?? "Supermercado" },
    })
  ).id;
  setDevClockOverride(`${o.purchaseOn}T15:00:00Z`);
  const res = await call(author?.as ?? null, "POST", "/api/v1/transactions", {
    type: "EXPENSE",
    cardId: o.card.id,
    categoryId,
    amountInCents: o.total,
    installments: o.count,
    occurredOn: o.purchaseOn,
    ...(o.description ? { description: o.description } : {}),
    ...(o.note ? { note: o.note } : {}),
  });
  if (res.status !== 201)
    throw new Error(`makeInstallmentPurchase falhou: ${JSON.stringify(res.body)}`);
  return res.body as {
    transaction: { id: string };
    plan: { id: string; installments: Array<{ transactionId: string; no: number }> };
  };
}
