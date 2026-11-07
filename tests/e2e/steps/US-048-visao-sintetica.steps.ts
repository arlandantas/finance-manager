import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { makeAccount, makeFamily, makeTransaction } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import { setToday } from "../support/world";

const money = (v: string) => parseBRL(v) ?? 0;
const nb = (s: string) => s.replace(/\s/g, " ");
const text = async (page: Page, id: string) => nb((await page.getByTestId(id).innerText()).trim());

Given(
  /^a família da análise com receita de "([^"]+)" e despesas de "([^"]+)", "([^"]+)" e "([^"]+)" em outubro e hoje (\d{2})\/(\d{2})\/(\d{4})$/,
  async (
    { world },
    inc: string,
    a: string,
    b: string,
    c: string,
    d: string,
    m: string,
    y: string,
  ) => {
    world.family = await makeFamily();
    const account = await makeAccount(world.family, {
      name: "Nubank Conjunta",
      owner: "Mariana",
      openingBalanceInCents: 0,
    });
    const base = { account, occurredOn: "2026-10-03" } as const;
    await makeTransaction(world.family, {
      ...base,
      type: "INCOME",
      category: "Salário",
      amountInCents: money(inc),
    });
    const list = [
      ["Supermercado", a],
      ["Moradia", b],
      ["Lazer e restaurantes", c],
    ] as const;
    for (const [category, v] of list)
      await makeTransaction(world.family, { ...base, category, amountInCents: money(v) });
    await setToday(`${y}-${m}-${d}`);
  },
);

Given("que o serviço da análise está indisponível", async ({ page }) => {
  await page.route("**/api/v1/analysis**", (r) => r.abort("failed"));
});

async function enter(world: World, page: Page, qs = "") {
  if (world.data.loggedAs !== "Lucas") {
    await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
    world.data.loggedAs = "Lucas";
  }
  await gotoReady(page, `/analise${qs}`);
}

When("abro a Análise", async ({ world, page }) => enter(world, page));

When(
  /^abro a Análise do intervalo "([^"]+)" a "([^"]+)"$/,
  async ({ world, page }, from: string, to: string) => enter(world, page, `?from=${from}&to=${to}`),
);

When("abro a primeira categoria da análise", async ({ page }) => {
  await page.getByTestId("analysis-row").first().getByRole("link").click();
});

When("navego para o mês anterior na análise", async ({ page }) => {
  await page.getByRole("button", { name: "Mês anterior" }).click();
});

When("navego para o mês seguinte na análise", async ({ page }) => {
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.getByTestId("period-label")).toHaveText("Outubro de 2026");
});

When("escolho receitas na análise", async ({ page }) => {
  await page.getByRole("tab", { name: "Receitas" }).click();
});

Then(
  /^a análise mostra receitas "([^"]+)", despesas "([^"]+)" e resultado "([^"]+)"$/,
  async ({ page }, inc: string, exp: string, res: string) => {
    await expect(page.getByTestId("analysis-income")).toHaveText(nb(inc), { timeout: 30_000 });
    expect(await text(page, "analysis-expense")).toBe(nb(exp));
    expect(await text(page, "analysis-result")).toBe(nb(res));
  },
);

Then(/^a análise lista as participações (.+)$/, async ({ page }, list: string) => {
  const expected = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  await expect(page.getByTestId("analysis-share")).toHaveText(expected as string[], {
    timeout: 30_000,
  });
});

Then("o Extrato filtrado mostra despesas {string}", async ({ page }, exp: string) => {
  await page.waitForURL(/\/extrato\?/);
  await expect(page.getByTestId("totals-expense")).toHaveText(nb(exp), { timeout: 30_000 });
});

Then("a análise diz {string}", async ({ page }, msg: string) => {
  await expect(page.getByText(msg)).toBeVisible({ timeout: 30_000 });
});

Then("a análise mostra o erro {string}", async ({ page }, msg: string) => {
  await expect(page.locator("main").getByRole("alert")).toContainText(msg, { timeout: 30_000 });
});

Then(
  /^a análise mostra a máscara no lugar dos valores e (\d+) barras$/,
  async ({ page }, n: string) => {
    await expect(page.getByTestId("analysis-bar")).toHaveCount(Number(n), { timeout: 30_000 });
    await expect(page.getByTestId("analysis-expense")).toContainText("R$ •••••");
    await expect(page.getByTestId("analysis-row").first()).toContainText("R$ •••••");
  },
);

Then(
  /^a análise mostra "([^"]+)" com o botão "([^"]+)"$/,
  async ({ page }, msg: string, btn: string) => {
    await expect(page.locator("main").getByRole("alert")).toContainText(msg, { timeout: 30_000 });
    await expect(page.getByRole("button", { name: btn })).toBeVisible();
  },
);
