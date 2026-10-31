import { expect, type Page } from "@playwright/test";
import { contrastRatio } from "@/lib/contrast";
import { ACCOUNT_COLOR_LABEL, ACCOUNT_COLORS, type AccountColor } from "@/modules/contas/colors";
import { testDb } from "../../support/db";
import {
  type AccountFixture,
  type CardFixture,
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeTransaction,
} from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import { drawer, fillAmount, openDrawer, pickCategory } from "../support/lancamento";

const db = testDb();
const COLOR_OF: Record<string, AccountColor> = Object.fromEntries(
  ACCOUNT_COLORS.map((c) => [ACCOUNT_COLOR_LABEL[c], c]),
);
const colorKey = (label: string): AccountColor => {
  const c = COLOR_OF[label];
  if (!c) throw new Error(`Cor desconhecida: ${label}`);
  return c;
};
const accountCard = (p: Page, n: string) => p.getByTestId("account-card").filter({ hasText: n });
const cardItem = (p: Page, n: string) => p.getByTestId("card-item").filter({ hasText: n });
const accountColorInDb = async (name: string) =>
  (await db.bankAccount.findFirstOrThrow({ where: { name } })).color;
const fam = (w: World) => w.family as never;
const acc = (w: World) =>
  w.data as { itau: AccountFixture; nubank: AccountFixture; card: CardFixture };

Given(
  /^a "Família Silva" com as contas "Itaú Mariana" e "Nubank Conjunta" e o cartão "Nubank Lucas" para cores$/,
  async ({ world }) => {
    const fx = await makeFamily();
    world.family = fx;
    world.data.itau = await makeAccount(fx, { name: "Itaú Mariana", owner: "Mariana" });
    world.data.nubank = await makeAccount(fx, { name: "Nubank Conjunta", owner: "Mariana" });
    world.data.card = await makeCard(fx, { name: "Nubank Lucas", owner: "Lucas" });
    // cores distintas entre si (o padrão do banco é Azul para todas)
    await db.bankAccount.update({ where: { id: acc(world).nubank.id }, data: { color: "GREEN" } });
    await db.creditCard.update({ where: { id: acc(world).card.id }, data: { color: "PURPLE" } });
  },
);

Given("Mariana está autenticada para cores", async ({ page, world }) => {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  world.data.loggedAs = "Mariana";
});

async function contas(page: Page) {
  await gotoReady(page, "/contas");
  await expect(page.getByRole("heading", { name: "Contas" })).toBeVisible();
}

Given(
  "que as contas e o cartão existentes usam {string}, {string} e {string}",
  async ({ world }, a: string, b: string, c: string) => {
    await db.bankAccount.update({
      where: { id: acc(world).itau.id },
      data: { color: colorKey(a) },
    });
    await db.bankAccount.update({
      where: { id: acc(world).nubank.id },
      data: { color: colorKey(b) },
    });
    await db.creditCard.update({
      where: { id: acc(world).card.id },
      data: { color: colorKey(c) },
    });
  },
);

When("Mariana cadastra a conta {string} sem escolher a cor", async ({ page }, nome: string) => {
  await contas(page);
  await page.getByRole("button", { name: "Nova conta" }).first().click();
  const d = page.getByRole("dialog", { name: "Nova conta" });
  await expect(d).toBeVisible();
  // a sugestão do cliente já aparece escolhida (não é uma das usadas)
  await expect(d.getByTestId("color-selected")).toContainText("Cor: Laranja (selecionada)");
  await d.getByLabel("Nome", { exact: true }).fill(nome);
  await d.getByLabel("Tipo", { exact: true }).selectOption({ label: "Poupança" });
  await d.getByRole("button", { name: "Salvar conta" }).click();
  await expect(d).toBeHidden();
});

Then(
  "a conta {string} recebe uma cor diferente de {string}, {string} e {string}",
  async ({ page }, nome: string, a: string, b: string, c: string) => {
    const got = await accountColorInDb(nome);
    expect([colorKey(a), colorKey(b), colorKey(c)]).not.toContain(got);
    await expect(accountCard(page, nome).locator(".source-dot")).toHaveAttribute("data-color", got);
  },
);

async function editAccountColor(page: Page, nome: string, cor: string) {
  await contas(page);
  await accountCard(page, nome)
    .getByRole("button", { name: `Ações da conta ${nome}` })
    .click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  const d = page.getByRole("dialog", { name: "Editar conta" });
  await expect(d).toBeVisible();
  await d.getByRole("radio", { name: cor, exact: true }).click();
  await expect(d.getByTestId("color-selected")).toHaveText(`Cor: ${cor} (selecionada)`);
  await d.getByRole("button", { name: "Salvar" }).click();
  await expect(d).toBeHidden();
}

