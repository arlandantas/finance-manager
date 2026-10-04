import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
} from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import type { World } from "./fixtures";

type Name = "Mariana" | "Lucas";

export const family = (world: World) => world.family as FamilyFixture;
export const accountsOf = (world: World) =>
  world.data.accounts as { nubank: AccountFixture; itau: AccountFixture };

/** Família com Mariana e Lucas, "Nubank Conjunta" (Mariana) e "Itaú Lucas" (Lucas). */
export async function setupCouple(world: World, o: { onlyMariana?: boolean } = {}) {
  if (world.family) return;
  world.family = await makeFamily(
    o.onlyMariana
      ? { members: [{ email: "mariana@exemplo.com", name: "Mariana Silva", role: "ADMIN" }] }
      : {},
  );
  const nubank = await makeAccount(world.family, {
    name: "Nubank Mariana",
    owner: "Mariana",
    openingBalanceInCents: 500000,
  });
  const itau = await makeAccount(world.family, {
    name: "Itaú Lucas",
    owner: o.onlyMariana ? "Mariana" : "Lucas",
    openingBalanceInCents: 500000,
  });
  world.data.accounts = { nubank, itau };
}

let seq = 0;
/** Despesa comum/pessoal direto no banco, paga por `payer` (valor em texto BRL). */
export async function addExpense(
  world: World,
  payer: Name,
  valor: string,
  o: { shared?: boolean; occurredOn?: string; category?: string } = {},
) {
  seq += 1;
  return makeTransaction(family(world), {
    account: accountsOf(world).nubank,
    category: o.category ?? "Supermercado",
    amountInCents: parseBRL(valor) ?? 0,
    occurredOn: o.occurredOn ?? "2026-10-03",
    author: payer,
    payer,
    shared: o.shared ?? true,
    createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, seq)),
  });
}

export async function enterAs(world: World, page: Page, user: Name) {
  if (world.data.loggedAs === user) return;
  await loginAs(page, { email: `${user.toLowerCase()}@exemplo.com`, name: `${user} Silva` });
  world.data.loggedAs = user;
}

export async function openPanel(world: World, page: Page, user: Name, period?: string) {
  await enterAs(world, page, user);
  await gotoReady(page, period ? `/acerto?period=${period}` : "/acerto");
  await expect(page.getByRole("heading", { name: "Acerto de contas" })).toBeVisible();
  await expect(page.getByTestId("settlement-hero")).toBeVisible();
}

export const memberCard = (page: Page, nome: string) =>
  page.getByTestId("member-card").filter({ hasText: nome });

export async function setProportionalRule(
  world: World,
  bps: Record<Name, number>,
  from = "2026-10-01",
) {
  const db = testDb();
  const fx = family(world);
  await db.splitRuleVersion.create({
    data: {
      familyId: fx.family.id,
      kind: "PROPORTIONAL",
      effectiveFrom: new Date(`${from}T00:00:00Z`),
      shares: {
        create: (Object.keys(bps) as Name[]).map((n) => ({
          memberId: fx.byName[n]?.memberId as string,
          bps: bps[n],
        })),
      },
    },
  });
}
