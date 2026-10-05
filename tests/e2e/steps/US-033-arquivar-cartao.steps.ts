import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import {
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
} from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const card = (p: Page, n: string) => p.getByTestId("card-item").filter({ hasText: n });
const toast = (p: Page, t: string) => p.locator("[data-sonner-toast]").filter({ hasText: t });

async function cartoes(world: World, page: Page) {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  world.data.loggedAs = "Mariana";
  await gotoReady(page, "/cartoes");
  await expect(page.getByRole("heading", { name: "Cartões" })).toBeVisible();
}
const fam = (w: World) => w.family as never;

Given(
  /^a família com o cartão "Nubank Lucas" \(compras pagas\) e o cartão "Cartão novo" \(sem compras\)$/,
  async ({ world }) => {
    const fx = await makeFamily();
    world.family = fx;
    const acc = await makeAccount(fx, {
      name: "Itaú",
      owner: "Mariana",
      openingBalanceInCents: 500000,
    });
    const nu = await makeCard(fx, {
      name: "Nubank Lucas",
      owner: "Lucas",
      closingDay: 25,
      dueDay: 5,
    });
    await makeCard(fx, { name: "Cartão novo", owner: "Mariana", closingDay: 25, dueDay: 5 });
    await makeCardPurchase(fx, {
      card: nu,
      amountInCents: 10000,
      occurredOn: "2026-08-10",
      author: "Lucas",
      description: "Compra antiga",
    });
    const inv = await makeInvoice(fx, nu, "2026-08");
    await makeInvoicePayment(fx, {
      card: nu,
      invoice: inv,
      account: acc,
      amountInCents: 10000,
      paidOn: "2026-09-02",
      author: "Lucas",
    });
    world.data.nu = nu;
  },
);

async function archive(page: Page, n: string) {
  await card(page, n)
    .getByRole("button", { name: `Ações do cartão ${n}` })
    .click();
  await page.getByRole("menuitem", { name: "Arquivar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Arquivar", exact: true }).click();
}
When("Mariana arquiva o cartão {string} e confirma", async ({ world, page }, n: string) => {
  await cartoes(world, page);
  await archive(page, n);
});
When("Mariana tenta arquivar o cartão {string}", async ({ world, page }, n: string) => {
  await cartoes(world, page);
  await archive(page, n);
});
Then("vê o aviso de cartão {string}", async ({ page }, t: string) => {
  await expect(toast(page, t)).toBeVisible();
});
Then("{string} não aparece na lista de cartões", async ({ page }, n: string) => {
  await expect(card(page, n)).toHaveCount(0);
});
Given("que o cartão {string} foi arquivado", async ({}, n: string) => {
  const c = await db.creditCard.findFirstOrThrow({ where: { name: n } });
  await db.creditCard.update({ where: { id: c.id }, data: { archivedAt: new Date(), version: 2 } });
});
When("Mariana abre o formulário de despesa do cartão", async ({ world, page }) => {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  world.data.loggedAs = "Mariana";
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await expect(page.getByLabel("Pagar com")).toBeVisible();
});
Then("{string} não aparece nas opções de {string}", async ({ page }, n: string, _l: string) => {
  await expect(page.getByLabel("Pagar com").locator("option", { hasText: n })).toHaveCount(0);
});
When("Mariana abre o Extrato dos cartões", async ({ page }) => {
  await gotoReady(page, "/extrato?period=2026-08");
});
Then("a compra antiga do {string} mostra {string}", async ({ page }, _n: string, t: string) => {
  await expect(
    page.getByTestId("ledger-row").filter({ hasText: "Compra antiga" }).first(),
  ).toContainText(t);
});
Given(
  "uma fatura fechada de {string} do {string} ainda não paga",
  async ({ world }, v: string, n: string) => {
    const nu = await db.creditCard.findFirstOrThrow({ where: { name: n } });
    await makeCardPurchase(fam(world), {
      card: { id: nu.id, name: nu.name, closingDay: nu.closingDay, dueDay: nu.dueDay },
      amountInCents: Math.round(Number(v.replace(/[^\d,]/g, "").replace(",", ".")) * 100),
      occurredOn: "2026-09-10",
      author: "Lucas",
    });
  },
);
Given(
  "uma compra de {string} na fatura aberta do {string}",
  async ({ world }, v: string, n: string) => {
    const nu = await db.creditCard.findFirstOrThrow({ where: { name: n } });
    await makeCardPurchase(fam(world), {
      card: { id: nu.id, name: nu.name, closingDay: nu.closingDay, dueDay: nu.dueDay },
      amountInCents: Math.round(Number(v.replace(/[^\d,]/g, "").replace(",", ".")) * 100),
      occurredOn: "2026-10-03",
      author: "Lucas",
    });
  },
);
Then("vê o bloqueio de cartão {string}", async ({ page }, msg: string) => {
  await expect(page.getByRole("dialog").getByText(msg)).toBeVisible();
});
When("Mariana reativa o cartão {string}", async ({ world, page }, n: string) => {
  await cartoes(world, page);
  await page.getByTestId("archived-cards").locator("summary").click();
  await page
    .getByTestId("archived-card")
    .filter({ hasText: n })
    .getByRole("button", { name: "Reativar" })
    .click();
});
Then("{string} volta à lista de cartões", async ({ page }, n: string) => {
  await expect(card(page, n)).toBeVisible();
});
When("Mariana exclui o cartão {string} e confirma", async ({ world, page }, n: string) => {
  await cartoes(world, page);
  await card(page, n)
    .getByRole("button", { name: `Ações do cartão ${n}` })
    .click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir definitivamente" }).click();
});
When("Mariana abre as ações do cartão {string}", async ({ page }, n: string) => {
  await card(page, n)
    .getByRole("button", { name: `Ações do cartão ${n}` })
    .click();
});
Then("vê a ação de cartão {string} e não vê {string}", async ({ page }, a: string, b: string) => {
  await expect(page.getByRole("menuitem", { name: a })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: b })).toHaveCount(0);
});
