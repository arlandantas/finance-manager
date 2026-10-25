import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily, makeTransaction } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { family, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();

async function login(world: World, page: Page, who: "Mariana" | "Lucas") {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
}

Given(
  'a "Família Silva" onde Mariana é a única pessoa ativa e Administradora com dados',
  async ({ world }) => {
    await setupCouple(world, { onlyMariana: true });
    const nubank = (world.data.accounts as { nubank: never }).nubank;
    await makeTransaction(family(world), {
      account: nubank,
      category: "Supermercado",
      amountInCents: 15050,
      occurredOn: "2026-10-03",
      author: "Mariana",
      payer: "Mariana",
      shared: false,
      description: "Compra da Mariana",
    });
  },
);
Given('a "Família Souza" com lançamentos e contas', async ({ world }) => {
  const souza = await makeFamily({
    name: "Família Souza",
    members: [{ email: "ana@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
  });
  const conta = await makeAccount(souza, {
    name: "Conta da Ana",
    owner: "Ana",
    openingBalanceInCents: 777,
  });
  await makeTransaction(souza, {
    account: conta,
    category: "Supermercado",
    amountInCents: 4242,
    occurredOn: "2026-10-03",
    author: "Ana",
    payer: "Ana",
    shared: false,
  });
  world.data.souza = souza;
  world.data.souzaBefore = await snapshotOf(souza.family.id);
});
Given('que Lucas também é membro ativo da "Família Silva"', async ({ world }) => {
  const fx = family(world);
  const lucas = await db.user.create({ data: { email: "lucas@exemplo.com", name: "Lucas Silva" } });
  await db.member.create({ data: { familyId: fx.family.id, userId: lucas.id, role: "MEMBER" } });
});
Given("Mariana está autenticada para excluir a família", async ({ world, page }) => {
  await login(world, page, "Mariana");
});
Given("Lucas está autenticado para excluir a família", async ({ world, page }) => {
  await login(world, page, "Lucas");
});

async function snapshotOf(familyId: string) {
  return JSON.stringify(
    [
      await db.member.findMany({ where: { familyId } }),
      await db.bankAccount.findMany({ where: { familyId } }),
      await db.transaction.findMany({ where: { familyId }, orderBy: { id: "asc" } }),
    ],
    (_k, v) => (typeof v === "bigint" ? v.toString() : v),
  );
}

When("Mariana abre Família e toca em {string}", async ({ page }, texto: string) => {
  await gotoReady(page, "/familia");
  await expect(page.getByTestId("zona-de-risco")).toBeVisible();
  await page.getByRole("link", { name: texto }).click();
  await expect(page.getByRole("heading", { name: "Excluir família" })).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
});
When("Mariana abre Família", async ({ page }) => {
  await gotoReady(page, "/familia");
  await expect(page.getByTestId("family-title")).toBeVisible();
});
When("Lucas abre Família", async ({ page }) => {
  await gotoReady(page, "/familia");
  await expect(page.getByTestId("family-title")).toBeVisible();
});
When("Mariana digita o nome {string} para excluir a família", async ({ page }, nome: string) => {
  await page.getByLabel("Digite o nome da família").fill(nome);
});
When("Mariana confirma a exclusão tocando em {string}", async ({ page }, b: string) => {
  await page.getByRole("button", { name: b }).click();
});
When("Mariana confirma a exclusão tocando duas vezes em {string}", async ({ page }, b: string) => {
  await page.getByRole("button", { name: b }).dblclick();
});

Then("vê a lista de tudo que será apagado", async ({ page }) => {
  const lista = page.getByTestId("lista-apagar");
  for (const i of [
    "contas",
    "cartões",
    "categorias",
    "tags",
    "lançamentos",
    "previstas",
    "recorrentes",
    "acertos",
    "importações",
    "análises",
    "o histórico de alterações",
  ]) {
    await expect(lista).toContainText(i);
  }
});
Then("vê {string} na exclusão da família", async ({ page }, t: string) => {
  await expect(page.getByText(t)).toBeVisible();
});
Then("vê o atalho {string} na exclusão da família", async ({ page }, t: string) => {
  await expect(page.getByRole("link", { name: t })).toBeVisible();
});
Then("o botão {string} fica desabilitado na exclusão da família", async ({ page }, b: string) => {
  await expect(page.getByRole("button", { name: b })).toBeDisabled();
});
Then("o botão {string} fica habilitado na exclusão da família", async ({ page }, b: string) => {
  await expect(page.getByRole("button", { name: b })).toBeEnabled();
});
Then("vê o aviso {string} e a tela de criar família", async ({ page }, t: string) => {
  await expect(page).toHaveURL(/\/onboarding/, { timeout: 20_000 });
  await expect(page.getByText(t)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Crie sua família" })).toBeVisible();
});
Then("nada da {string} existe mais no banco", async ({ world }, nome: string) => {
  const id = family(world).family.id;
  expect(await db.family.count({ where: { name: nome } })).toBe(0);
  expect(await db.transaction.count({ where: { familyId: id } })).toBe(0);
  expect(await db.bankAccount.count({ where: { familyId: id } })).toBe(0);
  expect(await db.member.count({ where: { familyId: id } })).toBe(0);
  expect(await db.familyEvent.count({ where: { familyId: id } })).toBe(0);
});
Then("a conta de Mariana continua ativa", async () => {
  const u = await db.user.findUniqueOrThrow({ where: { email: "mariana@exemplo.com" } });
  expect(u.deletedAt).toBeNull();
});
Then("os dados da {string} permanecem iguais", async ({ world }, _nome: string) => {
  const souza = world.data.souza as Awaited<ReturnType<typeof makeFamily>>;
  expect(await snapshotOf(souza.family.id)).toBe(world.data.souzaBefore);
});
Then("vê {string} na zona de risco", async ({ page }, t: string) => {
  await expect(page.getByTestId("zona-de-risco")).toContainText(t);
});
Then("o botão {string} não está disponível", async ({ page }, nome: string) => {
  await expect(page.getByRole("link", { name: nome })).toHaveCount(0);
  await expect(page.getByRole("button", { name: nome })).toHaveCount(0);
});
Then("não vê {string}", async ({ page }, nome: string) => {
  await expect(page.getByRole("link", { name: nome })).toHaveCount(0);
  await expect(page.getByTestId("zona-de-risco")).toHaveCount(0);
});