When(
  "Mariana edita a conta {string} e escolhe a cor {string}",
  async ({ page }, nome: string, cor: string) => {
    await editAccountColor(page, nome, cor);
  },
);

Then("a conta {string} aparece com a cor {string}", async ({ page }, nome: string, cor: string) => {
  await expect(accountCard(page, nome).getByTestId("source-badge")).toHaveAttribute(
    "data-color",
    colorKey(cor),
  );
  expect(await accountColorInDb(nome)).toBe(colorKey(cor));
});

Given("que a conta {string} já é {string}", async ({ world }, nome: string, cor: string) => {
  const target = nome === "Itaú Mariana" ? acc(world).itau : acc(world).nubank;
  await db.bankAccount.update({ where: { id: target.id }, data: { color: colorKey(cor) } });
});

Then(
  "a alteração é salva sem erro e as duas contas mostram {string}",
  async ({ page }, cor: string) => {
    for (const n of ["Itaú Mariana", "Nubank Conjunta"]) {
      await expect(accountCard(page, n).getByTestId("source-badge")).toHaveAttribute(
        "data-color",
        colorKey(cor),
      );
    }
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  },
);

Given(
  "uma despesa na conta {string} de cor {string}",
  async ({ world }, nome: string, cor: string) => {
    await db.bankAccount.update({
      where: { id: acc(world).itau.id },
      data: { color: colorKey(cor) },
    });
    await makeTransaction(fam(world), {
      account: acc(world).itau,
      category: "Supermercado",
      amountInCents: 4590,
      occurredOn: "2026-10-02",
      description: "Feira da semana",
    });
    expect(nome).toBe("Itaú Mariana");
  },
);

async function extrato(page: Page) {
  await gotoReady(page, "/extrato");
  await expect(page.getByTestId("ledger-row").first()).toBeVisible();
}
When("Mariana abre o Extrato para cores", async ({ page }) => {
  await extrato(page);
});
When("Mariana abre o Extrato para cores em escala de cinza", async ({ page }) => {
  await extrato(page);
  await page.addStyleTag({ content: "html { filter: grayscale(1) !important; }" });
});

Then(
  "a despesa mostra um marcador {string} ao lado de {string}",
  async ({ page }, cor: string, nome: string) => {
    const row = page.getByTestId("ledger-row").filter({ hasText: "Feira da semana" });
    const badge = row.getByTestId("source-badge").filter({ hasText: nome }).first();
    await expect(badge).toHaveAttribute("data-color", colorKey(cor));
    await expect(badge.locator(".source-dot")).toHaveAttribute("data-color", colorKey(cor));
  },
);

When("Mariana abre o formulário {string} para cores", async ({ page }, titulo: string) => {
  await gotoReady(page, "/");
  await openDrawer(page);
  await expect(drawer(page)).toBeVisible();
  expect(titulo).toBe("Nova despesa");
});
When("escolhe {string} em {string}", async ({ page }, nome: string, campo: string) => {
  const select = drawer(page).getByLabel(campo, { exact: true });
  const value = await select.locator("option", { hasText: nome }).first().getAttribute("value");
  await select.selectOption(value as string);
  await fillAmount(page, "10,00");
  await pickCategory(page, "Supermercado");
});
Then(
  "o seletor {string} mostra o marcador {string} e o nome {string}",
  async ({ page }, campo: string, cor: string, nome: string) => {
    const select = drawer(page).getByLabel(campo, { exact: true });
    await expect(select.locator("option:checked")).toContainText(nome);
    await expect(drawer(page).getByTestId("select-source-dot")).toHaveAttribute(
      "data-color",
      colorKey(cor),
    );
  },
);

Then("todas as origens continuam identificáveis pelo nome", async ({ page }) => {
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).filter)).toContain(
    "grayscale",
  );
  const badges = page.getByTestId("ledger-row").getByTestId("source-badge");
  expect(await badges.count()).toBeGreaterThan(0);
  for (const b of await badges.all()) {
    if (await b.isVisible()) await expect(b).toHaveText(/\S+/);
  }
  await expect(
    page.getByTestId("ledger-row").filter({ hasText: "Feira da semana" }).first(),
  ).toContainText("Itaú Mariana");
});

