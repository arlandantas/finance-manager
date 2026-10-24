import { resetLlmConfigForTests } from "@/modules/ia/config";
import { getFakeAdapter } from "@/modules/ia/provider";
import { testDb } from "./db";
import { type AccountFixture, type FamilyFixture, makeAccount, makeTransaction } from "./factories";

// Família "Silva" de teste da análise (SDD-023 §8.3): 4 meses (jul..out/2026), "Streaming X" de R$ 55,90 em
// Lazer todos os meses, Lazer de out = R$ 480,00, Moradia, Supermercado e Saúde.

export const SILVA_NOW = "2026-11-05T15:00:00Z"; // hoje = 05/11/2026; último mês fechado = out/2026

export function enableAiFlag() {
  process.env.AI_FEATURES_ENABLED = "true";
  resetLlmConfigForTests();
}

/** Liga a "Análise de gastos" pela Administradora (evento de consentimento direto no banco). */
export async function consentOn(fx: FamilyFixture) {
  await testDb().aiConsentEvent.create({
    data: {
      familyId: fx.family.id,
      purpose: "SPENDING_ANALYSIS",
      action: "ENABLED",
      textVersion: 1,
      memberId: fx.byName.Mariana?.memberId as string,
      createdAt: new Date("2026-10-04T15:00:00Z"),
    },
  });
}

export async function consentOff(fx: FamilyFixture) {
  await testDb().aiConsentEvent.create({
    data: {
      familyId: fx.family.id,
      purpose: "SPENDING_ANALYSIS",
      action: "DISABLED",
      textVersion: 1,
      memberId: fx.byName.Mariana?.memberId as string,
      createdAt: new Date("2026-10-05T15:00:00Z"),
    },
  });
}

export async function makeCategory(fx: FamilyFixture, name: string, icon = "package") {
  return testDb().category.create({
    data: {
      familyId: fx.family.id,
      name,
      kind: "EXPENSE",
      icon,
      sortOrder: 50 + Math.floor(Math.random() * 1000),
    },
  });
}

const MONTHS = ["2026-07", "2026-08", "2026-09", "2026-10"];

export async function seedSilva(
  fx: FamilyFixture,
  o: { months?: string[]; account?: AccountFixture } = {},
): Promise<AccountFixture> {
  const account =
    o.account ??
    (await makeAccount(fx, { name: "Nubank", owner: "Mariana", openingBalanceInCents: 1_000_000 }));
  if (!(await testDb().category.findFirst({ where: { familyId: fx.family.id, name: "Lazer" } }))) {
    await makeCategory(fx, "Lazer", "utensils");
  }
  const months = o.months ?? MONTHS;
  for (const m of months) {
    const tx = (category: string, amountInCents: number, description: string, day = "05") =>
      makeTransaction(fx, {
        account,
        category,
        amountInCents,
        description,
        occurredOn: `${m}-${day}`,
        author: "Mariana",
        payer: "Mariana",
        shared: true,
      });
    await tx("Moradia", 150_000, "Aluguel", "02");
    await tx("Supermercado", 80_000, "Mercado Central", "10");
    await tx("Saúde", 9_000, "Farmácia", "12");
    await tx("Lazer", 5_590, "Streaming X", "15");
    await tx("Lazer", m === months.at(-1) ? 42_410 : 30_000, "Passeios", "20");
    await makeTransaction(fx, {
      account,
      type: "INCOME",
      category: "Salário",
      amountInCents: 600_000,
      description: "Salário",
      occurredOn: `${m}-05`,
      author: "Mariana",
      payer: "Mariana",
    });
  }
  return account;
}

/** Zera o provedor simulado entre testes. */
export function freshFake() {
  const fake = getFakeAdapter();
  if (!fake) throw new Error("os testes exigem o provedor simulado");
  fake.reset();
  return fake;
}

/** Checksum das tabelas de domínio que a análise NUNCA pode alterar. */
export async function domainChecksum(): Promise<string> {
  const db = testDb();
  const parts = await Promise.all([
    db.$queryRaw<
      [{ h: string | null }]
    >`SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) AS h FROM transactions t`,
    db.$queryRaw<
      [{ h: string | null }]
    >`SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) AS h FROM categories t`,
    db.$queryRaw<
      [{ h: string | null }]
    >`SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) AS h FROM planned_expenses t`,
    db.$queryRaw<
      [{ h: string | null }]
    >`SELECT md5(string_agg(t::text, '|' ORDER BY t.id)) AS h FROM recurring_expenses t`,
  ]);
  return parts.map((p) => p[0].h ?? "").join(":");
}
