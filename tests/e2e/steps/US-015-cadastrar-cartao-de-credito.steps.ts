import { expect, type Page } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeAccount, makeCard, makeCardPurchase, makeFamily } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { enterAs } from "../support/acerto";
import { cardItem, createCardViaUi, fillCard, openCartoes, openNewCard } from "../support/cartoes";
import { dlg } from "../support/categorias";
import { Given, Then, When } from "../support/fixtures";
import { setupFamily } from "../support/world";

const db = testDb();

Given("Mariana está autenticada", async ({ page, world }) => {
  await setupFamily(world);
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  world.data.loggedAs = "Mariana";
  await gotoReady(page, "/");
});

When(
  "Mariana cadastra o cartão {string} com limite {string}, fechamento dia {int} e vencimento dia {int}",
  async ({ page }, nome: string, limite: string, fecha: number, vence: number) => {
    await openCartoes(page);
    await createCardViaUi(page, { name: nome, limit: limite, closing: fecha, due: vence });
    await expect(page.getByText("Cartão cadastrado com sucesso!")).toBeVisible();
  },
);

Then(
  "o cartão aparece na lista com limite {string} e disponível {string}",
  async ({ page }, limite: string, disponivel: string) => {
    const item = page.getByTestId("card-item").first();
    await expect(item.getByTestId("card-limit")).toHaveText(normalizeSpaces(limite));
    await expect(item.getByTestId("card-available")).toHaveText(normalizeSpaces(disponivel));
  },
);

Then("mostra {string}", async ({ page }, frase: string) => {
  await expect(page.getByTestId("card-item").first().getByTestId("card-cycle")).toHaveText(frase);
});

When("Mariana cadastra um cartão sem escolher o titular", async ({ page }) => {
  await openCartoes(page);
  await createCardViaUi(page, { name: "Cartão Teste" });
  await expect(page.getByText("Cartão cadastrado com sucesso!")).toBeVisible();
});

Then("o titular do cartão é {string}", async ({}, nome: string) => {
  const card = await db.creditCard.findFirstOrThrow({
    include: { owner: { include: { user: true } } },
  });
  expect((card.owner.user.name ?? "").split(" ")[0]).toBe(nome);
});

When(
  "Mariana cadastra o cartão {string} com fechamento dia {int} e vencimento dia {int}",
  async ({ page }, nome: string, fecha: number, vence: number) => {
    await openCartoes(page);
    await createCardViaUi(page, { name: nome, closing: fecha, due: vence });
    await expect(page.getByText("Cartão cadastrado com sucesso!")).toBeVisible();
  },
);

Then("a lista mostra {string}", async ({ page }, frase: string) => {
  await expect(page.getByTestId("card-item").first().getByTestId("card-cycle")).toHaveText(frase);
});

Given(
  "as contas {string} com {string} e {string} com {string}",
  async ({ world }, a: string, saldoA: string, b: string, saldoB: string) => {
    const fx = await setupFamily(world);
    const parse = (v: string) =>
      Math.round(Number(v.replace(/[^\d,]/g, "").replace(",", ".")) * 100);
    await makeAccount(fx, { name: a, owner: "Mariana", openingBalanceInCents: parse(saldoA) });
    await makeAccount(fx, { name: b, owner: "Mariana", openingBalanceInCents: parse(saldoB) });
  },
);

When(
  "Mariana cadastra o cartão {string} com limite {string}",
  async ({ page }, nome: string, limite: string) => {
    await openCartoes(page);
    await createCardViaUi(page, { name: nome, limit: limite });
    await expect(page.getByText("Cartão cadastrado com sucesso!")).toBeVisible();
  },
);

Then("o saldo da família continua {string}", async ({ page }, saldo: string) => {
  await gotoReady(page, "/contas");
  await expect(page.getByTestId("total-balance")).toContainText(normalizeSpaces(saldo));
});

