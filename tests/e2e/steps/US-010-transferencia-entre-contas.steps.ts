import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import {
  type AccountFixture,
  makeAccount,
  makeFamily,
  makeTransfer,
} from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();

type Accounts = { itau: AccountFixture; nubank: AccountFixture };
const accountsOf = (world: World) => world.data.transferAccounts as Accounts;

async function setup(
  world: World,
  itauName: string,
  itauBalance: string,
  nubankName: string,
  nubankBalance: string,
) {
  world.family = await makeFamily();
  const itau = await makeAccount(world.family, {
    name: itauName,
    owner: "Lucas",
    openingBalanceInCents: parseBRL(itauBalance) ?? 0,
  });
  const nubank = await makeAccount(world.family, {
    name: nubankName,
    owner: "Mariana",
    openingBalanceInCents: parseBRL(nubankBalance) ?? 0,
  });
  world.data.transferAccounts = { itau, nubank } satisfies Accounts;
}

async function openContas(world: World, page: Page) {
  if (world.data.loggedAs !== "Lucas") {
    await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
    world.data.loggedAs = "Lucas";
  }
  await gotoReady(page, "/contas");
  await expect(page.getByTestId("account-card").first()).toBeVisible();
}

const dialog = (page: Page) => page.getByRole("dialog", { name: "Transferir" });

async function openTransfer(world: World, page: Page) {
  await openContas(world, page);
  await page.getByRole("button", { name: "Transferir" }).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page).getByLabel("Valor")).toBeFocused();
}

async function fillTransfer(page: Page, o: { valor?: string; origem?: string; destino?: string }) {
  const d = dialog(page);
  if (o.origem) await d.getByLabel("Conta de origem").selectOption({ label: o.origem });
  if (o.destino) await d.getByLabel("Conta de destino").selectOption({ label: o.destino });
  if (o.valor) await d.getByLabel("Valor", { exact: true }).fill(o.valor);
}

const card = (page: Page, nome: string) =>
  page.getByTestId("account-card").filter({ hasText: nome });

Given(
  "{string} com {string} e {string} com {string}",
  async ({ world }, a: string, av: string, b: string, bv: string) => {
    await setup(world, a, av, b, bv);
  },
);

Given(
  "{string} com {string} e {string} com {string} e uma transferência de {string} entre elas",
  async ({ world }, a: string, av: string, b: string, bv: string, valor: string) => {
    await setup(world, a, av, b, bv);
    const { itau, nubank } = accountsOf(world);
    await makeTransfer(world.family as never, {
      from: itau,
      to: nubank,
      amountInCents: parseBRL(valor) ?? 0,
      occurredOn: "2026-10-03",
    });
  },
);

Given("{string} com {string}", async ({ world }, a: string, av: string) => {
  await setup(world, a, av, "Nubank Conjunta", "R$ 500,00");
});

When(
  "Lucas transfere {string} de {string} para {string}",
  async ({ world, page }, valor: string, origem: string, destino: string) => {
    await openTransfer(world, page);
    await fillTransfer(page, { valor, origem, destino });
    await dialog(page).getByRole("button", { name: "Confirmar transferência" }).click();
    await expect(dialog(page)).toBeHidden();
  },
);

Then(
  "{string} fica com {string} e {string} com {string}",
  async ({ page }, a: string, av: string, b: string, bv: string) => {
    await expect(card(page, a)).toContainText(av.replace(" ", " "));
    await expect(card(page, b)).toContainText(bv.replace(" ", " "));
  },
);

Then("o saldo consolidado da família permanece {string}", async ({ page }, total: string) => {
  await expect(page.getByTestId("total-balance")).toContainText(total.replace(" ", " "));
});

When("abro o extrato após a transferência", async ({ world, page }) => {
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  world.data.loggedAs = "Lucas";
  await gotoReady(page, "/extrato");
  await expect(page.getByTestId("ledger-row").first()).toBeVisible();
});

