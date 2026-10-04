import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import {
  type AccountFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
} from "../../support/factories";
import { loginAs } from "../../support/login";
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

const db = testDb();
type Name = "Lucas" | "Mariana";

const t = (n: number) => new Date(Date.UTC(2026, 9, 1, 12, 0, n));
const rows = (page: Page) => page.getByTestId("ledger-row");

async function setupFamily(world: import("../support/fixtures").World) {
  if (world.family) return;
  world.family = await makeFamily();
  const nubank = await makeAccount(world.family, {
    name: "Nubank Conjunta",
    owner: "Mariana",
    openingBalanceInCents: 100000,
  });
  const itau = await makeAccount(world.family, {
    name: "Itaú Mariana",
    owner: "Mariana",
    openingBalanceInCents: 150000,
  });
  world.data.accounts = { nubank, itau };
}

const accounts = (world: import("../support/fixtures").World) =>
  world.data.accounts as { nubank: AccountFixture; itau: AccountFixture };

Given(
  "que em outubro há: despesa comum de {string} de {word} em {string}",
  async ({ world }, valor: string, quem: Name, categoria: string) => {
    await setupFamily(world);
    await makeTransaction(world.family as never, {
      account: accounts(world).nubank,
      category: categoria,
      amountInCents: parseBRL(valor) ?? 0,
      occurredOn: "2026-10-02",
      author: quem,
      payer: quem,
      createdAt: t(1),
    });
  },
);

Given(
  "despesa pessoal de {string} de {word} em {string}",
  async ({ world }, valor: string, quem: Name, categoria: string) => {
    await makeTransaction(world.family as never, {
      account: accounts(world).nubank,
      category: categoria,
      amountInCents: parseBRL(valor) ?? 0,
      occurredOn: "2026-10-03",
      author: quem,
      payer: quem,
      shared: false,
      createdAt: t(2),
    });
  },
);

Given(
  "receita de {string} de {word} em {string}",
  async ({ world }, valor: string, quem: Name, categoria: string) => {
    await makeTransaction(world.family as never, {
      account: accounts(world).itau,
      type: "INCOME",
      category: categoria,
      amountInCents: parseBRL(valor) ?? 0,
      occurredOn: "2026-10-04",
      author: quem,
      payer: quem,
      createdAt: t(3),
    });
  },
);

async function openExtrato(
  page: Page,
  world: import("../support/fixtures").World,
  user: Name = "Lucas",
) {
  if (world.data.loggedAs !== user) {
    await loginAs(page, { email: `${user.toLowerCase()}@exemplo.com`, name: `${user} Silva` });
    world.data.loggedAs = user;
  }
  await gotoReady(page, "/extrato");
  await expect(page.getByRole("heading", { name: "Extrato" })).toBeVisible();
}

/** Aplica filtros: no celular via drawer "Filtros"; no desktop na barra inline. */
async function applyFilters(page: Page, selections: Record<string, string>) {
  const toggle = page.getByRole("button", { name: /^Filtros/ });
  const mobile = await toggle.isVisible();
  if (mobile) await toggle.click();
  const scope = mobile
    ? page.getByRole("dialog", { name: "Filtros" })
    : page.getByRole("region", { name: "Filtros" });
  for (const [label, option] of Object.entries(selections)) {
    await scope.getByLabel(label, { exact: true }).selectOption({ label: option });
  }
  if (mobile) {
    await page.getByRole("button", { name: "Ver resultados" }).click();
    await expect(page.getByRole("dialog", { name: "Filtros" })).toBeHidden();
  }
}

When("abro o extrato", async ({ page, world }) => {
  await openExtrato(page, world);
  await expect(rows(page).first())
    .toBeVisible()
    .catch(() => {});
});

Then("vejo os três lançamentos de outubro do mais recente ao mais antigo", async ({ page }) => {
  await expect(rows(page)).toHaveCount(3);
  const text = (await rows(page).allInnerTexts()).map(normalizeSpaces);
  expect(text[0]).toContain("Salário");
  expect(text[1]).toContain("Lazer e restaurantes");
  expect(text[2]).toContain("Supermercado");
});

Then(
  "cada linha mostra valor, categoria, conta, avatar de quem pagou e marcador comum ou pessoal",
  async ({ page }) => {
    const [salario, lazer, mercado] = [rows(page).nth(0), rows(page).nth(1), rows(page).nth(2)];
    const text = async (r: typeof salario) => normalizeSpaces(await r.innerText());
    expect(await text(mercado)).toContain("-R$ 150,50");
    expect(await text(mercado)).toContain("Nubank Conjunta");
    expect(await text(mercado)).toContain("Comum");
    expect(await text(lazer)).toContain("-R$ 80,00");
    expect(await text(lazer)).toContain("Pessoal");
    expect(await text(salario)).toContain("+R$ 5.000,00");
    expect(await text(salario)).toContain("Itaú Mariana");
    for (const [row, payer] of [
      [mercado, "Lucas Silva"],
      [lazer, "Mariana Silva"],
      [salario, "Mariana Silva"],
    ] as const) {
      await expect(
        row.getByRole("img", { name: `Avatar de ${payer}` }).locator("visible=true"),
      ).toHaveCount(1);
    }
  },
);

When("filtro por {string}", async ({ page, world }, membro: string) => {
  await openExtrato(page, world);
  await applyFilters(page, { Membro: membro });
});

Then("vejo apenas os lançamentos em que Lucas pagou, recebeu ou foi o autor", async ({ page }) => {
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Supermercado");
  await expect(page).toHaveURL(/memberId=/);
});

