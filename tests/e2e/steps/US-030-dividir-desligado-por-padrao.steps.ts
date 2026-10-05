import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { addExpense, family, openPanel, setupCouple } from "../support/acerto";
import { Given, Then, When } from "../support/fixtures";
import {
  drawer,
  fillAmount,
  openDrawer,
  pickCategory,
  save,
  waitSaved,
} from "../support/lancamento";

const db = testDb();
const sw = (page: Page) => drawer(page).getByRole("switch", { name: "Dividir com a família" });
const label = (page: Page) => drawer(page).getByTestId("split-label");

Given(
  'a família Silva do "Só meu" com a conta {string} e Lucas autenticado',
  async ({ world, page }, _conta: string) => {
    await setupCouple(world);
    await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
    world.data.loggedAs = "Lucas";
  },
);

When('Lucas abre o formulário de despesa do "Só meu"', async ({ page }) => {
  await gotoReady(page, "/");
  await openDrawer(page);
});

Then(
  "o interruptor {string} está desligado e o rótulo é {string}",
  async ({ page }, _n: string, rotulo: string) => {
    const d = page.getByRole("dialog");
    await expect(d.getByRole("switch", { name: "Dividir com a família" })).not.toBeChecked();
    await expect(d.getByTestId("split-label")).toHaveText(rotulo);
  },
);

When(
  "Lucas lança {string} em {string} sem tocar no interruptor",
  async ({ page }, v: string, c: string) => {
    await gotoReady(page, "/");
    await openDrawer(page);
    await fillAmount(page, v);
    await pickCategory(page, c);
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);

Then('a despesa mais recente fica como "Só meu" e o acerto do mês não muda', async ({ world }) => {
  const t = await db.transaction.findFirstOrThrow({
    where: { kind: "EXPENSE" },
    orderBy: { createdAt: "desc" },
  });
  expect(t.isSharedExpense).toBe(false);
  const total = await db.transaction.count({ where: { kind: "EXPENSE", isSharedExpense: true } });
  expect(total).toBe(0);
  expect(family(world).family.id).toBeTruthy();
});

When(
  "Lucas liga {string} e salva {string} em {string}",
  async ({ page, world }, _n: string, v: string, c: string) => {
    await gotoReady(page, "/");
    await openDrawer(page);
    await fillAmount(page, v);
    await pickCategory(page, c);
    await sw(page).click();
    world.data.labelOn = await label(page).innerText();
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);
Then("o formulário mostrou {string} ao ligar", async ({ world }, texto: string) => {
  expect(world.data.labelOn).toBe(texto);
});
Then(
  "a despesa entra no acerto com cota de {string} para cada membro",
  async ({ world, page }, cota: string) => {
    await openPanel(world, page, "Lucas");
    const quotas = (await page.getByTestId("quota").allInnerTexts()).map((q) => parseBRL(q));
    expect(quotas).toEqual([parseBRL(cota), parseBRL(cota)]);
  },
);

Given("que Lucas salvou a despesa anterior com o interruptor ligado", async ({ page }) => {
  await gotoReady(page, "/");
  await openDrawer(page);
  await fillAmount(page, "R$ 100,00");
  await pickCategory(page, "Supermercado");
  await sw(page).click();
  await save(page, "Salvar Despesa");
  await waitSaved(page);
});

Given('que o acerto de contas foi desligado no "Só meu"', async ({ world }) => {
  await db.family.update({
    where: { id: family(world).family.id },
    data: { settlementEnabled: false },
  });
});
Then("não vê o interruptor {string}", async ({ page }, nome: string) => {
  await expect(page.getByLabel("Valor", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: nome })).toHaveCount(0);
});

When('Lucas abre o cadastro de despesa prevista do "Só meu"', async ({ page }) => {
  await gotoReady(page, "/previstas");
  await page.getByRole("button", { name: "Nova despesa prevista" }).first().click();
  await expect(page.getByRole("dialog", { name: "Nova despesa prevista" })).toBeVisible();
});

Given(
  /^duas despesas "Só meu" de "([^"]+)" e "([^"]+)" em outubro de 2026$/,
  async ({ world }, a: string, b: string) => {
    await addExpense(world, "Lucas", a, { shared: false });
    await addExpense(world, "Mariana", b, { shared: false });
    await addExpense(world, "Mariana", "R$ 100,00", { shared: true });
  },
);
Given(
  'despesas "Só meu" ausentes e uma despesa dividida de {string} em outubro de 2026',
  async ({ world }, v: string) => {
    await addExpense(world, "Mariana", v, { shared: true });
  },
);
When('Lucas abre o painel de Acerto do "Só meu"', async ({ world, page }) => {
  await openPanel(world, page, "Lucas");
});
Then(
  'vê {string} e o link {string} filtra por "Só meu"',
  async ({ page }, texto: string, link: string) => {
    const line = page.getByTestId("personal-line");
    await expect(line).toContainText(texto.replace(/R\$ /g, "R$ "));
    await expect(line.getByRole("link", { name: link })).toHaveAttribute("href", /shared=false/);
  },
);
Then("não vê a linha {string}", async ({ page }, _t: string) => {
  await expect(page.getByTestId("settlement-hero")).toBeVisible();
  await expect(page.getByTestId("personal-line")).toHaveCount(0);
});