Then(
  "vejo uma linha de saída em {string} e uma de entrada em {string}",
  async ({ page }, saida: string, entrada: string) => {
    const rows = page.getByTestId("ledger-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.filter({ hasText: `Transferência para ${entrada}` })).toContainText(saida);
    await expect(rows.filter({ hasText: `Transferência de ${saida}` })).toContainText(entrada);
  },
);

Then("ambas indicam que fazem parte da mesma transferência", async ({ page }) => {
  await expect(page.getByText("Mesma transferência")).toHaveCount(2);
});

When("consulto os totais de despesas e receitas do mês", async ({ world, page }) => {
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  world.data.loggedAs = "Lucas";
  await gotoReady(page, "/extrato");
  await expect(page.getByTestId("totals-income")).toBeVisible();
});

Then("a transferência não é contabilizada em nenhum deles", async ({ page }) => {
  await expect(page.getByTestId("totals-income")).toHaveText(/R\$\s0,00/);
  await expect(page.getByTestId("totals-expense")).toHaveText(/R\$\s0,00/);
});

Then("não aparece no cálculo do acerto de contas", async ({ page }) => {
  await gotoReady(page, "/acerto");
  await expect(page.getByTestId("settlement-total")).toContainText("R$ 0,00");
  await expect(page.getByTestId("settlement-hero")).toHaveAttribute("data-status", "EMPTY");
});

When("escolho a mesma conta nos dois campos", async ({ world, page }) => {
  await openTransfer(world, page);
  await fillTransfer(page, { valor: "R$ 100,00", origem: "Itaú Lucas", destino: "Itaú Lucas" });
  await dialog(page).getByRole("button", { name: "Confirmar transferência" }).click();
});

Then("vejo {string} e nada é registrado", async ({ page }, mensagem: string) => {
  await expect(dialog(page).getByText(mensagem, { exact: true })).toBeVisible();
  expect(await db.transferGroup.count()).toBe(0);
  expect(
    await db.transaction.count({ where: { kind: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } }),
  ).toBe(0);
});

When("informo {string} como valor da transferência", async ({ world, page }, valor: string) => {
  await openTransfer(world, page);
  await fillTransfer(page, { valor });
  await dialog(page).getByRole("button", { name: "Confirmar transferência" }).click();
});

When(
  "transfiro {string} para {string}",
  async ({ world, page }, valor: string, destino: string) => {
    await openTransfer(world, page);
    await fillTransfer(page, { valor, origem: "Itaú Lucas", destino });
  },
);

Then("vejo o aviso {string} e posso confirmar", async ({ page }, aviso: string) => {
  await expect(dialog(page).getByText(aviso)).toBeVisible();
  await expect(dialog(page).getByRole("button", { name: "Confirmar mesmo assim" })).toBeVisible();
});

Then(
  "após confirmar, {string} fica com {string}",
  async ({ page }, conta: string, saldo: string) => {
    await dialog(page).getByRole("button", { name: "Confirmar mesmo assim" }).click();
    await expect(dialog(page)).toBeHidden();
    await expect(card(page, conta)).toContainText(normalizeSpaces(saldo).replace(" ", " "));
  },
);

When(
  "preencho a transferência e toco duas vezes em {string}",
  async ({ world, page }, botao: string) => {
    await openTransfer(world, page);
    await fillTransfer(page, {
      valor: "R$ 1.000,00",
      origem: "Itaú Lucas",
      destino: "Nubank Conjunta",
    });
    await dialog(page).getByRole("button", { name: botao }).dblclick();
    await expect(dialog(page)).toBeHidden();
  },
);

Then("apenas uma transferência é registrada", async () => {
  expect(await db.transferGroup.count()).toBe(1);
  expect(
    await db.transaction.count({ where: { kind: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } }),
  ).toBe(2);
});

Given("uma família com apenas uma conta", async ({ world }) => {
  world.family = await makeFamily();
  await makeAccount(world.family, {
    name: "Itaú Lucas",
    owner: "Lucas",
    openingBalanceInCents: 100000,
  });
});

When("tento iniciar uma transferência", async ({ world, page }) => {
  await openContas(world, page);
  await page.getByRole("button", { name: "Transferir" }).click();
});

Then("sou orientado a cadastrar outra conta", async ({ page }) => {
  const d = page.getByRole("dialog", { name: "Cadastre outra conta para transferir" });
  await expect(d).toBeVisible();
  await d.getByRole("button", { name: "Nova conta" }).click();
  await expect(page.getByRole("dialog", { name: "Nova conta" })).toBeVisible();
});
