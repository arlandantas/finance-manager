import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily, makeTransaction } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { addExpense, family, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
type Name = "Mariana" | "Lucas";
const detail = (page: Page) => page.getByRole("dialog", { name: /lançamento/i }).first();
const dlg = (page: Page, name: string) => page.getByRole("dialog", { name });

async function actAs(world: World, page: Page, user: Name) {
  if (world.data.loggedAs !== user) {
    await loginAs(page, { email: `${user.toLowerCase()}@exemplo.com`, name: `${user} Silva` });
    world.data.loggedAs = user;
  }
}

/** Despesa de Lucas na conta; o saldo de abertura é calculado para o saldo pedido. */
async function seedExpense(world: World, valor: string, conta: string, saldo: string) {
  world.family = await makeFamily();
  const amount = parseBRL(valor) ?? 0;
  const account = await makeAccount(world.family, {
    name: conta,
    owner: "Mariana",
    openingBalanceInCents: (parseBRL(saldo) ?? 0) + amount,
  });
  const row = await makeTransaction(world.family, {
    account,
    category: "Supermercado",
    amountInCents: amount,
    occurredOn: "2026-10-03",
    author: "Lucas",
    payer: "Lucas",
    description: "Compra do mês",
  });
  await db.transactionRevision.create({
    data: {
      familyId: world.family.family.id,
      transactionId: row.id,
      revision: 1,
      action: "CREATE",
      actorMemberId: world.family.byName.Lucas?.memberId as string,
      changes: [{ field: "*", from: null, to: { kind: "EXPENSE", amountInCents: amount } }],
    },
  });
  world.data.txId = row.id;
  world.data.accountName = conta;
}

async function openDetail(
  world: World,
  page: Page,
  user: Name,
  includeDeleted = false,
  text = "Compra do mês",
) {
  await actAs(world, page, user);
  await gotoReady(page, `/extrato${includeDeleted ? "?includeDeleted=true" : ""}`);
  await page.getByTestId("ledger-row").filter({ hasText: text }).first().click();
  await expect(dlg(page, "Detalhe do lançamento")).toBeVisible();
}

async function openMenu(page: Page, item: string) {
  await page.getByRole("button", { name: item, exact: true }).click();
}

async function editAmount(page: Page, valor: string) {
  await openMenu(page, "Editar");
  const form = dlg(page, "Editar lançamento");
  await expect(form).toBeVisible();
  await form.getByLabel("Valor", { exact: true }).fill(valor);
  await form.getByRole("button", { name: "Salvar alterações" }).click();
}

async function balanceOf(page: Page, conta: string): Promise<string> {
  const other = await page.context().newPage();
  await gotoReady(other, "/contas");
  const card = other.getByTestId("account-card").filter({ hasText: conta });
  await expect(card).toBeVisible();
  // Valores nascem ocultos até a preferência carregar (US-027): espera o valor ficar legível.
  await expect(card.locator('[data-money="visible"]').first()).toBeVisible();
  const text = normalizeSpaces(await card.innerText());
  await other.close();
  return text;
}

Given(
  /^a despesa de "([^"]+)" em "([^"]+)" \(saldo "([^"]+)"\)$/,
  async ({ world }, valor: string, conta: string, saldo: string) => {
    await seedExpense(world, valor, conta, saldo);
  },
);

