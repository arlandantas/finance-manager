import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();
const normalize = (s: string) => s.replace(/\u00a0/g, " ");

async function openContas(page: Page, user: "Mariana" | "Lucas") {
  await loginAs(page, { email: `${user.toLowerCase()}@exemplo.com`, name: `${user} Silva` });
  await gotoReady(page, "/contas");
  await expect(page.getByRole("heading", { name: "Contas" })).toBeVisible();
}

async function openNewAccountDrawer(page: Page) {
  await page.getByRole("button", { name: "Nova conta" }).first().click();
  await expect(page.getByRole("dialog", { name: "Nova conta" })).toBeVisible();
}

const card = (page: Page, name: string) =>
  page.getByTestId("account-card").filter({ hasText: name });

async function fillAccountForm(
  page: Page,
  f: { name: string; institution?: string; type?: string; owner?: string; balance?: string },
) {
  const dialog = page.getByRole("dialog", { name: "Nova conta" });
  await dialog.getByLabel("Nome", { exact: true }).fill(f.name);
  if (f.institution)
    await dialog.getByLabel("Instituição", { exact: true }).selectOption({ label: f.institution });
  if (f.type) await dialog.getByLabel("Tipo", { exact: true }).selectOption({ label: f.type });
  if (f.owner) await dialog.getByLabel("Titular", { exact: true }).selectOption({ label: f.owner });
  if (f.balance) await dialog.getByLabel("Saldo inicial", { exact: true }).fill(f.balance);
}

Given("que Mariana está na tela {string}", async ({ page, world }, _tela: string) => {
  world.family = await makeFamily();
  await openContas(page, "Mariana");
});

When(
  "cadastra nome {string}, instituição {string}, tipo {string}, titular {string} e saldo inicial {string}",
  async (
    { page },
    name: string,
    institution: string,
    type: string,
    owner: string,
    balance: string,
  ) => {
    await openNewAccountDrawer(page);
    await fillAccountForm(page, { name, institution, type, owner, balance });
    await page.getByRole("button", { name: "Salvar conta" }).click();
    await expect(page.getByRole("dialog", { name: "Nova conta" })).toBeHidden();
  },
);

Then("a conta aparece na lista com saldo {string}", async ({ page, world }, saldo: string) => {
  const expected = normalize(saldo);
  const last = page.getByTestId("account-card").last();
  await expect(last).toBeVisible();
  await expect
    .poll(async () =>
      normalize(
        await page
          .getByTestId("account-card")
          .allInnerTexts()
          .then((t) => t.join("|")),
      ),
    )
    .toContain(expected);
  world.data.balance = expected;
});

Then("o saldo consolidado da família soma essa conta", async ({ page, world }) => {
  const total = normalize(await page.getByTestId("total-balance").innerText());
  expect(total).toContain(world.data.balance as string);
});

Given("que Lucas abre o formulário de nova conta", async ({ page, world }) => {
  world.family = await makeFamily();
  await openContas(page, "Lucas");
  await openNewAccountDrawer(page);
});

Given("que a conta está no cheque especial", async ({ page, world }) => {
  world.family = await makeFamily();
  await openContas(page, "Mariana");
});

When("cadastro saldo inicial {string}", async ({ page }, balance: string) => {
  await openNewAccountDrawer(page);
  await fillAccountForm(page, { name: "Conta Cheque Especial", type: "Conta corrente", balance });
  await page.getByRole("button", { name: "Salvar conta" }).click();
  await expect(page.getByRole("dialog", { name: "Nova conta" })).toBeHidden();
});

Then(
  "a conta aparece com saldo {string} destacado em vermelho",
  async ({ page }, saldo: string) => {
    const item = card(page, "Conta Cheque Especial");
    await expect(item).toBeVisible();
    const balance = item.getByText(
      new RegExp(`^${normalize(saldo).replace(/[$]/g, "\\$")}$`.replace(/ /g, "[\\s\\u00a0]")),
    );
    await expect(balance).toBeVisible();
    // a cor vive no contêiner do <Money> (US-027)
    await expect(
      balance.locator("xpath=ancestor::span[contains(@class,'text-red-700')]"),
    ).toHaveCount(1);
  },
);

