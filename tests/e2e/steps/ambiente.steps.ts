import { expect } from "@playwright/test";
import { createBdd } from "playwright-bdd";

const { Given, Then } = createBdd();

Given("que abro a página inicial", async ({ page }) => {
  await page.goto("/");
});

Then("vejo o título {string}", async ({ page }, titulo: string) => {
  await expect(page.getByRole("heading", { name: titulo })).toBeVisible();
});

Then("o endpoint de saúde informa banco acessível", async ({ request }) => {
  const res = await request.get("/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ status: "ok", checks: { database: "up" } });
});
