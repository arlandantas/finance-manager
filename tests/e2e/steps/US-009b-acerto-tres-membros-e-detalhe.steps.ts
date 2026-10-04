import { expect } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { addExpense, family, setupCouple } from "../support/acerto";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();

Given(
  "três membros e regra igualitária com total comum de {string} pago só por Mariana",
  async ({ world }, valor: string) => {
    await setupCouple(world);
    const user = await db.user.create({
      data: { email: "xavier@exemplo.com", name: "Xavier Silva" },
    });
    await db.member.create({
      data: {
        familyId: family(world).family.id,
        userId: user.id,
        role: "MEMBER",
        joinedAt: new Date("2026-03-01T12:00:00Z"),
      },
    });
    await addExpense(world, "Mariana", valor);
  },
);

Then("a cota de cada um é {string}", async ({ page }, valor: string) => {
  const quotas = (await page.getByTestId("quota").allInnerTexts()).map(normalizeSpaces);
  expect(quotas).toEqual([valor, valor, valor]);
});

Then(
  "as sugestões são duas transferências de {string} para Mariana",
  async ({ page }, valor: string) => {
    const hero = page.getByTestId("settlement-hero");
    await expect(hero).toContainText(`Lucas deve ${valor} para Mariana`);
    const others = page.getByTestId("settlement-suggestions").getByRole("listitem");
    await expect(others).toHaveCount(1);
    await expect(others.first()).toContainText(`Xavier deve ${valor} para Mariana`);
  },
);

Given(
  "despesas comuns de {string} por Mariana e {string} por Lucas",
  async ({ world }, m: string, l: string) => {
    await setupCouple(world);
    await addExpense(world, "Mariana", m);
    await addExpense(world, "Lucas", l);
  },
);

When("expando {string}", async ({ page }, titulo: string) => {
  await page.getByText(titulo, { exact: true }).click();
});

Then("vejo a lista com quem pagou e valor, cuja soma é o total comum", async ({ page }) => {
  const items = page.getByTestId("shared-expense");
  await expect(items).toHaveCount(2);
  await expect(items.filter({ hasText: "pago por Mariana" })).toContainText("R$ 600,00");
  await expect(items.filter({ hasText: "pago por Lucas" })).toContainText("R$ 300,00");
  await expect(page.getByTestId("shared-expenses-total")).toContainText("R$ 900,00");
  await expect(page.getByTestId("settlement-total")).toContainText("R$ 900,00");
});
