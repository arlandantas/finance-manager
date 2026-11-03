import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeAccount, makeCard, makeCardPurchase, makeInvoice } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const fam = (w: World) => w.family as never;
const dlg = (p: Page) => p.getByRole("dialog");
const nbsp = (s: string) => new RegExp(s.replace(/\s/g, "\\s").replace(/\$/g, "\\$"));

async function login(world: World, page: Page) {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  world.data.loggedAs = "Mariana";
}

Given("parcelas futuras de {string} no {string}", async ({ world }, v: string, n: string) => {
  const c = await db.creditCard.findFirstOrThrow({ where: { name: n } });
  const card = { id: c.id, name: c.name, closingDay: c.closingDay, dueDay: c.dueDay };
  const cents = Math.round(Number(v.replace(/[^\d,]/g, "").replace(",", ".")) * 100);
  const row = await makeCardPurchase(fam(world), {
    card,
    amountInCents: cents / 2,
    occurredOn: "2026-11-10",
    author: "Lucas",
  });
  const plan = await db.installmentPlan.create({
    data: {
      familyId: row.familyId,
      cardId: c.id,
      totalInCents: BigInt(cents),
      installmentCount: 2,
      purchaseOn: new Date("2026-11-10T00:00:00Z"),
      description: "Geladeira",
      categoryId: row.categoryId as string,
      payerMemberId: row.payerMemberId as string,
      authorMemberId: row.authorMemberId,
    },
  });
  await db.transaction.update({
    where: { id: row.id },
    data: { installmentPlanId: plan.id, installmentNo: 1, installmentCount: 2 },
  });
  const row2 = await makeCardPurchase(fam(world), {
    card,
    amountInCents: cents / 2,
    occurredOn: "2026-12-10",
    author: "Lucas",
  });
  await db.transaction.update({
    where: { id: row2.id },
    data: { installmentPlanId: plan.id, installmentNo: 2, installmentCount: 2 },
  });
});

When("Mariana abre o arquivamento do cartão {string}", async ({ world, page }, n: string) => {
  await login(world, page);
  await gotoReady(page, "/cartoes");
  await page
    .getByTestId("card-item")
    .filter({ hasText: n })
    .getByRole("button", { name: `Ações do cartão ${n}` })
    .click();
  await page.getByRole("menuitem", { name: "Arquivar" }).click();
  await expect(dlg(page).getByRole("button", { name: "Arquivar", exact: true })).toBeVisible();
});
Then(
  "o diálogo de arquivar mostra {string} com {string}",
  async ({ page }, l: string, v: string) => {
    await expect(dlg(page).getByText(nbsp(`${l}.*${v}`))).toBeVisible();
  },
);
Then("o diálogo de arquivar tem o link {string}", async ({ page }, l: string) => {
  await expect(dlg(page).getByRole("link", { name: l })).toBeVisible();
});
Then("o botão de confirmar arquivamento está desabilitado", async ({ page }) => {
  await expect(dlg(page).getByRole("button", { name: "Arquivar", exact: true })).toBeDisabled();
});
Then("o botão de confirmar arquivamento está habilitado", async ({ page }) => {
  await expect(dlg(page).getByRole("button", { name: "Arquivar", exact: true })).toBeEnabled();
});
When("Mariana confirma o arquivamento", async ({ page }) => {
  await dlg(page).getByRole("button", { name: "Arquivar", exact: true }).click();
});
When(
  "surge uma compra de {string} na fatura aberta do {string}",
  async ({ world }, v: string, n: string) => {
    const c = await db.creditCard.findFirstOrThrow({ where: { name: n } });
    await makeCardPurchase(fam(world), {
      card: { id: c.id, name: c.name, closingDay: c.closingDay, dueDay: c.dueDay },
      amountInCents: Math.round(Number(v.replace(/[^\d,]/g, "").replace(",", ".")) * 100),
      occurredOn: "2026-10-03",
      author: "Lucas",
    });
  },
);

Given("vários cartões e contas e um cartão arquivado", async ({ world }) => {
  const fx = fam(world);
  for (const i of [1, 2, 3, 4]) {
    await makeCard(fx, { name: `Cartão extra ${i}`, owner: "Mariana" });
    await makeAccount(fx, { name: `Conta extra ${i}`, owner: "Mariana" });
  }
  const c = await db.creditCard.findFirstOrThrow({ where: { name: "Cartão novo" } });
  await db.creditCard.update({ where: { id: c.id }, data: { archivedAt: new Date(), version: 2 } });
  const a = await db.bankAccount.findFirstOrThrow({ where: { name: "Conta extra 1" } });
  await db.bankAccount.update({
    where: { id: a.id },
    data: { archivedAt: new Date(), version: 2 },
  });
  const n = await db.creditCard.findFirstOrThrow({ where: { name: "Cartão extra 1" } });
  await db.creditCard.update({ where: { id: n.id }, data: { archivedAt: new Date(), version: 2 } });
});

/** Rola ao fim e confere que o ponto central do alvo é o próprio alvo (nada o cobre). */
async function expectReachable(page: Page, target: ReturnType<Page["locator"]>) {
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(target).toBeVisible();
  const covered = await target.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !(hit && el.contains(hit));
  });
  expect(covered).toBe(false);
  expect((await target.boundingBox())?.height).toBeGreaterThanOrEqual(40);
}

When("Mariana abre a lista de cartões no celular", async ({ world, page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await login(world, page);
  await gotoReady(page, "/cartoes");
  await expect(page.getByTestId("card-item").first()).toBeVisible();
  await page.getByTestId("archived-cards").locator("summary").click();
});
Then(
  "as ações do último cartão e o {string} do arquivado ficam visíveis e tocáveis",
  async ({ page }, label: string) => {
    await expectReachable(
      page,
      page.getByTestId("archived-card").last().getByRole("button", { name: label }),
    );
    const menu = page
      .getByTestId("card-item")
      .last()
      .getByRole("button", { name: /^Ações do cartão/ });
    await expectReachable(page, menu);
  },
);
When("Mariana abre a lista de contas no celular", async ({ world, page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await gotoReady(page, "/contas");
  await expect(page.getByTestId("account-card").first()).toBeVisible();
  await page.getByTestId("archived-accounts").locator("summary").click();
});
Then(
  "as ações da última conta e o Reativar da arquivada ficam visíveis e tocáveis",
  async ({ page }) => {
    await expectReachable(
      page,
      page.getByTestId("archived-account").last().getByRole("button", { name: "Reativar" }),
    );
    const menu = page
      .getByTestId("account-card")
      .last()
      .getByRole("button", { name: /^Ações da conta/ });
    await expectReachable(page, menu);
  },
);
