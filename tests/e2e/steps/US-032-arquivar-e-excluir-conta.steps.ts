import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import {
  makeAccount,
  makeFamily,
  makePlannedExpense,
  makeTransaction,
} from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import { openPay } from "../support/previstas";

const db = testDb();
const NB = (s: string) => s.replace(/R\$ /g, "R$ ");
const card = (page: Page, n: string) => page.getByTestId("account-card").filter({ hasText: n });
const toast = (page: Page, t: string) => page.locator("[data-sonner-toast]").filter({ hasText: t });

async function as(world: World, page: Page, who: "Mariana" | "Lucas") {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
}
async function contas(world: World, page: Page, who: "Mariana" | "Lucas" = "Mariana") {
  await as(world, page, who);
  await gotoReady(page, "/contas");
  await expect(page.getByRole("heading", { name: "Contas" })).toBeVisible();
}

Given(
  /^a família com as contas "Poupança" \(zerada, com histórico\), "Carteira antiga" \(sem lançamentos\) e "Itaú Lucas" \(R\$ 3\.000,00\)$/,
  async ({ world }) => {
    const fx = await makeFamily();
    world.family = fx;
    const poup = await makeAccount(fx, {
      name: "Poupança",
      owner: "Mariana",
      openingBalanceInCents: 10000,
    });
    await makeAccount(fx, { name: "Carteira antiga", owner: "Mariana", openingBalanceInCents: 0 });
    const itau = await makeAccount(fx, {
      name: "Itaú Lucas",
      owner: "Lucas",
      openingBalanceInCents: 300000,
    });
    await makeTransaction(fx, {
      account: poup,
      category: "Supermercado",
      amountInCents: 10000,
      occurredOn: "2026-10-03",
      author: "Mariana",
      shared: false,
      description: "Compra antiga",
    });
    world.data.accs = { poup, itau };
  },
);

async function archive(page: Page, nome: string) {
  await card(page, nome)
    .getByRole("button", { name: `Ações da conta ${nome}` })
    .click();
  await page.getByRole("menuitem", { name: "Arquivar" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Arquivar", exact: true }).click();
}

When("Mariana arquiva a conta {string} e confirma", async ({ world, page }, n: string) => {
  await contas(world, page);
  await archive(page, n);
});
Then("vê o aviso de conta {string}", async ({ page }, t: string) => {
  await expect(toast(page, t)).toBeVisible();
});
Then("{string} não aparece na lista de contas", async ({ page }, n: string) => {
  await expect(card(page, n)).toHaveCount(0);
});

Given("que a conta {string} foi arquivada", async ({ world }, n: string) => {
  const a = await db.bankAccount.findFirstOrThrow({ where: { name: n } });
  await db.bankAccount.update({
    where: { id: a.id },
    data: { archivedAt: new Date(), version: 2 },
  });
  void world;
});

When("Mariana abre o formulário de despesa da conta", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await expect(page.getByLabel("Valor", { exact: true })).toBeVisible();
});
Then("{string} não aparece em {string}", async ({ page }, n: string, _l: string) => {
  const sel = page.getByLabel("Pagar com");
  await expect(sel).toBeVisible();
  await expect(sel.locator("option", { hasText: n })).toHaveCount(0);
});
When("Mariana abre o Extrato das contas", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/extrato");
});
Then(
  "os lançamentos antigos da {string} mostram {string}",
  async ({ page }, _n: string, t: string) => {
    const row = page.getByTestId("ledger-row").filter({ hasText: "Compra antiga" });
    await expect(row).toBeVisible();
    await expect(row.first()).toContainText(t);
  },
);

When("Mariana tenta arquivar a conta {string}", async ({ world, page }, n: string) => {
  await contas(world, page);
  await archive(page, n);
});
Then(
  "vê o bloqueio {string} com o botão {string}",
  async ({ page }, msg: string, botao: string) => {
    const d = page.getByRole("dialog");
    await expect(d.getByText(msg)).toBeVisible();
    await expect(d.getByRole("button", { name: botao })).toBeVisible();
  },
);
When("Mariana toca em {string}", async ({ page }, b: string) => {
  await page.getByRole("button", { name: b }).click();
});
Then(
  "o formulário de transferência abre com origem {string} e valor {string}",
  async ({ page }, origem: string, valor: string) => {
    const d = page.getByRole("dialog", { name: "Transferir" });
    await expect(d).toBeVisible();
    await expect(d.getByLabel("Conta de origem").locator("option:checked")).toContainText(origem);
    await expect(d.getByLabel("Valor", { exact: true })).toHaveValue(NB(valor));
  },
);