Given("uma compra de cartão no {string}", async ({ world }, _cartao: string) => {
  await makeCardPurchase(fam(world), {
    card: acc(world).card,
    amountInCents: 12000,
    occurredOn: "2026-10-02",
    description: "Compra no crédito",
  });
});
When(
  "Mariana edita o cartão {string} e escolhe a cor {string}",
  async ({ page, world }, nome: string, cor: string) => {
    await gotoReady(page, "/cartoes");
    await cardItem(page, nome)
      .getByRole("button", { name: `Ações do cartão ${nome}` })
      .click();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    const d = page.getByRole("dialog", { name: "Editar cartão" });
    await expect(d).toBeVisible();
    await d.getByRole("radio", { name: cor, exact: true }).click();
    await d.getByRole("button", { name: "Salvar cartão" }).click();
    await expect(d).toBeHidden();
  },
);
Then("as compras do cartão mostram o marcador {string}", async ({ page }, cor: string) => {
  await expect(cardItem(page, "Nubank Lucas").getByTestId("source-badge")).toHaveAttribute(
    "data-color",
    colorKey(cor),
  );
  await extrato(page);
  const row = page.getByTestId("ledger-row").filter({ hasText: "Compra no crédito" });
  await expect(row.getByTestId("source-badge").first()).toHaveAttribute(
    "data-color",
    colorKey(cor),
  );
});

const toHex = (rgb: string): string => {
  const m = rgb
    .match(/\d+(\.\d+)?/g)
    ?.slice(0, 3)
    .map(Number) ?? [0, 0, 0];
  return `#${m.map((n) => Math.round(n).toString(16).padStart(2, "0")).join("")}`;
};
When(
  "Mariana alterna entre os temas {string} e {string} no seletor de cor",
  async ({ page, world }, a: string, b: string) => {
    await contas(page);
    await accountCard(page, "Itaú Mariana")
      .getByRole("button", { name: "Ações da conta Itaú Mariana" })
      .click();
    await page.getByRole("menuitem", { name: "Editar" }).click();
    const d = page.getByRole("dialog", { name: "Editar conta" });
    await expect(d).toBeVisible();
    const results: Array<{ theme: string; color: string; ratio: number }> = [];
    for (const tema of [a, b]) {
      const t = tema === "Escuro" ? "dark" : "light";
      await page.evaluate((x) => document.documentElement.setAttribute("data-theme", x), t);
      const swatches = d.getByTestId("color-option").locator(".source-dot");
      const bg = toHex(await d.evaluate((el) => getComputedStyle(el).backgroundColor));
      for (let i = 0; i < ACCOUNT_COLORS.length; i++) {
        const fill = toHex(
          await swatches.nth(i).evaluate((el) => getComputedStyle(el).backgroundColor),
        );
        results.push({
          theme: t,
          color: ACCOUNT_COLORS[i] as string,
          ratio: contrastRatio(fill, bg),
        });
      }
    }
    world.data.contrast = results;
  },
);
Then("cada cor da paleta mantém contraste mínimo contra o fundo", async ({ world }) => {
  const results = world.data.contrast as Array<{ theme: string; color: string; ratio: number }>;
  expect(results).toHaveLength(20);
  for (const r of results) expect(r.ratio, `${r.color} (${r.theme})`).toBeGreaterThanOrEqual(3);
});

Given("contas criadas antes desta entrega", async () => {
  // as contas do Contexto vieram do banco sem escolha explícita de cor: a coluna nunca é nula
  expect(await db.bankAccount.count()).toBe(2);
});
When("Mariana abre a tela {string} para cores", async ({ page }, _tela: string) => {
  await contas(page);
});
Then("cada conta aparece com uma cor", async ({ page }) => {
  const cards = page.getByTestId("account-card");
  await expect(cards).toHaveCount(2);
  for (const c of await cards.all()) {
    await expect(c.getByTestId("source-badge")).toHaveAttribute(
      "data-color",
      /^(BLUE|GREEN|PURPLE|ORANGE|PINK|TEAL|RED|YELLOW|GRAY|BROWN)$/,
    );
  }
});

When("Mariana abre o seletor de cor da conta {string}", async ({ page }, nome: string) => {
  await contas(page);
  await accountCard(page, nome)
    .getByRole("button", { name: `Ações da conta ${nome}` })
    .click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  await expect(page.getByRole("dialog", { name: "Editar conta" })).toBeVisible();
});
Then(
  "cada opção tem um nome falado por leitor de tela e a escolhida mostra {string}",
  async ({ page }, prefixo: string) => {
    const d = page.getByRole("dialog", { name: "Editar conta" });
    for (const c of ACCOUNT_COLORS) {
      await expect(d.getByRole("radio", { name: ACCOUNT_COLOR_LABEL[c], exact: true })).toHaveCount(
        1,
      );
    }
    await expect(d.getByRole("radio", { checked: true })).toHaveCount(1);
    await expect(d.getByTestId("color-selected")).toContainText(prefixo);
    await expect(d.getByTestId("color-selected")).toContainText("(selecionada)");
  },
);
