import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeFamily } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();

async function enter(world: World, page: Page, user: "Mariana" | "Lucas") {
  world.family ??= await makeFamily();
  await loginAs(page, { email: `${user.toLowerCase()}@exemplo.com`, name: `${user} Silva` });
  world.data.loggedAs = user;
}

async function openRule(page: Page) {
  await gotoReady(page, "/acerto/regra");
  await expect(page.getByRole("heading", { name: "Regra de divisão" })).toBeVisible();
  await expect(page.getByRole("radio").first()).toBeVisible();
}

const percent = (page: Page, nome: string) =>
  page.getByLabel(`Percentual de ${nome}`, { exact: true });

async function chooseProportional(page: Page) {
  await page.getByRole("radio", { name: "Proporcional" }).check();
}

Given("uma família recém-criada com Mariana e Lucas", async ({ world, page }) => {
  await enter(world, page, "Mariana");
});

Given("que sou Administrador", async ({ world, page }) => {
  await enter(world, page, "Mariana");
});

Given("que sou Administrador na tela {string}", async ({ world, page }, _tela: string) => {
  await enter(world, page, "Mariana");
  await openRule(page);
  await chooseProportional(page);
});

When("abro {string}", async ({ page }, _tela: string) => {
  await openRule(page);
});

When("ele abre {string}", async ({ page }, _tela: string) => {
  await openRule(page);
});

Then("vejo {string} selecionado", async ({ page }, rotulo: string) => {
  await expect(page.getByRole("radio", { name: rotulo })).toBeChecked();
});

When(
  "escolho {string} e informo Mariana {string} e Lucas {string}",
  async ({ page }, _opcao: string, m: string, l: string) => {
    await openRule(page);
    await chooseProportional(page);
    await percent(page, "Mariana").fill(m.replace("%", ""));
    await percent(page, "Lucas").fill(l.replace("%", ""));
    await expect(page.getByTestId("split-total")).toHaveText("Total: 100%");
  },
);

Then("a regra é salva", async ({ page }) => {
  await page.getByRole("button", { name: "Salvar regra" }).click();
  await expect(page.getByText("Regra de divisão salva")).toBeVisible();
  const rules = await db.splitRuleVersion.findMany({
    include: { shares: true },
    orderBy: { createdAt: "desc" },
  });
  expect(rules[0]?.kind).toBe("PROPORTIONAL");
  expect(rules[0]?.shares.map((s) => s.bps).sort()).toEqual([4000, 6000]);
  await page.reload();
  await expect(page.getByRole("radio", { name: "Proporcional" })).toBeChecked();
  await expect(percent(page, "Mariana")).toHaveValue("60");
  await expect(percent(page, "Lucas")).toHaveValue("40");
});

When(
  "informo Mariana {string} e Lucas {string} e tento salvar",
  async ({ page }, m: string, l: string) => {
    await percent(page, "Mariana").fill(m.replace("%", ""));
    await percent(page, "Lucas").fill(l.replace("%", ""));
    await page.getByRole("button", { name: "Salvar regra" }).click();
  },
);

Then("a regra anterior é mantida", async ({ page }) => {
  expect(await db.splitRuleVersion.count()).toBe(1);
  await page.reload();
  await expect(page.getByRole("radio", { name: /Dividir igualmente/ })).toBeChecked();
});

When(
  "informo {string} ou {string} para um membro",
  async ({ page, world }, a: string, b: string) => {
    world.data.invalid = [a, b];
    await percent(page, "Mariana").fill(a.replace("%", ""));
    await page.getByRole("button", { name: "Salvar regra" }).click();
    await expect(page.getByText("Informe um percentual entre 0% e 100%")).toBeVisible();
    await percent(page, "Mariana").fill(b.replace("%", ""));
    await page.getByRole("button", { name: "Salvar regra" }).click();
  },
);

Then("vê a regra em modo somente leitura", async ({ page }) => {
  await expect(page.getByText(/modo somente leitura/)).toBeVisible();
  await expect(page.getByRole("radio", { name: /Dividir igualmente/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Salvar regra" })).toHaveCount(0);
});
