import { expect } from "@playwright/test";
import { Then, When } from "../support/fixtures";

const detail = (page: import("@playwright/test").Page) =>
  page.getByRole("dialog", { name: /Detalhe do lançamento|Editar lançamento/ });

When("Lucas toca em {string} no detalhe da parcela", async ({ page }, botao: string) => {
  await detail(page).getByRole("button", { name: botao, exact: true }).click();
});

Then(
  "o alcance {string} está marcado e {string} está disponível",
  async ({ page }, marcado: string, outro: string) => {
    await expect(page.getByRole("radio", { name: marcado })).toBeChecked();
    await expect(page.getByRole("radio", { name: outro })).not.toBeChecked();
  },
);

When("Lucas troca o valor da parcela para {string} e salva", async ({ page }, valor: string) => {
  const input = page.getByLabel("Valor da parcela");
  await input.click();
  await input.fill(valor);
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Parcela atualizada")).toBeVisible();
});

When("Lucas confirma a exclusão da parcela", async ({ page }) => {
  await page
    .getByRole("dialog", { name: "Excluir parcela?" })
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(page.getByText("Parcela excluída", { exact: true })).toBeVisible();
});

When("Lucas desfaz a exclusão da parcela pelo aviso", async ({ page }) => {
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("Lançamento restaurado")).toBeVisible();
});

Then("o detalhe da parcela mostra {string}", async ({ page }, texto: string) => {
  await expect(detail(page).getByText(texto, { exact: true })).toBeVisible();
});
