import { expect, type Page } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily, makeTransaction } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();

Given("a família Silva com lançamentos de julho de 2026 e as tags da viagem", async ({ world }) => {
  world.family = await makeFamily();
  const acc = await makeAccount(world.family, {
    name: "Nubank Conjunta",
    owner: "Mariana",
    openingBalanceInCents: 900000,
  });
  world.data.account = acc;
  const base = { account: acc, occurredOn: "2026-07-10", author: "Mariana" } as const;
  const hotel = await makeTransaction(world.family, {
    ...base,
    category: "Lazer e restaurantes",
    amountInCents: 80000,
    description: "Hotel",
    tags: ["viagem-nordeste"],
  });
  world.data.hotelId = hotel.id;
  await makeTransaction(world.family, {
    ...base,
    category: "Lazer e restaurantes",
    amountInCents: 25000,
    description: "Restaurante",
    tags: ["viagem-nordeste"],
  });
  await makeTransaction(world.family, {
    ...base,
    category: "Supermercado",
    amountInCents: 30000,
    description: "Mercado",
  });
  await makeTransaction(world.family, {
    ...base,
    category: "Transporte",
    amountInCents: 60000,
    description: "Passagem",
    tags: ["viagem-nordeste", "ferias"],
  });
});

async function abrir(page: Page, world: World, qs: string) {
  if (world.data.loggedAs !== "Lucas") {
    await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
    world.data.loggedAs = "Lucas";
  }
  await gotoReady(page, `/extrato?${qs}`);
}

Given("Lucas está autenticado no Extrato de julho de 2026", async ({ page, world }) => {
  await abrir(page, world, "period=2026-07");
  await expect(page.getByTestId("ledger-row")).toHaveCount(4, { timeout: 30_000 }); // 1ª compilação do dev server
});

/** Abre o painel "Filtros" (gaveta), marca a tag e fecha. */
async function marcarTag(page: Page, tag: string) {
  await page.getByRole("button", { name: /^Filtros/ }).click();
  const d = page.getByRole("dialog", { name: "Filtros" });
  await d.getByLabel(tag, { exact: true }).click(); // a URL (e o estado marcado) atualiza depois do clique
  await expect(page.getByTestId("tag-filter-chips")).toContainText(tag);
  await d.getByRole("button", { name: "Ver resultados" }).click();
  await expect(d).toBeHidden();
}

When("Lucas filtra pela tag {string}", async ({ page }, tag: string) => {
  await marcarTag(page, tag);
});

When("Lucas filtra pelas tags {string} e {string}", async ({ page }, a: string, b: string) => {
  await marcarTag(page, a);
  await marcarTag(page, b);
});

When("Lucas filtra pela categoria {string}", async ({ page }, categoria: string) => {
  await page.getByRole("button", { name: /^Filtros/ }).click();
  const d = page.getByRole("dialog", { name: "Filtros" });
  await d.getByLabel(/^Categoria/).selectOption({ label: categoria });
  await d.getByRole("button", { name: "Ver resultados" }).click();
});

const rows = (page: Page) => page.getByTestId("ledger-row");
/** Linha pelo título exato (a categoria "Lazer e restaurantes" também contém "Restaurante"). */
const rowOf = (page: Page, desc: string) =>
  rows(page).filter({ has: page.getByText(desc, { exact: true }) });

Then(
  "a lista mostra {string}, {string} e {string}",
  async ({ page }, a: string, b: string, c: string) => {
    await expect(rows(page)).toHaveCount(3);
    for (const d of [a, b, c]) await expect(rowOf(page, d)).toHaveCount(1);
  },
);

Then("a lista não mostra {string}", async ({ page }, d: string) => {
  await expect(rowOf(page, d)).toHaveCount(0);
});

Then("a lista mostra {string} uma única vez", async ({ page }, d: string) => {
  await expect(rowOf(page, d)).toHaveCount(1);
  await expect(rows(page)).toHaveCount(3);
});

Then("a lista mostra apenas {string}", async ({ page }, d: string) => {
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText(d);
});

When(
  "Lucas filtra pela tag {string} no Extrato de agosto de 2026",
  async ({ page, world }, tag: string) => {
    await abrir(page, world, "period=2026-08");
    await marcarTag(page, tag);
  },
);

Then("vê a mensagem do filtro {string}", async ({ page }, msg: string) => {
  await expect(page.getByText(msg, { exact: true })).toBeVisible();
});

Given("que {string} foi excluído", async ({ world }, desc: string) => {
  const t = await db.transaction.findFirstOrThrow({
    where: { description: desc, familyId: world.family?.family.id },
  });
  await db.transaction.update({
    where: { id: t.id },
    data: {
      deletedAt: new Date(),
      deletionReason: "DELETED",
      deletedByMemberId: t.authorMemberId,
    },
  });
});

When("Lucas filtra pela tag {string} e recarrega a página", async ({ page }, tag: string) => {
  await marcarTag(page, tag);
  await expect(page).toHaveURL(/tagIds=/);
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
});

Then("o filtro de tag {string} continua aplicado", async ({ page }, tag: string) => {
  await expect(page.getByTestId("tag-filter-chips")).toContainText(tag);
  await expect(rows(page)).toHaveCount(3);
});

When(
  "Lucas abre o Extrato pelo link de {string} de julho de 2026",
  async ({ page, world }, _rotulo: string) => {
    await abrir(page, world, "period=2026-07&untagged=true");
  },
);

Given(
  "que Lucas abriu o Extrato pelo link de {string}",
  async ({ page, world }, _rotulo: string) => {
    await abrir(page, world, "period=2026-07&untagged=true");
    await expect(rows(page)).toHaveCount(1);
  },
);

Then("o chip {string} está aplicado", async ({ page }, chip: string) => {
  await expect(page.getByTestId("untagged-chip")).toHaveText(chip);
});

Given("que Lucas filtrou pela tag {string}", async ({ page, world }, tag: string) => {
  await abrir(page, world, "period=2026-07");
  await marcarTag(page, tag);
  await expect(rows(page)).toHaveCount(3);
});

When("Lucas toca em {string} do Extrato", async ({ page }, nome: string) => {
  await page.getByRole("button", { name: nome }).click();
});

Then("a lista mostra {string} de novo", async ({ page }, d: string) => {
  await expect(rows(page)).toHaveCount(4);
  await expect(rowOf(page, d)).toHaveCount(1);
});
