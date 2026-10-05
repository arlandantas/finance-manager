import { expect, type Page } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import type { World } from "./fixtures";

export type UserName = "Mariana" | "Lucas";

/** Garante família (com a conta pedida) e sessão do usuário, sem repetir o que o cenário já criou. */
export async function ensureWorld(
  world: World,
  page: Page,
  user: UserName,
  account: { name: string; owner?: string; balance: number } = {
    name: "Nubank Conjunta",
    owner: "Mariana",
    balance: 100000,
  },
) {
  if (!world.family) {
    world.family = await makeFamily();
    await makeAccount(world.family, {
      name: account.name,
      owner: account.owner ?? "Mariana",
      openingBalanceInCents: account.balance,
    });
  }
  if (world.data.loggedAs !== user) {
    await loginAs(page, { email: `${user.toLowerCase()}@exemplo.com`, name: `${user} Silva` });
    world.data.loggedAs = user;
  }
  if (!page.url().startsWith("http")) await gotoReady(page, "/");
}

export const drawer = (page: Page) =>
  page.getByRole("dialog").filter({ has: page.getByLabel("Valor", { exact: true }) });

export async function openDrawer(page: Page) {
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(page.getByLabel("Valor", { exact: true })).toBeFocused();
}

export async function fillAmount(page: Page, valor: string) {
  await page.getByLabel("Valor", { exact: true }).fill(valor);
}

export async function pickCategory(page: Page, nome: string) {
  await page.getByRole("radio", { name: nome, exact: true }).click();
}

export async function setDate(page: Page, iso: string) {
  const dialog = drawer(page);
  const date = dialog.getByLabel("Data", { exact: true });
  if (!(await date.isVisible())) await dialog.getByText("Mais detalhes").click();
  await date.fill(iso);
}

export async function save(page: Page, label: string) {
  await drawer(page).getByRole("button", { name: label }).click();
}

export async function waitSaved(page: Page) {
  await expect(drawer(page)).toBeHidden();
}

/** Última movimentação do tipo, com os primeiros nomes de autor/pagador. */
export async function lastTransaction(kind: "EXPENSE" | "INCOME") {
  const db = testDb();
  const row = await db.transaction.findFirstOrThrow({
    where: { kind },
    orderBy: [{ createdAt: "desc" }],
    include: { account: true, category: true },
  });
  const names = new Map(
    (await db.member.findMany({ include: { user: true } })).map((m) => [
      m.id,
      (m.user.name ?? "").split(" ")[0] as string,
    ]),
  );
  return { row, name: (id: string | null) => (id ? names.get(id) : undefined) };
}

/** Lê o card da conta numa segunda aba (não perturba o drawer/toast da aba principal). */
export async function balanceOnScreen(page: Page, conta: string): Promise<string> {
  const other = await page.context().newPage();
  await gotoReady(other, "/contas");
  const card = other.getByTestId("account-card").filter({ hasText: conta });
  await expect(card).toBeVisible();
  // Valores nascem ocultos até a preferência carregar (US-027): espera o valor ficar legível.
  await expect(card.locator('[data-money="visible"]').first()).toBeVisible();
  const text = normalizeSpaces(await card.innerText());
  await other.close();
  return text;
}
