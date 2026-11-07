import { expect, type Page } from "@playwright/test";
import {
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeTag,
  makeTransaction,
} from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import { setToday } from "../support/world";

const nb = (s: string) => s.replace(/\s/g, " ");

Given(
  /^a família da viagem com Lazer "([^"]+)" da Mariana, Transporte "([^"]+)" do Lucas e Moradia "([^"]+)" sem tag, hoje (\d{2})\/(\d{2})\/(\d{4})$/,
  async (
    { world },
    lazer: string,
    transp: string,
    mor: string,
    d: string,
    m: string,
    y: string,
  ) => {
    const { parseBRL } = await import("@/lib/money");
    const cents = (v: string) => parseBRL(v) ?? 0;
    world.family = await makeFamily();
    const itau = await makeAccount(world.family, {
      name: "Itaú Mariana",
      owner: "Mariana",
      openingBalanceInCents: 0,
    });
    const card = await makeCard(world.family, {
      name: "Nubank Lucas",
      owner: "Lucas",
      closingDay: 25,
      dueDay: 15,
    });
    await makeTransaction(world.family, {
      account: itau,
      category: "Lazer e restaurantes",
      amountInCents: cents(lazer),
      occurredOn: "2026-10-03",
      payer: "Mariana",
      tags: ["viagem-nordeste"],
    });
    await makeCardPurchase(world.family, {
      card,
      category: "Transporte",
      amountInCents: cents(transp),
      occurredOn: "2026-10-05",
      author: "Lucas",
      tags: ["viagem-nordeste"],
    });
    await makeTransaction(world.family, {
      account: itau,
      category: "Moradia",
      amountInCents: cents(mor),
      occurredOn: "2026-10-04",
      payer: "Mariana",
    });
    await makeTag(world.family, "inexistente-x");
    await setToday(`${y}-${m}-${d}`);
  },
);

async function enter(world: World, page: Page, qs: string) {
  if (world.data.loggedAs !== "Lucas") {
    await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
    world.data.loggedAs = "Lucas";
  }
  await gotoReady(page, `/analise${qs}`);
}

const tagId = async (world: World, name: string) => {
  const { testDb } = await import("../../support/db");
  const row = await testDb().tag.findFirstOrThrow({
    where: { familyId: world.family?.family.id as string, name },
  });
  return row.id;
};

When(/^abro a Análise agrupada por "([^"]+)"$/, async ({ world, page }, g: string) =>
  enter(world, page, `?groupBy=${g}`),
);

When(
  /^abro a Análise agrupada por "([^"]+)" com a tag "([^"]+)"$/,
  async ({ world, page }, g: string, tag: string) =>
    enter(world, page, `?groupBy=${g}&tagIds=${await tagId(world, tag)}`),
);

When("recarrego a página", async ({ page }) => {
  await page.reload();
});

When("limpo os filtros da análise", async ({ page }) => {
  await page.getByRole("button", { name: "Limpar filtros" }).click();
});

When("abro a linha {string} da análise", async ({ page }, label: string) => {
  await page.getByTestId("analysis-row").filter({ hasText: label }).getByRole("link").click();
});

Then(
  /^a linha "([^"]+)" da análise mostra "([^"]+)" e "([^"]+)"$/,
  async ({ page }, label: string, value: string, share: string) => {
    const row = page.getByTestId("analysis-row").filter({ hasText: label });
    await expect(row).toContainText(nb(value), { timeout: 30_000 });
    await expect(row.getByTestId("analysis-share")).toHaveText(share);
  },
);
