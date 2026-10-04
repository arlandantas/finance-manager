import { expect } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeFamily } from "../../support/factories";
import { loginAs } from "../../support/login";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();

Given("que Mariana está autenticada e não pertence a nenhuma família", async ({ page }) => {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  await page.goto("/onboarding");
});

When(
  "ela informa o nome {string} e clica em {string}",
  async ({ page }, nome: string, botao: string) => {
    await page.getByLabel("Nome da família").fill(nome);
    await page.getByRole("button", { name: botao }).click();
  },
);

Then("a família {string} é criada", async ({ page }, nome: string) => {
  await expect(page.getByRole("heading", { name: `${nome} criada!` })).toBeVisible();
  expect(await db.family.count({ where: { name: nome } })).toBe(1);
});

Then("Mariana é membro com papel {string}", async ({}, papel: string) => {
  const user = await db.user.findUniqueOrThrow({ where: { email: "mariana@exemplo.com" } });
  const member = await db.member.findUniqueOrThrow({ where: { userId: user.id } });
  expect(member.role).toBe(papel === "Administrador" ? "ADMIN" : "MEMBER");
});

Then(
  "a família possui as {int} categorias de despesa e as {int} de receita padrão",
  async ({}, despesas: number, receitas: number) => {
    expect(await db.category.count({ where: { kind: "EXPENSE" } })).toBe(despesas);
    expect(await db.category.count({ where: { kind: "INCOME" } })).toBe(receitas);
  },
);

Then("ela é levada ao passo opcional de convite", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Convidar membro" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fazer depois" })).toBeVisible();
});

Given("que o nome Google de Mariana é {string}", async ({ page }, nome: string) => {
  await loginAs(page, { email: "mariana@exemplo.com", name: nome });
});

When("o onboarding é exibido", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/onboarding$/);
});

Then(
  "o campo {string} vem preenchido com {string}",
  async ({ page }, campo: string, valor: string) => {
    await expect(page.getByLabel(campo)).toHaveValue(valor);
  },
);

Given("que estou no onboarding", async ({ page }) => {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  await page.goto("/onboarding");
  await expect(page.getByLabel("Nome da família")).toBeVisible();
});

When("informo um nome vazio ou com menos de 2 caracteres e tento criar", async ({ page }) => {
  const field = page.getByLabel("Nome da família");
  await field.fill("");
  await page.getByRole("button", { name: "Criar família" }).click();
  await expect(page.locator("#family-name-error")).toBeVisible();
  await field.fill("a");
  await page.getByRole("button", { name: "Criar família" }).click();
});

Then("vejo a mensagem {string}", async ({ page }, mensagem: string) => {
  await expect(page.getByText(mensagem, { exact: true })).toBeVisible();
});

Then("nenhuma família é criada", async () => {
  expect(await db.family.count()).toBe(0);
});

Given("que preenchi o nome da família", async ({ page }) => {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  await page.goto("/onboarding");
  await page.getByLabel("Nome da família").fill("Família Silva");
});

When("clico duas vezes rapidamente em {string}", async ({ page }, botao: string) => {
  await page.getByRole("button", { name: botao }).dblclick();
});

Then("apenas uma família é criada", async ({ page }) => {
  await expect(page.getByRole("heading", { name: "Família Silva criada!" })).toBeVisible();
  expect(await db.family.count()).toBe(1);
  expect(await db.member.count()).toBe(1);
});

Given("que Lucas já pertence a uma família", async ({ page, world }) => {
  world.family = await makeFamily();
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
});

When("ele tenta acessar a tela de onboarding", async ({ page }) => {
  await page.goto("/onboarding");
});

Then("é redirecionado para a Home", async ({ page }) => {
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("family-name")).toHaveText("Família Silva");
});