Given("o formulário de nova conta", async ({ page, world }) => {
  world.family = await makeFamily();
  await openContas(page, "Mariana");
  await openNewAccountDrawer(page);
});

When("tento salvar sem nome ou sem tipo", async ({ page }) => {
  await page.getByRole("button", { name: "Salvar conta" }).click();
});

Then("vejo mensagens de erro nos campos inválidos", async ({ page }) => {
  const dialog = page.getByRole("dialog", { name: "Nova conta" });
  await expect(dialog.getByText("Informe o nome da conta")).toBeVisible();
  await expect(dialog.getByText("Escolha o tipo da conta")).toBeVisible();
  await expect(dialog.getByLabel("Nome", { exact: true })).toHaveAttribute("aria-invalid", "true");
});

Given("que já existe a conta {string}", async ({ page, world }, nome: string) => {
  world.family = await makeFamily();
  await makeAccount(world.family, { name: nome, owner: "Mariana", openingBalanceInCents: 150000 });
  await openContas(page, "Mariana");
});

When("tento cadastrar outra com o mesmo nome", async ({ page }) => {
  await openNewAccountDrawer(page);
  await fillAccountForm(page, { name: "Itaú Mariana", type: "Conta corrente" });
  await page.getByRole("button", { name: "Salvar conta" }).click();
});

Then("vejo {string}", async ({ page }, texto: string) => {
  // Texto exato de um elemento; se a frase for composta (ex.: rótulo + valor), vale o conteúdo da tela.
  const exact = page.getByText(texto, { exact: true });
  const composed = page.locator("main").filter({ hasText: texto });
  await expect(exact.or(composed).first()).toBeVisible();
});

Given("que Mariana cadastrou a conta {string}", async ({ world }, nome: string) => {
  world.family = await makeFamily();
  await makeAccount(world.family, { name: nome, owner: "Mariana", openingBalanceInCents: 100000 });
});

When("Lucas abre a tela {string}", async ({ page }, _tela: string) => {
  await openContas(page, "Lucas");
});

Then("ele vê {string} com o mesmo saldo", async ({ page }, nome: string) => {
  const item = card(page, nome);
  await expect(item).toBeVisible();
  expect(normalize(await item.innerText())).toContain("R$ 1.000,00");
});

Given("uma conta da {string}", async ({ world }, nome: string) => {
  world.family = await makeFamily({ name: nome });
  await makeAccount(world.family, {
    name: "Itaú Mariana",
    owner: "Mariana",
    openingBalanceInCents: 150000,
  });
});

When("um usuário da {string} lista contas", async ({ page }, nome: string) => {
  const other = await makeFamily({
    name: nome,
    members: [{ email: "carla@exemplo.com", name: "Carla Souza", role: "ADMIN" }],
  });
  await loginAs(page, { email: "carla@exemplo.com", name: other.members[0]?.name });
  await gotoReady(page, "/contas");
  await expect(page.getByRole("heading", { name: "Contas" })).toBeVisible();
});

Then("a conta da {string} não aparece", async ({ page }, _nome: string) => {
  await expect(page.getByText("Cadastre sua primeira conta para começar")).toBeVisible();
  await expect(page.getByTestId("account-card")).toHaveCount(0);
});

Given("a conta {string}", async ({ page, world }, nome: string) => {
  world.family = await makeFamily();
  await makeAccount(world.family, { name: nome, owner: "Mariana", openingBalanceInCents: 150000 });
  await openContas(page, "Mariana");
});

When("altero o nome para {string}", async ({ page }, novo: string) => {
  await page.getByRole("button", { name: /^Ações da conta/ }).click();
  await page.getByRole("menuitem", { name: "Renomear" }).click();
  const dialog = page.getByRole("dialog", { name: "Renomear conta" });
  await dialog.getByLabel("Novo nome").fill(novo);
  await dialog.getByRole("button", { name: "Salvar" }).click();
  await expect(dialog).toBeHidden();
});

Then("a lista exibe {string} e o saldo permanece o mesmo", async ({ page }, nome: string) => {
  const item = card(page, nome);
  await expect(item).toBeVisible();
  expect(normalize(await item.innerText())).toContain("R$ 1.500,00");
  await expect(page.getByText("Itaú Mariana")).toHaveCount(0);
});
