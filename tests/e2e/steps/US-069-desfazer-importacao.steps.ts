import { expect } from "@playwright/test";
import { testDb } from "../../support/db";
import { Then, When } from "../support/fixtures";

const db = testDb();

Then("vê o selo {string} em {int} compras", async ({ page }, texto: string, n: number) => {
  const badges = page.getByTestId("invoice-import-badge");
  await expect(badges).toHaveCount(n);
  await expect(badges.first()).toHaveText(texto);
});

Then(
  "a seção {string} lista {int} importação com {string}",
  async ({ page }, secao: string, n: number, texto: string) => {
    const section = page.getByRole("region", { name: secao });
    await expect(section.getByTestId("import-batch")).toHaveCount(n);
    await expect(section.getByTestId("import-batch")).toContainText(texto);
  },
);

When("desfaz a importação e confirma", async ({ page }) => {
  await page.getByTestId("revert-batch").click();
  await page.getByTestId("confirm-revert").click();
});

Then("a importação aparece como {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("batch-reverted")).toContainText(texto);
  await expect(page.getByTestId("revert-batch")).toHaveCount(0);
});

Then("nenhuma compra importada segue ativa", async () => {
  expect(await db.transaction.count({ where: { origin: "INVOICE_IMPORT", deletedAt: null } })).toBe(
    0,
  );
  expect(await db.transaction.count({ where: { origin: "INVOICE_IMPORT" } })).toBe(2);
});
