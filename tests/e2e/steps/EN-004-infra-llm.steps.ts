import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { aiMonthKey } from "@/modules/ia/month";
import { testDb } from "../../support/db";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { family } from "../support/acerto";
import { Given, Then, When } from "../support/fixtures";

// O relógio do E2E é fixo em 04/10/2026 (playwright.config.ts).
const E2E_NOW = new Date("2026-10-04T15:00:00Z");

Given("o teto mensal de IA da família de {string}", async ({ world }, valor: string) => {
  await testDb().family.update({
    where: { id: family(world).family.id },
    data: { aiMonthlyCapCents: parseBRL(valor) ?? 0 },
  });
});

Given("o provedor de LLM em modo simulado", async () => {
  // padrão do app: LLM_PROVIDER=fake (nenhuma chave nem rede nos testes)
});

Given("que o consumo de IA do mês da família é {string}", async ({ world }, valor: string) => {
  const micro = (parseBRL(valor) ?? 0) * 10_000;
  await testDb().$executeRaw`INSERT INTO llm_budget_months ("familyId", month, "spentMicroBrl")
    VALUES (${family(world).family.id}::uuid, ${aiMonthKey(E2E_NOW)}, ${micro})
    ON CONFLICT ("familyId", month) DO UPDATE SET "spentMicroBrl" = ${micro}`;
});

async function openIa(
  world: { data: Record<string, unknown> },
  page: import("@playwright/test").Page,
  who: "Mariana" | "Lucas",
) {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
  await gotoReady(page, "/familia");
  await page.getByTestId("ai-settings-link").click();
  await expect(page.getByRole("heading", { name: "IA e privacidade" })).toBeVisible();
}

When(
  "a Administradora abre {string} e {string}",
  async ({ world, page }, _a: string, _b: string) => {
    await openIa(world, page, "Mariana");
  },
);
When("o Membro abre {string} e {string}", async ({ world, page }, _a: string, _b: string) => {
  await openIa(world, page, "Lucas");
});

Then("não vê o bloco {string} nem o valor do teto", async ({ page }, titulo: string) => {
  await expect(page.getByRole("heading", { name: titulo })).toHaveCount(0);
  await expect(page.getByTestId("ai-usage")).toHaveCount(0);
  await expect(page.locator("main")).not.toContainText("R$ 10,00");
});

Then("em nenhuma tela aparece a chave da API", async ({ page }) => {
  const html = await page.content();
  expect(html).not.toMatch(/sk-ant|ANTHROPIC_API_KEY|apiKey/i);
});