When("Mariana abre a Home das contas", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/");
});
Then("o total em {string} é {string}", async ({ page }, _t: string, v: string) => {
  await expect(page.getByTestId("family-balance-value")).toHaveText(NB(v));
});

When("Mariana reativa a conta {string}", async ({ world, page }, n: string) => {
  await contas(world, page);
  await page.getByTestId("archived-accounts").locator("summary").click();
  await page
    .getByTestId("archived-account")
    .filter({ hasText: n })
    .getByRole("button", { name: "Reativar" })
    .click();
});
Then("{string} volta à lista de contas", async ({ page }, n: string) => {
  await expect(card(page, n)).toBeVisible();
  await expect(card(page, n)).toContainText("R$");
});

When(
  "Mariana exclui a conta {string} e confirma {string}",
  async ({ world, page }, n: string, botao: string) => {
    await contas(world, page);
    await card(page, n)
      .getByRole("button", { name: `Ações da conta ${n}` })
      .click();
    await page.getByRole("menuitem", { name: "Excluir" }).click();
    await page.getByRole("dialog").getByRole("button", { name: botao }).click();
  },
);
Then("{string} não existe em nenhuma lista", async ({ page }, n: string) => {
  await expect(card(page, n)).toHaveCount(0);
  await expect(page.getByTestId("archived-account").filter({ hasText: n })).toHaveCount(0);
});
When("Mariana cadastra uma conta chamada {string}", async ({ page, world }, n: string) => {
  if (!/\/contas/.test(page.url())) await contas(world, page);
  await page.getByRole("button", { name: "Nova conta" }).first().click();
  const d = page.getByRole("dialog", { name: "Nova conta" });
  await d.getByLabel("Nome", { exact: true }).fill(n);
  await d.getByLabel("Tipo", { exact: true }).selectOption({ label: "Dinheiro/carteira" });
  await d.getByRole("button", { name: "Salvar conta" }).click();
});
Then("a conta {string} é criada", async ({ page }, n: string) => {
  await expect(card(page, n)).toBeVisible();
});
Then("vê o aviso de nome já em uso", async ({ page }) => {
  await expect(page.getByText("Já existe uma conta com este nome")).toBeVisible();
});

When("Mariana abre as ações da conta {string}", async ({ world, page }, n: string) => {
  await contas(world, page, "Mariana");
  await card(page, n)
    .getByRole("button", { name: `Ações da conta ${n}` })
    .click();
});
When("Lucas abre as ações da conta {string}", async ({ world, page }, n: string) => {
  await contas(world, page, "Lucas");
  await card(page, n)
    .getByRole("button", { name: `Ações da conta ${n}` })
    .click();
});
Then("vê a ação {string} e não vê {string}", async ({ page }, a: string, b: string) => {
  await expect(page.getByRole("menuitem", { name: a })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: b })).toHaveCount(0);
});

Given(
  'que a conta "Itaú Lucas" foi zerada e arquivada e existe a despesa prevista {string} de {string} de Lucas',
  async ({ world }, desc: string, _v: string) => {
    const fx = world.family as never;
    const a = await db.bankAccount.findFirstOrThrow({ where: { name: "Itaú Lucas" } });
    await db.bankAccount.update({ where: { id: a.id }, data: { archivedAt: new Date() } });
    await makePlannedExpense(fx, {
      description: desc,
      amountInCents: 10000,
      dueOn: "2026-10-15",
      responsible: "Lucas",
    });
  },
);
When("Lucas abre a baixa de {string}", async ({ world, page }, t: string) => {
  await as(world, page, "Lucas");
  await gotoReady(page, "/previstas");
  await openPay(page, t);
});
Then("a conta de origem sugerida na baixa não é {string}", async ({ page }, n: string) => {
  const sel = page.locator("#pay-account");
  await expect(sel.locator("option:checked")).not.toContainText(n);
  await expect(sel.locator("option", { hasText: n })).toHaveCount(0);
});
