import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeFamily, makeTransaction } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { family, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const EMAIL: Record<string, string> = {
  Lucas: "lucas@exemplo.com",
  Mariana: "mariana@exemplo.com",
  Ana: "ana@exemplo.com",
};

async function openDeletePage(world: World, page: Page, who: string) {
  if (world.data.loggedAs !== who) {
    await loginAs(page, { email: EMAIL[who] as string, name: `${who} Silva` });
    world.data.loggedAs = who;
  }
  await gotoReady(page, "/perfil/excluir-conta");
  await expect(page.getByRole("heading", { name: "Excluir minha conta" })).toBeVisible();
}
const confirmField = (p: Page) => p.getByLabel("Digite seu e-mail para confirmar");
const deleteButton = (p: Page) => p.getByTestId("excluir-conta");

Given(
  "a família da exclusão de conta com Mariana Administradora e Lucas Membro sem pendências",
  async ({ world }) => {
    await setupCouple(world);
    // zera "Itaú Lucas" (saldo inicial R$ 5.000,00) para a saída da família não pedir reatribuição
    const itau = (world.data.accounts as { itau: never }).itau;
    await makeTransaction(family(world), {
      account: itau,
      category: "Moradia",
      amountInCents: 500000,
      occurredOn: "2026-10-01",
      author: "Lucas",
      payer: "Lucas",
      shared: false,
    });
  },
);
Given("Lucas fez uma despesa de {string} na família", async ({ world }, _v: string) => {
  const nubank = (world.data.accounts as { nubank: never }).nubank;
  await makeTransaction(family(world), {
    account: nubank,
    category: "Supermercado",
    amountInCents: 15050,
    occurredOn: "2026-10-03",
    author: "Lucas",
    payer: "Lucas",
    shared: false,
    description: "Compra de Lucas",
  });
});
Given(
  "que a conta {string} tem saldo {string} na exclusão",
  async ({ world }, _c: string, _v: string) => {
    const itau = (world.data.accounts as { itau: never }).itau;
    await makeTransaction(family(world), {
      account: itau,
      category: "Salário",
      type: "INCOME",
      amountInCents: 300000,
      occurredOn: "2026-10-02",
      author: "Lucas",
      payer: "Lucas",
    });
  },
);
Given("a família {string} com apenas a Ana", async ({ world }, nome: string) => {
  world.family = await makeFamily({
    name: nome,
    members: [{ email: "ana@exemplo.com", name: "Ana Silva", role: "ADMIN" }],
  });
});

When("Lucas abre a página de exclusão da conta", async ({ world, page }) => {
  await openDeletePage(world, page, "Lucas");
});
When("Mariana abre a página de exclusão da conta", async ({ world, page }) => {
  await openDeletePage(world, page, "Mariana");
});
When("Ana abre a página de exclusão da conta", async ({ world, page }) => {
  await openDeletePage(world, page, "Ana");
});
When("Lucas digita o e-mail {string} na confirmação", async ({ page }, e: string) => {
  await confirmField(page).fill(e);
});
When("Lucas digita o próprio e-mail", async ({ page }) => {
  await confirmField(page).fill(EMAIL.Lucas as string);
});
When("Lucas digita o próprio e-mail e toca em {string}", async ({ page }, b: string) => {
  await confirmField(page).fill(EMAIL.Lucas as string);
  await page.getByRole("button", { name: b }).click();
});
When("Lucas digita o próprio e-mail e toca duas vezes em {string}", async ({ page }, b: string) => {
  await confirmField(page).fill(EMAIL.Lucas as string);
  await page.getByRole("button", { name: b }).dblclick();
});
When("Lucas fica sem conexão e tenta excluir a conta", async ({ page, context }) => {
  await confirmField(page).fill(EMAIL.Lucas as string);
  await context.setOffline(true);
  await page.getByRole("button", { name: "Excluir minha conta" }).click();
});
When(
  "Lucas escolhe {string} como novo titular de {string} na exclusão",
  async ({ page }, who: string, conta: string) => {
    const select = page.getByLabel(`Novo titular de ${conta}`);
    const value = await select.locator("option", { hasText: who }).first().getAttribute("value");
    await select.selectOption(value as string);
  },
);
When("Mariana abre o Extrato e a despesa", async ({ world, page }) => {
  await loginAs(page, { email: EMAIL.Mariana as string, name: "Mariana Silva" });
  world.data.loggedAs = "Mariana";
  await gotoReady(page, "/extrato");
  await page.getByTestId("ledger-row").filter({ hasText: "Compra de Lucas" }).first().click();
});

Then(
  "vê que sairá da família e que as sessões e os acessos de assistente serão encerrados",
  async ({ page }) => {
    await expect(page.getByText(/Você sai da Família Silva/)).toBeVisible();
    await expect(page.getByText(/acessos de assistente são revogados/)).toBeVisible();
    await expect(page.getByText(/todas as sessões/)).toBeVisible();
  },
);
Then("vê que seus lançamentos continuam na família como {string}", async ({ page }, t: string) => {
  await expect(page.getByText(new RegExp(`“${t.replace(/[()]/g, "\\$&")}”`))).toBeVisible();
});
Then("vê o atalho {string}", async ({ page }, t: string) => {
  await expect(page.getByRole("link", { name: t })).toBeVisible();
});
Then("o botão {string} da exclusão fica desabilitado", async ({ page }, _b: string) => {
  await expect(deleteButton(page)).toBeDisabled();
});
Then("o botão {string} da exclusão fica habilitado", async ({ page }, _b: string) => {
  await expect(deleteButton(page)).toBeEnabled();
});
Then("vê a tela {string}", async ({ page }, t: string) => {
  await expect(page.getByRole("heading", { name: t })).toBeVisible({ timeout: 15_000 });
});
Then(
  "o nome do Lucas no banco é {string} e o e-mail original não existe mais",
  async ({ world }, nome: string) => {
    const u = await db.user.findUniqueOrThrow({
      where: { id: family(world).byName.Lucas?.userId },
    });
    expect(u.name).toBe(nome);
    expect(u.email).not.toBe(EMAIL.Lucas);
    expect(await db.user.count({ where: { email: EMAIL.Lucas } })).toBe(0);
  },
);
Then("o nome do Lucas no banco é {string}", async ({ world }, nome: string) => {
  const u = await db.user.findUniqueOrThrow({ where: { id: family(world).byName.Lucas?.userId } });
  expect(u.name).toBe(nome);
});
Then("Lucas está desconectado", async ({ page }) => {
  await page.goto("/extrato");
  await expect(page).toHaveURL(/\/login/);
});
Then("Lucas não tem nenhuma sessão", async ({ world }) => {
  expect(await db.session.count({ where: { userId: family(world).byName.Lucas?.userId } })).toBe(0);
});
Then("há uma única saída de Lucas registrada", async () => {
  expect(await db.familyEvent.count({ where: { type: "MEMBER_LEFT" } })).toBe(1);
});
Then("a despesa mostra {string}", async ({ page }, t: string) => {
  await expect(page.getByRole("dialog")).toContainText(t);
});
Then("vê o bloqueio {string}", async ({ page }, t: string) => {
  await expect(page.getByTestId("exclusao-bloqueada")).toContainText(t);
});
Then("vê a revisão {string}", async ({ page }, t: string) => {
  await expect(page.getByTestId("removal-review")).toContainText(t);
});
Then("vê o erro da exclusão {string}", async ({ page }, t: string) => {
  await expect(page.getByRole("alert").filter({ hasText: t })).toBeVisible();
});
