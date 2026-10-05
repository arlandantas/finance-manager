import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { makeAccount, makeFamily, makeTransaction } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";
import {
  drawer,
  fillAmount,
  openDrawer,
  pickCategory,
  save,
  waitSaved,
} from "../support/lancamento";

Given(
  "a conta {string} da família com saldo {string}",
  async ({ world }, nome: string, saldo: string) => {
    world.family = await makeFamily();
    world.data.account = await makeAccount(world.family, {
      name: nome,
      owner: "Mariana",
      openingBalanceInCents: parseBRL(saldo) ?? 0,
    });
  },
);

When("Lucas abre o formulário de nova despesa para a descrição", async ({ page }) => {
  await openDrawer(page);
});

Then("vê o campo {string} sem abrir {string}", async ({ page }, campo: string, _mais: string) => {
  const field = drawer(page).getByLabel(campo, { exact: true });
  await expect(field).toBeVisible();
  const details = drawer(page).locator("details");
  expect(await details.evaluate((el) => (el as HTMLDetailsElement).open)).toBe(false);
});

When(
  "Lucas lança {string} em {string} com a descrição {string}",
  async ({ page }, valor: string, categoria: string, descricao: string) => {
    await openDrawer(page);
    await fillAmount(page, valor);
    await pickCategory(page, categoria);
    if (descricao !== "") await page.getByLabel("Descrição (opcional)").fill(descricao);
    else await expect(page.getByLabel("Descrição (opcional)")).toHaveValue("");
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);

When(
  "Lucas lança {string} em {string} sem tocar na descrição",
  async ({ page }, valor: string, categoria: string) => {
    await openDrawer(page);
    await fillAmount(page, valor);
    await pickCategory(page, categoria);
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);

Then("o Extrato mostra {string} como descrição da despesa", async ({ page }, texto: string) => {
  await gotoReady(page, "/extrato");
  await expect(page.getByTestId("ledger-row").first()).toContainText(texto);
});

When("Lucas preenche a descrição {string}", async ({ page }, texto: string) => {
  await page.getByLabel("Descrição (opcional)").fill(texto);
});

When("Lucas informa uma descrição com 101 caracteres", async ({ page }) => {
  await page.getByLabel("Descrição (opcional)").fill("x".repeat(101));
});

Then("vê o erro de descrição {string}", async ({ page }, msg: string) => {
  await expect(drawer(page).getByText(msg)).toBeVisible();
});

Then("o botão {string} fica desabilitado", async ({ page }, nome: string) => {
  await expect(drawer(page).getByRole("button", { name: nome })).toBeDisabled();
});

Then("o foco da descrição está no campo de valor", async ({ page }) => {
  await expect(page.getByLabel("Valor", { exact: true })).toBeFocused();
});

Given(
  /^despesas "([^"]+)" de "([^"]+)" e "([^"]+)" de "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4})$/,
  async (
    { world },
    d1: string,
    v1: string,
    d2: string,
    v2: string,
    d: string,
    m: string,
    y: string,
  ) => {
    if (!world.family || !world.data.account) throw new Error("sem conta");
    for (const [desc, v] of [
      [d1, v1],
      [d2, v2],
    ] as const) {
      await makeTransaction(world.family, {
        account: world.data.account as never,
        category: "Supermercado",
        amountInCents: parseBRL(v) ?? 0,
        occurredOn: `${y}-${m}-${d}`,
        author: "Lucas",
        description: desc,
      });
    }
  },
);

When("Lucas busca {string} no Extrato", async ({ page }, termo: string) => {
  await gotoReady(page, "/extrato");
  await expect(page.getByTestId("ledger-row")).toHaveCount(2);
  // no celular o painel de filtros abre num drawer ("Filtros"); no desktop é inline
  const toggle = page.getByRole("button", { name: /^Filtros/ });
  if (await toggle.isVisible()) await toggle.click();
  await page.getByLabel("Buscar").fill(termo);
});

Then("a lista mostra só {string} e o endereço guarda a busca", async ({ page }, desc: string) => {
  const rows = page.getByTestId("ledger-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(desc);
  await expect(page).toHaveURL(/q=bairro/);
});

Then("vê a dica {string} e a lista não é filtrada", async ({ page }, dica: string) => {
  await expect(page.getByText(dica)).toBeVisible();
  await expect(page.getByTestId("ledger-row")).toHaveCount(2);
});
