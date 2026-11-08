import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { family } from "../support/acerto";
import { Given, Then, When } from "../support/fixtures";

const sw = (page: Page, name: string) => page.getByRole("switch", { name, includeHidden: true });

Given("que a {string} foi ligada pela Administradora", async ({ world }, _recurso: string) => {
  const fx = family(world);
  await testDb().aiConsentEvent.create({
    data: {
      familyId: fx.family.id,
      purpose: "SPENDING_ANALYSIS",
      action: "ENABLED",
      textVersion: 1,
      memberId: fx.byName.Mariana?.memberId as string,
      createdAt: new Date("2026-10-04T15:00:00Z"),
    },
  });
});

Then("o interruptor {string} está desligado", async ({ page }, nome: string) => {
  await expect(sw(page, nome)).toHaveAttribute("aria-checked", "false");
});
Then("o interruptor {string} está ligado", async ({ page }, nome: string) => {
  await expect(sw(page, nome)).toHaveAttribute("aria-checked", "true");
});
Then("o interruptor {string} está desabilitado", async ({ page }, nome: string) => {
  await expect(sw(page, nome)).toBeDisabled();
});

When("toca no interruptor {string}", async ({ page }, nome: string) => {
  await sw(page, nome).click();
});

Then("vê o texto de consentimento {string}", async ({ page }, texto: string) => {
  await expect(page.getByRole("dialog")).toContainText(texto);
});

Then("vê o botão {string}", async ({ page }, nome: string) => {
  await expect(page.getByRole("button", { name: nome })).toBeVisible();
});

When("fecha o diálogo sem confirmar", async ({ page }) => {
  await page.getByRole("button", { name: "Cancelar" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

When("expande {string}", async ({ page }, nome: string) => {
  await page.getByRole("button", { name: nome }).click();
});

When("toca em {string}", async ({ page }, nome: string) => {
  await page.getByRole("dialog").getByRole("button", { name: nome, exact: true }).click();
});

Then("vê o registro {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("ai-last-change")).toHaveText(texto);
});

Then("vê o aviso de IA {string}", async ({ page }, texto: string) => {
  // Há um cartão por finalidade de IA, e cada um repete o aviso: basta o primeiro.
  await expect(page.getByTestId("ai-feature").getByText(texto).first()).toBeVisible();
});
