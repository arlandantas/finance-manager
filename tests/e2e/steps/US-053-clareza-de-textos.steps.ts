import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { addExpense, family, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const eye = (page: Page) => page.getByTestId("hide-values-toggle");
const sw = (page: Page) => page.getByRole("switch", { name: "Acerto de contas entre membros" });

async function openFilters(page: Page) {
  const b = page.getByRole("button", { name: "Filtros" });
  if (await b.isVisible()) await b.click();
}

async function as(world: World, page: Page, who: "Mariana" | "Lucas") {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
}
const setEnabled = (world: World, settlementEnabled: boolean) =>
  db.family.update({
    where: { id: family(world).family.id },
    data: { settlementEnabled, version: { increment: 1 } },
  });

Given(
  "a família da clareza de textos com Mariana Administradora e Lucas Membro",
  async ({ world }) => {
    await setupCouple(world);
  },
);

Given(
  "uma despesa comum {string} de {string} e uma {string} de {string}",
  async ({ world }, nome: string, v1: string, _so: string, v2: string) => {
    await addExpense(world, "Mariana", v1, {
      shared: true,
      category: "Supermercado",
    });
    await addExpense(world, "Lucas", v2, { shared: false, category: "Saúde" });
    world.data.mercado = nome;
  },
);
Given("que o acerto foi desligado sem alterar as despesas", async ({ world }) => {
  await setEnabled(world, false);
});
Given("que o acerto foi religado", async ({ world }) => {
  await setEnabled(world, true);
});

When("Lucas abre o Extrato da clareza", async ({ world, page }) => {
  await as(world, page, "Lucas");
  await gotoReady(page, "/extrato?period=2026-10");
  await expect(page.getByRole("heading", { name: "Extrato" })).toBeVisible();
});
Then("nenhuma linha mostra {string} nem {string}", async ({ page }, a: string, b: string) => {
  const rows = page.getByTestId("ledger-row");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  await expect(rows.filter({ hasText: a })).toHaveCount(0);
  await expect(rows.filter({ hasText: b })).toHaveCount(0);
});
Then("as linhas mostram os selos {string} e {string}", async ({ page }, a: string, b: string) => {
  const rows = page.getByTestId("ledger-row");
  await expect(rows.first()).toBeVisible({ timeout: 15_000 });
  await expect(rows.filter({ hasText: a }).first()).toBeVisible();
  await expect(rows.filter({ hasText: b }).first()).toBeVisible();
});
Then("o filtro {string} não existe", async ({ page }, _n: string) => {
  await openFilters(page);
  await expect(page.getByLabel("Divisão")).toHaveCount(0);
});
Then("o filtro {string} existe", async ({ page }, _n: string) => {
  await openFilters(page);
  await expect(page.getByLabel("Divisão").first()).toBeVisible();
});

When("Mariana desliga e religa o acerto pela tela da família", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/familia");
  await sw(page).click();
  await expect(sw(page)).toHaveAttribute("aria-checked", "false");
  await sw(page).click();
  await expect(sw(page)).toHaveAttribute("aria-checked", "true");
  await gotoReady(page, "/familia");
});
Then("a atividade recente mostra {string}", async ({ page }, t: string) => {
  await expect(page.getByTestId("family-event").filter({ hasText: t }).first()).toBeVisible();
});
Given("um evento antigo de acerto sem a informação de ligar ou desligar", async ({ world }) => {
  await db.familyEvent.create({
    data: {
      familyId: family(world).family.id,
      type: "SETTLEMENT_TOGGLED",
      actorMemberId: family(world).byName.Mariana?.memberId as string,
      changes: {},
    },
  });
});
When("Mariana abre a tela da família da clareza", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/familia");
});

When("Lucas abre a regra de divisão", async ({ world, page }) => {
  await as(world, page, "Lucas");
  await gotoReady(page, "/acerto/regra");
});
When("Mariana abre a regra de divisão", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/acerto/regra");
});
Then("vê {string} e os percentuais vigentes", async ({ page }, t: string) => {
  await expect(page.getByText(t)).toBeVisible();
  await expect(page.getByTestId("rule-readonly")).toContainText("50%");
});
Then("não vê {string} nem campos nem {string}", async ({ page }, a: string, b: string) => {
  await expect(page.getByText(a)).toHaveCount(0);
  await expect(page.getByRole("button", { name: b })).toHaveCount(0);
  await expect(page.getByRole("radio")).toHaveCount(0);
  await expect(page.getByRole("textbox")).toHaveCount(0);
  await expect(page.getByTestId("rule-preview")).toHaveCount(0);
});
Then("vê {string} e o botão {string}", async ({ page }, t: string, b: string) => {
  await expect(page.getByText(t)).toBeVisible();
  await expect(page.getByRole("button", { name: b })).toBeVisible();
});

Then("o olho tem a dica {string}", async ({ page }, d: string) => {
  await expect(eye(page)).toHaveAttribute("title", d);
});
When("Lucas toca no olho da clareza", async ({ page }) => {
  await page.waitForLoadState("networkidle");
  await eye(page).click();
});

Given("que Mariana mostrou os valores neste aparelho e saiu", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/contas");
  await page.waitForLoadState("networkidle");
  await eye(page).click();
  await expect(eye(page)).toHaveAttribute("aria-label", "Valores visíveis");
  await page.context().clearCookies();
});
When("Lucas entra neste aparelho", async ({ world, page }) => {
  await as(world, page, "Lucas");
  await gotoReady(page, "/contas");
});
When("Mariana entra de novo neste aparelho", async ({ world, page }) => {
  await page.context().clearCookies();
  await as(world, page, "Mariana");
  await gotoReady(page, "/contas");
});
Then("os valores da clareza aparecem como {string}", async ({ page }, m: string) => {
  await expect(page.getByTestId("total-balance")).toContainText(m);
});
Then("os valores da clareza aparecem visíveis", async ({ page }) => {
  await expect(eye(page)).toHaveAttribute("aria-label", "Valores visíveis");
  await expect(page.getByTestId("total-balance")).toContainText(/R\$\s?\d/);
});
