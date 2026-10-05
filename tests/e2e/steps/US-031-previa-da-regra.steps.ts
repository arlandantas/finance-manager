import { expect, type Page } from "@playwright/test";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { addExpense, setupCouple } from "../support/acerto";
import { Given, Then, When } from "../support/fixtures";
import { setToday } from "../support/world";

const pct = (page: Page, nome: string) => page.getByLabel(`Percentual de ${nome}`, { exact: true });

Given(
  /^a família da prévia com Mariana Administradora e Lucas e hoje (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, d: string, m: string, y: string) => {
    await setupCouple(world);
    await setToday(`${y}-${m}-${d}`);
  },
);
Given(
  /^uma despesa comum da prévia de "([^"]+)" paga por Lucas em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, v: string, d: string, m: string, y: string) => {
    await addExpense(world, "Lucas", v, { occurredOn: `${y}-${m}-${d}` });
  },
);
Given("a tela de regra em 375 px", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
});

async function openRule(page: Page) {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  await gotoReady(page, "/acerto/regra");
}

When(
  "Mariana informa os percentuais {string} e {string} sem salvar",
  async ({ page }, m: string, l: string) => {
    if (!/\/acerto\/regra/.test(page.url())) await openRule(page);
    await page.getByRole("radio", { name: "Proporcional" }).check();
    await pct(page, "Mariana").fill(m);
    await pct(page, "Lucas").fill(l);
  },
);
Then("a prévia mostra {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("rule-preview")).toContainText(texto.replace(/R\$ /g, "R$ "));
});

When("Mariana sugere pela renda {string} e {string}", async ({ page }, a: string, b: string) => {
  await openRule(page);
  await page.getByText("Sugerir pela renda").first().click();
  await page.getByLabel("Renda de Mariana").fill(a);
  await page.getByLabel("Renda de Lucas").fill(b);
  await page.getByRole("button", { name: "Sugerir pela renda" }).click();
});
Then("os percentuais ficam {string} e {string}", async ({ page }, m: string, l: string) => {
  await expect(pct(page, "Mariana")).toHaveValue(m);
  await expect(pct(page, "Lucas")).toHaveValue(l);
});
Then("vê a nota {string}", async ({ page }, n: string) => {
  await expect(page.getByText(n)).toBeVisible();
});
Then(
  "vê o erro {string} e o botão {string} desabilitado",
  async ({ page }, msg: string, botao: string) => {
    await expect(page.getByRole("alert").filter({ hasText: msg })).toBeVisible();
    await expect(page.getByRole("button", { name: botao })).toBeDisabled();
  },
);
Then(
  "o botão {string} não aparece e {string} está visível",
  async ({ page }, fab: string, salvar: string) => {
    await expect(page.getByRole("button", { name: fab })).toHaveCount(0);
    const b = page.getByRole("button", { name: salvar });
    await b.scrollIntoViewIfNeeded();
    await expect(b).toBeInViewport();
  },
);
When("Mariana salva a regra", async ({ page }) => {
  await page.getByRole("button", { name: "Salvar regra" }).click();
});
Then("volta ao painel de Acerto com o aviso {string}", async ({ page }, aviso: string) => {
  await expect(page).toHaveURL(/\/acerto$/);
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: aviso })).toBeVisible();
});