When("Mariana tenta salvar um cartão sem nome, sem limite e sem dias", async ({ page, world }) => {
  world.data.assertNothingCreated = async () => expect(await db.creditCard.count()).toBe(0);
  await openCartoes(page);
  const d = await openNewCard(page);
  await d.getByRole("button", { name: "Salvar cartão" }).click();
});

When("Mariana informa o dia de fechamento {int}", async ({ page }, dia: number) => {
  await openCartoes(page);
  const d = await openNewCard(page);
  await fillCard(d, { name: "Cartão X", limit: "R$ 1.000,00", closing: dia, due: 5 });
  await d.getByRole("button", { name: "Salvar cartão" }).click();
});

When("Mariana informa o limite {string}", async ({ page }, limite: string) => {
  await openCartoes(page);
  const d = await openNewCard(page);
  await fillCard(d, { name: "Cartão X", limit: limite, closing: 25, due: 5 });
  await d.getByRole("button", { name: "Salvar cartão" }).click();
});

Given("o cartão {string}", async ({ world }, nome: string) => {
  await makeCard(await setupFamily(world), { name: nome, owner: "Mariana" });
});

Given("o cartão {string} cadastrado por Mariana", async ({ world }, nome: string) => {
  await makeCard(await setupFamily(world), { name: nome, owner: "Mariana", limitInCents: 500000 });
});

When("Mariana tenta cadastrar o cartão {string}", async ({ page }, nome: string) => {
  await openCartoes(page);
  await createCardViaUi(page, { name: nome });
});

Then("vê o cartão {string} com o mesmo limite", async ({ page }, nome: string) => {
  await expect(cardItem(page, nome).getByTestId("card-limit")).toHaveText(
    normalizeSpaces("R$ 5.000,00"),
  );
});

Given("o cartão {string} com limite {string}", async ({ world }, nome: string, limite: string) => {
  const cents = Math.round(Number(limite.replace(/[^\d,]/g, "").replace(",", ".")) * 100);
  await makeCard(await setupFamily(world), { name: nome, owner: "Mariana", limitInCents: cents });
});

Given("o cartão {string} sem compras", async ({ world }, nome: string) => {
  await makeCard(await setupFamily(world), { name: nome, owner: "Mariana" });
});

