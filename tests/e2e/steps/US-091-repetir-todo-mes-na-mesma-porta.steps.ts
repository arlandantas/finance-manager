import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { Then, When } from "../support/fixtures";
import { drawer, fillAmount } from "../support/lancamento";
import { openPrevistasOf, payableItem } from "../support/previstas";

const db = testDb();

async function fillSeries(page: Page, desc: string, valor: string) {
  await drawer(page)
    .getByLabel(/^Descrição/)
    .fill(desc);
  await fillAmount(page, valor);
  await page.getByRole("radio", { name: "Contas e serviços", exact: true }).click();
}
const repetir = (page: Page) =>
  drawer(page).getByRole("radiogroup", { name: "Repetir", exact: true });

When(
  'Mariana informa {string} de {string}, dia {int}, "Pagar com: Corrente" e repete todo mês sem fim',
  async ({ page }, desc: string, valor: string, dia: number) => {
    await fillSeries(page, desc, valor);
    const select = drawer(page).getByLabel("Pagar com", { exact: true });
    const value = await select
      .locator("option", { hasText: "Corrente" })
      .first()
      .getAttribute("value");
    await select.selectOption(value as string);
    await repetir(page).getByRole("radio", { name: "Todo mês", exact: true }).click();
    await drawer(page).getByLabel("Dia do mês", { exact: true }).fill(String(dia));
    await drawer(page).getByRole("radio", { name: "Sem fim", exact: true }).click();
    expect(parseBRL(valor)).toBeGreaterThan(0);
  },
);

Then('a série {string} aparece em "Previstas"', async ({ page }, desc: string) => {
  const series = await db.recurringExpense.findMany({ where: { description: desc } });
  expect(series).toHaveLength(1);
  await gotoReady(page, "/previstas");
  await expect(payableItem(page, desc)).toBeVisible();
});

Then(
  'as próximas ocorrências de {string} aparecem em "A pagar"',
  async ({ page }, desc: string) => {
    expect(await db.plannedExpense.count({ where: { description: desc, deletedAt: null } })).toBe(
      12,
    );
    await openPrevistasOf(page, "2026-11");
    await expect(payableItem(page, desc)).toBeVisible();
  },
);

When(
  'Mariana ativa "Repetir: Todo mês" com {string} e {string}',
  async ({ page }, desc: string, valor: string) => {
    await fillSeries(page, desc, valor);
    await repetir(page).getByRole("radio", { name: "Todo mês", exact: true }).click();
  },
);

When('Mariana tenta salvar sem "Pagar com"', async ({ page }) => {
  await drawer(page).getByLabel("Pagar com", { exact: true }).selectOption("");
  await drawer(page).getByRole("button", { name: "Salvar previsão" }).click();
});

Then('a opção "Repetir" não aparece', async ({ page }) => {
  await expect(repetir(page)).toHaveCount(0);
});
