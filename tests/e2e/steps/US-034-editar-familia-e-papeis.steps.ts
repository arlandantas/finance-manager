import { expect, type Page } from "@playwright/test";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const row = (p: Page, n: string) => p.getByTestId("member-row").filter({ hasText: n });

async function familia(world: World, page: Page, who: "Mariana" | "Lucas") {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
  await gotoReady(page, "/familia");
  await expect(page.getByTestId("family-title")).toBeVisible();
}

Given("a família da gestão com Mariana Administradora e Lucas Membro", async ({ world }) => {
  await setupCouple(world);
});
When(
  "Mariana altera o nome da família para {string} e salva",
  async ({ world, page }, n: string) => {
    await familia(world, page, "Mariana");
    await page.getByRole("button", { name: "Editar nome" }).click();
    const d = page.getByRole("dialog", { name: "Editar nome da família" });
    await d.getByLabel("Nome da família").fill(n);
    await d.getByRole("button", { name: "Salvar" }).click();
  },
);
Then("vê o aviso de família {string}", async ({ page }, t: string) => {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: t })).toBeVisible();
});
Then("o cabeçalho da família mostra {string}", async ({ page }, n: string) => {
  await expect(page.getByTestId("family-name")).toHaveText(n);
});
Then("vê o erro de família {string}", async ({ page }, m: string) => {
  await expect(page.getByRole("dialog").getByRole("alert").filter({ hasText: m })).toBeVisible();
});
When("Lucas abre a tela Família", async ({ world, page }) => {
  await familia(world, page, "Lucas");
});
Then("não vê o botão {string} nem ações de papel", async ({ page }, b: string) => {
  await expect(page.getByRole("button", { name: b })).toHaveCount(0);
  // o Membro só tem o menu da própria linha ("Sair da família"), sem "Alterar papel" nem "Remover"
  await expect(page.getByRole("button", { name: /^Ações de/ })).toHaveCount(1);
  await page.getByRole("button", { name: /^Ações de/ }).click();
  await expect(page.getByRole("menuitem", { name: "Alterar papel" })).toHaveCount(0);
  await expect(page.getByRole("menuitem", { name: "Remover" })).toHaveCount(0);
});
When(
  "Mariana altera o papel de {string} para {string}",
  async ({ world, page }, n: string, papel: string) => {
    if (!/\/familia/.test(page.url()) || world.data.loggedAs !== "Mariana")
      await familia(world, page, "Mariana");
    await page.getByRole("button", { name: `Ações de ${n}` }).click();
    await page.getByRole("menuitem", { name: "Alterar papel" }).click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Papel").selectOption({ label: papel });
    await d.getByRole("button", { name: "Salvar papel" }).click();
  },
);
Then("{string} aparece como {string}", async ({ page }, n: string, papel: string) => {
  await expect(row(page, n).getByTestId("member-role")).toHaveText(papel);
});