When(
  "filtro por categoria {string} e tipo {string}",
  async ({ page, world }, categoria: string, tipo: string) => {
    await openExtrato(page, world);
    await applyFilters(page, { Categoria: categoria, Tipo: tipo });
  },
);

Then("vejo apenas a despesa de {string}", async ({ page }, valor: string) => {
  await expect(rows(page)).toHaveCount(1);
  expect(normalizeSpaces(await rows(page).first().innerText())).toContain(valor);
});

Then("o total de despesas do filtro é {string}", async ({ page }, valor: string) => {
  await expect(page.getByTestId("totals-expense")).toHaveText(
    new RegExp(valor.replace(/[$]/g, "\\$").replace(/ /g, "[\\s\\u00a0]")),
  );
  await expect(page.getByTestId("totals-income")).toHaveText(/R\$\s0,00/);
});

When("seleciono o mês anterior", async ({ page, world }) => {
  await makeTransaction(world.family as never, {
    account: accounts(world).nubank,
    category: "Moradia",
    amountInCents: 200000,
    occurredOn: "2026-09-15",
    description: "Aluguel de setembro",
  });
  await openExtrato(page, world);
  await expect(rows(page)).toHaveCount(3);
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page).toHaveURL(/period=2026-09/);
});

Then("vejo somente lançamentos desse mês", async ({ page }) => {
  await expect(page.getByTestId("period-label")).toHaveText("Setembro de 2026");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Aluguel de setembro");
});

Given("que Lucas registrou a despesa em nome de Mariana", async ({ world }) => {
  await makeTransaction(world.family as never, {
    account: accounts(world).nubank,
    category: "Transporte",
    amountInCents: 3500,
    occurredOn: "2026-10-04",
    author: "Lucas",
    payer: "Mariana",
    description: "Uber da Mariana",
    createdAt: t(10),
  });
});

When("abro o detalhe do lançamento", async ({ page, world }) => {
  await openExtrato(page, world);
  await rows(page).filter({ hasText: "Uber da Mariana" }).click();
  await expect(page.getByRole("dialog", { name: "Detalhe do lançamento" })).toBeVisible();
});

Then("vejo {string} e {string}", async ({ page }, a: string, b: string) => {
  const dialog = page.getByRole("dialog", { name: "Detalhe do lançamento" });
  await expect(dialog.getByText(a, { exact: true }))
    .toBeVisible()
    .catch(async () => {
      await expect(dialog).toContainText(a);
    });
  await expect(dialog).toContainText(b);
});

When("aplico um filtro sem resultados", async ({ page, world }) => {
  await openExtrato(page, world);
  await applyFilters(page, { Tipo: "Transferência" });
});

Then("vejo {string} e a ação {string}", async ({ page }, mensagem: string, acao: string) => {
  await expect(page.getByText(mensagem, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: acao }).first().click();
  await expect(rows(page)).toHaveCount(3);
  await expect(page).not.toHaveURL(/type=/);
});

Given("uma família sem nenhum lançamento", async ({ page, world }) => {
  // Família separada, só com a conta (abertura não é lançamento); sem TRUNCATE no meio do cenário.
  const vazia = await makeFamily({
    name: "Família Vazia",
    members: [{ email: "lucas.vazio@exemplo.com", name: "Lucas Silva", role: "ADMIN" }],
  });
  await makeAccount(vazia, { name: "Conta Vazia", openingBalanceInCents: 50000 });
  world.family = vazia;
  world.data.loggedAs = "Lucas";
  await loginAs(page, { email: "lucas.vazio@exemplo.com", name: "Lucas Silva" });
});

Then("vejo um convite para fazer o primeiro lançamento", async ({ page }) => {
  await expect(page.getByText("Faça seu primeiro lançamento")).toBeVisible();
  await expect(page.getByRole("button", { name: "Novo lançamento" }).first()).toBeVisible();
});

Given("que estou no extrato", async ({ page, world }) => {
  await openExtrato(page, world);
  await expect(rows(page)).toHaveCount(3);
});

When("registro uma despesa pelo botão {string}", async ({ page, world }, _botao: string) => {
  await page.evaluate(() => {
    (window as unknown as { __semRecarga: boolean }).__semRecarga = true;
  });
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await expect(drawer(page)).toBeVisible();
  await fillAmount(page, "R$ 35,00");
  await pickCategory(page, "Transporte");
  await save(page, "Salvar Despesa");
  await waitSaved(page);
  world.data.novo = "Transporte";
});

Then("ela aparece no topo da lista sem recarregar a página", async ({ page, world }) => {
  await expect(rows(page)).toHaveCount(4);
  await expect(rows(page).first()).toContainText(world.data.novo as string);
  expect(normalizeSpaces(await rows(page).first().innerText())).toContain("-R$ 35,00");
  expect(
    await page.evaluate(() => (window as unknown as { __semRecarga?: boolean }).__semRecarga),
  ).toBe(true);
  await expect(page.locator('[data-testid="ledger-row"][data-pending="true"]')).toHaveCount(0);
});

When("um usuário de outra família abre o extrato", async ({ page }) => {
  await makeFamily({
    name: "Família Souza",
    members: [{ email: "carla@exemplo.com", name: "Carla Souza", role: "ADMIN" }],
  });
  await loginAs(page, { email: "carla@exemplo.com", name: "Carla Souza" });
  await gotoReady(page, "/extrato");
  await expect(page.getByRole("heading", { name: "Extrato" })).toBeVisible();
});

Then("não vê nenhum lançamento da {string}", async ({ page }, _familia: string) => {
  await expect(rows(page)).toHaveCount(0);
  await expect(page.getByText("Faça seu primeiro lançamento")).toBeVisible();
});
