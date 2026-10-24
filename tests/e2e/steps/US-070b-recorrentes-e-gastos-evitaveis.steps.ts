import { expect } from "@playwright/test";
import { Then, When } from "../support/fixtures";

const card = (page: import("@playwright/test").Page, nome: string) =>
  page.getByTestId("avoidable-card").filter({ has: page.getByRole("heading", { name: nome }) });

Then(
  "vê o gasto evitável {string} com {string}",
  async ({ page }, nome: string, valores: string) => {
    await expect(card(page, nome).getByTestId("avoidable-values")).toHaveText(valores);
  },
);

Then("o que será enviado lista um valor recorrente sem o nome", async ({ page }) => {
  await expect(page.getByTestId("sent-preview")).toContainText("Recorrente");
});

Then("o que será enviado não contém {string}", async ({ page }, texto: string) => {
  await page.getByRole("button", { name: "Ver o JSON exato" }).click();
  await expect(page.getByTestId("sent-preview")).not.toContainText(texto);
  await expect(page.getByTestId("sent-json")).toBeVisible();
});

When("abre {string} do gasto evitável {string}", async ({ page }, link: string, nome: string) => {
  await card(page, nome).getByRole("link", { name: link }).click();
});

Then("o Extrato mostra o lançamento {string}", async ({ page }, texto: string) => {
  await expect(page).toHaveURL(/\/extrato\?/);
  await expect(page.getByText(texto, { exact: true }).first()).toBeVisible();
});
