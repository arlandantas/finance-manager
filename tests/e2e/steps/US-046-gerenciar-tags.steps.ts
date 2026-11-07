import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily, makeTag, makeTransaction } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();

Given("a família Silva com as tags viagem, viajem e ferias", async ({ world }) => {
  world.family = await makeFamily();
  const account = await makeAccount(world.family, {
    name: "Nubank",
    owner: "Mariana",
    openingBalanceInCents: 900000,
  });
  const base = { account, category: "Supermercado", occurredOn: "2026-07-10" } as const;
  for (const [tag, n] of [
    ["viagem", 5],
    ["viajem", 3],
  ] as const) {
    for (let i = 0; i < n; i++) {
      await makeTransaction(world.family, {
        ...base,
        amountInCents: 1000 + i,
        description: `${tag} ${i}`,
        tags: [tag],
      });
    }
  }
  await makeTag(world.family, "ferias");
});

async function abrir(page: Page, email: string, name: string) {
  await loginAs(page, { email, name });
  await gotoReady(page, "/tags");
}

Given("Mariana está autenticada na tela de Tags", async ({ page }) => {
  await abrir(page, "mariana@exemplo.com", "Mariana Silva");
});

Given("Lucas está autenticado na tela de Tags", async ({ page }) => {
  await abrir(page, "lucas@exemplo.com", "Lucas Silva");
});

const item = (page: Page, name: string) =>
  page.getByTestId("tag-item").filter({ has: page.getByText(name, { exact: true }) });

async function action(page: Page, tag: string, label: string) {
  await expect(item(page, tag)).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: `Ações da tag ${tag}` }).click();
  await page.getByRole("menuitem", { name: label }).click();
}

Then(
  "a lista de tags mostra {string} com {string}, {string} com {string} e {string} com {string}",
  async ({ page }, a: string, ua: string, b: string, ub: string, c: string, uc: string) => {
    const rows = page.getByTestId("tag-item");
    await expect(rows).toHaveCount(3, { timeout: 30_000 });
    for (const [i, n, u] of [
      [0, a, ua],
      [1, b, ub],
      [2, c, uc],
    ] as const) {
      await expect(rows.nth(i)).toContainText(n);
      await expect(rows.nth(i)).toContainText(u);
    }
  },
);

Then("a lista de tags mostra {string} com {string}", async ({ page }, n: string, u: string) => {
  await expect(item(page, n)).toContainText(u, { timeout: 30_000 });
});

When(
  "Mariana tenta renomear {string} para {string}",
  async ({ page }, from: string, to: string) => {
    await action(page, from, "Renomear");
    const d = page.getByRole("dialog", { name: "Renomear tag" });
    await d.getByLabel("Nome").fill(to);
    await d.getByRole("button", { name: "Salvar" }).click();
  },
);

Then("a tag mostra o erro {string}", async ({ page }, msg: string) => {
  await expect(page.getByRole("dialog").getByRole("alert")).toHaveText(msg);
});

Then("vê a oferta {string}", async ({ page }, msg: string) => {
  await expect(page.getByRole("dialog").getByText(msg)).toBeVisible();
});

When("Mariana mescla {string} em {string}", async ({ page }, from: string, into: string) => {
  await action(page, from, "Mesclar");
  const d = page.getByRole("dialog", { name: "Mesclar tag" });
  await d.getByLabel("Mesclar em").selectOption({ label: into });
  await d.getByRole("button", { name: "Mesclar" }).click();
  await expect(d).toBeHidden();
});

When("Lucas remove a tag {string}", async ({ page }, tag: string) => {
  await action(page, tag, "Remover");
  const d = page.getByRole("dialog", { name: "Remover tag" });
  await d.getByRole("button", { name: "Remover" }).click();
  await expect(d).toBeHidden();
});

Then("a tag {string} não existe mais", async ({ page }, tag: string) => {
  await expect(item(page, tag)).toHaveCount(0);
});

Then("os 5 lançamentos continuam existindo", async ({ world }) => {
  expect(
    await db.transaction.count({
      where: { familyId: world.family?.family.id, description: { startsWith: "viagem " } },
    }),
  ).toBe(5);
});