Given(
  /^a despesa de "([^"]+)" em "([^"]+)" \(saldo "([^"]+)"\) corrigida por Mariana para "([^"]+)"$/,
  async ({ world, page }, valor: string, conta: string, saldo: string, novo: string) => {
    await seedExpense(world, valor, conta, saldo);
    await openDetail(world, page, "Mariana");
    await editAmount(page, novo);
    await expect(page.getByText("Lançamento atualizado")).toBeVisible();
    await page.keyboard.press("Escape");
  },
);

When("Mariana altera o valor para {string} e salva", async ({ world, page }, valor: string) => {
  await openDetail(world, page, "Mariana");
  await editAmount(page, valor);
  await expect(page.getByText("Lançamento atualizado")).toBeVisible();
});

Then("o saldo da conta passa a {string}", async ({ world, page }, saldo: string) => {
  expect(await balanceOf(page, world.data.accountName as string)).toContain(normalizeSpaces(saldo));
});

Then("o detalhe mostra {string}", async ({ page }, texto: string) => {
  await expect(dlg(page, "Detalhe do lançamento")).toContainText(texto);
});

When("abro o histórico do lançamento", async ({ world, page }) => {
  await openDetail(world, page, "Lucas");
  await openMenu(page, "Histórico");
  await expect(page.getByTestId("history")).toBeVisible();
});

Then(
  "vejo cada alteração com autor, data\\/hora, campo, valor anterior e valor novo",
  async ({ page }) => {
    const items = page.getByTestId("history-item");
    await expect(items).toHaveCount(2);
    const first = normalizeSpaces(await items.first().innerText());
    expect(first).toMatch(/Editado por Mariana em \d{2}\/\d{2}\/\d{4}/);
    expect(first).toContain("Valor: R$ 150,50 → R$ 105,50");
    expect(normalizeSpaces(await items.nth(1).innerText())).toMatch(/Criado por Lucas/);
  },
);

When(
  "Lucas escolhe {string} e confirma {string}",
  async ({ world, page }, acao: string, titulo: string) => {
    await openDetail(world, page, "Lucas");
    await openMenu(page, acao);
    await expect(dlg(page, titulo)).toBeVisible();
    await dlg(page, titulo).getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByText("Despesa excluída")).toBeVisible();
    await expect(page.getByRole("button", { name: "Desfazer" })).toBeVisible();
  },
);

Then("o lançamento some do extrato e o saldo da conta é restabelecido", async ({ world, page }) => {
  await expect(page.getByTestId("ledger-row").filter({ hasText: "Compra do mês" })).toHaveCount(0);
  expect(await balanceOf(page, world.data.accountName as string)).toContain("R$ 1.000,00");
});

Then("ele passa a constar em {string}", async ({ page }, filtro: string) => {
  const toggle = page.getByRole("button", { name: /^Filtros/ });
  const mobile = await toggle.isVisible();
  if (mobile) await toggle.click();
  const scope = mobile
    ? page.getByRole("dialog", { name: "Filtros" })
    : page.getByRole("region", { name: "Filtros" });
  await scope.getByLabel(filtro).click();
  if (mobile) await page.getByRole("button", { name: "Ver resultados" }).click();
  await expect(page.getByTestId("ledger-row").filter({ hasText: "Compra do mês" })).toBeVisible();
});

Given("um lançamento excluído", async ({ world }) => {
  await seedExpense(world, "R$ 150,50", "Nubank Conjunta", "R$ 849,50");
  await db.transaction.update({
    where: { id: world.data.txId as string },
    data: {
      deletedAt: new Date(),
      deletedByMemberId: family(world).byName.Lucas?.memberId as string,
      deletionReason: "DELETED",
      version: 2,
    },
  });
});

When("restauro o lançamento clicando em {string}", async ({ world, page }, botao: string) => {
  await openDetail(world, page, "Lucas", true);
  await dlg(page, "Detalhe do lançamento").getByRole("button", { name: botao }).click();
  await expect(page.getByText("Lançamento restaurado")).toBeVisible();
});

Then("ele volta ao extrato e ao saldo da conta", async ({ world, page }) => {
  await page.keyboard.press("Escape");
  await gotoReady(page, "/extrato");
  await expect(page.getByTestId("ledger-row").filter({ hasText: "Compra do mês" })).toBeVisible();
  expect(await balanceOf(page, world.data.accountName as string)).toContain("R$ 849,50");
});

Given("que Mariana e Lucas abriram o mesmo lançamento", async ({ world, page, browser }) => {
  await seedExpense(world, "R$ 150,50", "Nubank Conjunta", "R$ 849,50");
  await openDetail(world, page, "Mariana");
  await openMenu(page, "Editar");
  const ctx = await browser.newContext({ baseURL: "http://localhost:3101" });
  const lucasPage = await ctx.newPage();
  await loginAs(lucasPage, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(lucasPage, "/extrato");
  await lucasPage.getByTestId("ledger-row").filter({ hasText: "Compra do mês" }).first().click();
  await lucasPage.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(dlg(lucasPage, "Editar lançamento")).toBeVisible();
  world.data.lucasPage = lucasPage;
});

Given("Mariana salvou uma alteração", async ({ page }) => {
  const form = dlg(page, "Editar lançamento");
  await form.getByLabel("Valor", { exact: true }).fill("R$ 105,50");
  await form.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Lançamento atualizado")).toBeVisible();
});

When("Lucas tenta salvar a sua", async ({ world }) => {
  const lucasPage = world.data.lucasPage as Page;
  const form = dlg(lucasPage, "Editar lançamento");
  await form.getByLabel("Valor", { exact: true }).fill("R$ 200,00");
  await form.getByRole("button", { name: "Salvar alterações" }).click();
});

Then("Lucas vê o conflito {string}", async ({ world }, msg: string) => {
  const lucasPage = world.data.lucasPage as Page;
  await expect(dlg(lucasPage, "Lançamento alterado")).toContainText(msg);
});

Then("sua alteração não é gravada", async ({ world }) => {
  const row = await db.transaction.findUniqueOrThrow({ where: { id: world.data.txId as string } });
  expect(row.amountInCents).toBe(10550n);
  expect(row.version).toBe(2);
  await (world.data.lucasPage as Page).context().close();
});

Given("{string} no painel", async ({ world, page }, _frase: string) => {
  await setupCouple(world);
  await addExpense(world, "Mariana", "R$ 400,00", { occurredOn: "2026-10-03" });
  await addExpense(world, "Mariana", "R$ 400,00", { occurredOn: "2026-10-02" });
  await actAs(world, page, "Lucas");
  await gotoReady(page, "/acerto");
  await expect(page.getByTestId("settlement-hero")).toContainText(
    "Para equilibrar o mês: Lucas transfere R$ 400,00 para Mariana",
  );
});

When(
  "a despesa comum de Mariana de {string} é excluída",
  async ({ world, page }, _valor: string) => {
    await gotoReady(page, "/extrato");
    await page.getByTestId("ledger-row").first().click();
    await expect(dlg(page, "Detalhe do lançamento")).toBeVisible();
    await openMenu(page, "Excluir");
    await dlg(page, "Excluir lançamento?")
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await expect(page.getByText("Despesa excluída")).toBeVisible();
    await gotoReady(page, "/acerto");
  },
);

When("altero o valor para {string}", async ({ world, page }, valor: string) => {
  await openDetail(world, page, "Mariana");
  await editAmount(page, valor);
});

Then("vejo {string} e a alteração não é salva", async ({ world, page }, msg: string) => {
  await expect(dlg(page, "Editar lançamento").getByText(msg)).toBeVisible();
  const row = await db.transaction.findUniqueOrThrow({ where: { id: world.data.txId as string } });
  expect(row.amountInCents).toBe(15050n);
  expect(row.version).toBe(1);
});

void detail;
