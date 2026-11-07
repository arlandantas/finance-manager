import { expect, type Page } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { enterAs, openPanel } from "../support/acerto";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();
const dlg = (page: Page) => page.getByRole("dialog", { name: "Nova assinatura" });
const block = (page: Page) => page.getByRole("region", { name: "Assinaturas do cartão" });
const sw = (page: Page) => dlg(page).getByRole("switch", { name: /Dividir com a família/ });

Then("o interruptor da assinatura mostra {string}", async ({ page }, rotulo: string) => {
  await expect(dlg(page).getByTestId("split-label")).toHaveText(rotulo);
});

When("Lucas liga {string} na assinatura", async ({ page }, _nome: string) => {
  await sw(page).click();
  await expect(sw(page)).toHaveAttribute("aria-checked", "true");
});

When("Lucas abre o formulário de nova assinatura", async ({ page }) => {
  await block(page).getByRole("button", { name: "Nova assinatura" }).click();
  await expect(dlg(page)).toBeVisible();
});

Given(
  "a assinatura dividida {string} de {string} no dia {int} cadastrada pela tela do cartão",
  async ({ page, world }, nome: string, valor: string, dia: number) => {
    await enterAs(world, page, "Lucas");
    const card = await db.creditCard.findFirstOrThrow({
      where: { familyId: world.family?.family.id },
    });
    await gotoReady(page, `/cartoes/${card.id}`);
    await block(page).getByRole("button", { name: "Nova assinatura" }).click();
    const d = dlg(page);
    await d.getByLabel("Descrição", { exact: true }).fill(nome);
    await d.getByLabel("Valor", { exact: true }).fill(valor);
    await d.getByLabel("Categoria", { exact: true }).selectOption({ label: "Moradia" });
    await d.getByLabel("Dia da cobrança", { exact: true }).fill(String(dia));
    await sw(page).click();
    await d.getByRole("button", { name: "Salvar assinatura" }).click();
    await expect(d).toHaveCount(0);
  },
);

Given("que o acerto da família está desligado", async ({ world }) => {
  await db.family.update({
    where: { id: world.family?.family.id as string },
    data: { settlementEnabled: false, version: 2 },
  });
});

When(
  /^(Lucas|Mariana) abre o painel de acerto de novembro de 2026$/,
  async ({ page, world }, user) => {
    await openPanel(world, page, user as "Lucas" | "Mariana", "2026-11");
  },
);

Then(
  "o acerto de novembro mostra o total {string} e as cotas {string} e {string}",
  async ({ page }, total: string, a: string, b: string) => {
    await expect(page.getByTestId("settlement-total")).toContainText(normalizeSpaces(total));
    const quotas = (await page.getByTestId("quota").allInnerTexts()).map(normalizeSpaces).sort();
    expect(quotas).toEqual([normalizeSpaces(a), normalizeSpaces(b)].sort());
  },
);

Then("o formulário da assinatura não oferece {string}", async ({ page }, nome: string) => {
  await expect(dlg(page).getByLabel("Descrição", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: new RegExp(nome) })).toHaveCount(0);
});

Then("o formulário da assinatura tem o interruptor sem rolagem horizontal", async ({ page }) => {
  await expect(sw(page)).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(overflow).toBe(false);
});
