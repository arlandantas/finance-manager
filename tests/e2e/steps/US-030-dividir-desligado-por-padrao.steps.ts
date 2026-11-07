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
const rule = (page: Page) => drawer(page).getByRole("radio", { name: /^Pela regra da família/ });
const radio = (page: Page, name: string | RegExp) =>
  page.getByRole("dialog").getByRole("radio", { name });

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

Then("o seletor {string} marca {string}", async ({ page }, grupo: string, opcao: string) => {
  const d = page.getByRole("dialog");
  await expect(
    d.getByRole("radiogroup", { name: grupo }).getByRole("radio", { name: opcao }),
  ).toBeChecked();
});

When(
  "Lucas lança {string} em {string} sem tocar no seletor",
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
  "Lucas escolhe {string} e salva {string} em {string}",
  async ({ page, world }, _n: string, v: string, c: string) => {
    await gotoReady(page, "/");
    await openDrawer(page);
    await fillAmount(page, v);
    await pickCategory(page, c);
    await rule(page).click();
    world.data.labelOn = await rule(page).innerText();
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);
Then("o formulário mostrou {string} ao escolher", async ({ world }, texto: string) => {
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

Given("que Lucas salvou a despesa anterior dividida pela regra", async ({ page }) => {
  await gotoReady(page, "/");
  await openDrawer(page);
  await fillAmount(page, "R$ 100,00");
  await pickCategory(page, "Supermercado");
  await rule(page).click();
  await save(page, "Salvar Despesa");
  await waitSaved(page);
});

Given('que o acerto de contas foi desligado no "Só meu"', async ({ world }) => {
  await db.family.update({
    where: { id: family(world).family.id },
    data: { settlementEnabled: false },
  });
});
Then("não vê o seletor {string}", async ({ page }, nome: string) => {
  await expect(page.getByLabel("Valor", { exact: true })).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: nome })).toHaveCount(0);
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
