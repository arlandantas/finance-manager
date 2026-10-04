import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";
import {
  balanceOnScreen,
  drawer,
  ensureWorld,
  fillAmount,
  lastTransaction,
  openDrawer,
  pickCategory,
  save,
  waitSaved,
} from "../support/lancamento";

const db = testDb();

Given("a conta {string} com saldo {string}", async ({ world }, conta: string, saldo: string) => {
  world.family = await makeFamily();
  await makeAccount(world.family, {
    name: conta,
    owner: "Mariana",
    openingBalanceInCents: parseBRL(saldo) ?? 0,
  });
});

When(
  "Mariana alterna para {string}, digita {string}, escolhe {string} e salva",
  async ({ page, world }, modo: string, valor: string, categoria: string) => {
    await ensureWorld(world, page, "Mariana", {
      name: "Itaú Mariana",
      owner: "Mariana",
      balance: 150000,
    });
    await gotoReady(page, "/");
    await openDrawer(page);
    await page.getByRole("button", { name: modo, exact: true }).click();
    await fillAmount(page, valor);
    await pickCategory(page, categoria);
    await save(page, "Salvar Receita");
    await waitSaved(page);
  },
);

Then("a receita é registrada com autor e responsável {string}", async ({}, nome: string) => {
  const { row, name } = await lastTransaction("INCOME");
  expect(name(row.authorMemberId)).toBe(nome);
  expect(name(row.payerMemberId)).toBe(nome);
  expect(row.isSharedExpense).toBe(false);
});

When(
  "Lucas lança {string} em {string} com {string}",
  async ({ page, world }, valor: string, categoria: string, escolha: string) => {
    await ensureWorld(world, page, "Lucas");
    await gotoReady(page, "/");
    await openDrawer(page);
    await page.getByRole("button", { name: "Nova Receita", exact: true }).click();
    await fillAmount(page, valor);
    await pickCategory(page, categoria);
    await page.getByRole("radio", { name: escolha.split(": ")[1] as string, exact: true }).click();
    await save(page, "Salvar Receita");
    await waitSaved(page);
  },
);

Then(
  "o autor é {string} e o responsável pelo recebimento é {string}",
  async ({}, autor: string, responsavel: string) => {
    const { row, name } = await lastTransaction("INCOME");
    expect(name(row.authorMemberId)).toBe(autor);
    expect(name(row.payerMemberId)).toBe(responsavel);
  },
);

When("abro o lançamento no modo {string}", async ({ page, world }, modo: string) => {
  await ensureWorld(world, page, "Lucas");
  await gotoReady(page, "/");
  await openDrawer(page);
  await page.getByRole("button", { name: modo, exact: true }).click();
});

Then("o switch {string} não é exibido", async ({ page }, rotulo: string) => {
  await expect(drawer(page).getByRole("switch", { name: rotulo })).toHaveCount(0);
});

Then("as categorias exibidas são as de receita", async ({ page }) => {
  const radios = drawer(page).getByRole("radiogroup", { name: "Categoria" }).getByRole("radio");
  await expect(radios).toHaveText(["Salário", "Rendimentos", "Outras receitas"]);
});

When("tento salvar a receita com {string}", async ({ page, world }, valor: string) => {
  await ensureWorld(world, page, "Lucas");
  await gotoReady(page, "/");
  await openDrawer(page);
  await page.getByRole("button", { name: "Nova Receita", exact: true }).click();
  await fillAmount(page, valor);
  await pickCategory(page, "Salário");
  await save(page, "Salvar Receita");
});

When("toco duas vezes em {string}", async ({ page, world }, botao: string) => {
  await ensureWorld(world, page, "Lucas");
  await gotoReady(page, "/");
  await openDrawer(page);
  await page.getByRole("button", { name: "Nova Receita", exact: true }).click();
  await fillAmount(page, "R$ 100,00");
  await pickCategory(page, "Salário");
  await drawer(page).getByRole("button", { name: botao }).dblclick();
  await waitSaved(page);
});

Then("apenas uma receita é registrada", async ({ page }) => {
  expect(await db.transaction.count({ where: { kind: "INCOME" } })).toBe(1);
  expect(await balanceOnScreen(page, "Nubank Conjunta")).toContain(normalizeSpaces("R$ 1.100,00"));
});