async function openEdit(page: Page, nome: string) {
  await page.getByRole("button", { name: `Ações do cartão ${nome}` }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  const d = dlg(page, "Editar cartão");
  await expect(d).toBeVisible();
  return d;
}

When(
  "Mariana altera o nome para {string} e o limite para {string}",
  async ({ page, world }, nome: string, limite: string) => {
    await openCartoes(page);
    const card = await db.creditCard.findFirstOrThrow();
    world.data.cardName = card.name;
    const d = await openEdit(page, card.name);
    await fillCard(d, { name: nome, limit: limite });
    await d.getByRole("button", { name: "Salvar cartão" }).click();
    await expect(page.getByText("Cartão atualizado")).toBeVisible();
  },
);

Then(
  "o cartão aparece como {string} com limite {string}",
  async ({ page }, nome: string, limite: string) => {
    const item = cardItem(page, nome);
    await expect(item).toHaveCount(1);
    await expect(item.getByTestId("card-limit")).toHaveText(normalizeSpaces(limite));
  },
);

When("Mariana altera o fechamento para o dia {int}", async ({ page }, dia: number) => {
  await openCartoes(page);
  const card = await db.creditCard.findFirstOrThrow();
  const d = await openEdit(page, card.name);
  await fillCard(d, { closing: dia });
  await d.getByRole("button", { name: "Salvar cartão" }).click();
  await expect(page.getByText("Cartão atualizado")).toBeVisible();
});

Then("o cartão passa a mostrar {string}", async ({ page }, trecho: string) => {
  await expect(page.getByTestId("card-cycle").first()).toContainText(trecho);
});

Given(
  "que Mariana e Lucas abriram a edição do cartão {string}",
  async ({ world, page, browser }, nome: string) => {
    await makeCard(await setupFamily(world), { name: nome, owner: "Mariana" });
    await openCartoes(page);
    const d = await openEdit(page, nome);
    const ctx = await browser.newContext({
      baseURL: "http://localhost:3101",
      ...(page.viewportSize() ? { viewport: page.viewportSize() as never } : {}),
    });
    const lucasPage = await ctx.newPage();
    await loginAs(lucasPage, { email: "lucas@exemplo.com", name: "Lucas Silva" });
    await gotoReady(lucasPage, "/cartoes");
    const dl = await openEdit(lucasPage, nome);
    world.data.lucasPage = lucasPage;
    world.data.marianaDrawer = d;
    world.data.lucasDrawer = dl;
    world.data.conflictCheck = async (mensagem: string) => {
      await expect(dlg(lucasPage, "Editar cartão")).toContainText(mensagem);
      await ctx.close();
    };
  },
);

When("Mariana salva um novo limite", async ({ page }) => {
  const d = dlg(page, "Editar cartão");
  await fillCard(d, { limit: "R$ 6.000,00" });
  await d.getByRole("button", { name: "Salvar cartão" }).click();
  await expect(page.getByText("Cartão atualizado")).toBeVisible();
});

When("Lucas tenta salvar outro limite", async ({ world }) => {
  const lucasPage = world.data.lucasPage as Page;
  const d = dlg(lucasPage, "Editar cartão");
  await fillCard(d, { limit: "R$ 7.000,00" });
  await d.getByRole("button", { name: "Salvar cartão" }).click();
});

Given("que a família não tem cartões", async ({ world }) => {
  await setupFamily(world);
  // Remove os cartões que o contexto do cenário tenha criado (cartão sem faturas/compras não tem trava).
  await db.creditCard.deleteMany();
  expect(await db.creditCard.count()).toBe(0);
});

When("Mariana abre {string}", async ({ page, world }, _tela: string) => {
  await enterAs(world, page, "Mariana");
  await openCartoes(page);
});

Then("vê {string} com o botão {string}", async ({ page }, mensagem: string, botao: string) => {
  await expect(page.getByText(mensagem, { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: botao }).first()).toBeVisible();
});

Given("a {string} com o cartão {string}", async ({}, familia: string, cartao: string) => {
  const other = await makeFamily({
    name: familia,
    members: [{ email: "souza@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
  });
  await makeCard(other, { name: cartao });
});

Then("não vê o cartão {string}", async ({ page }, nome: string) => {
  await expect(page.getByText("Cadastre seu primeiro cartão")).toBeVisible();
  await expect(cardItem(page, nome)).toHaveCount(0);
});

Given(
  "o cartão {string} com uma compra de {string}",
  async ({ world }, nome: string, valor: string) => {
    const fx = await setupFamily(world);
    const card = await makeCard(fx, { name: nome, owner: "Mariana" });
    await makeCardPurchase(fx, {
      card,
      amountInCents: Math.round(Number(valor.replace(/[^\d,]/g, "").replace(",", ".")) * 100),
      occurredOn: "2026-10-03",
    });
  },
);

When("Mariana tenta alterar o dia de fechamento", async ({ page }) => {
  await openCartoes(page);
  const card = await db.creditCard.findFirstOrThrow();
  await openEdit(page, card.name);
});

Then("o campo está desabilitado com a explicação {string}", async ({ page }, texto: string) => {
  const d = dlg(page, "Editar cartão");
  await expect(d.getByLabel("Dia de fechamento", { exact: true })).toBeDisabled();
  await expect(d.getByLabel("Dia de vencimento", { exact: true })).toBeDisabled();
  await expect(d.getByText(texto, { exact: true })).toBeVisible();
});

Then("nome e limite continuam editáveis", async ({ page }) => {
  const d = dlg(page, "Editar cartão");
  await expect(d.getByLabel("Nome", { exact: true })).toBeEnabled();
  await expect(d.getByLabel("Limite", { exact: true })).toBeEnabled();
});
