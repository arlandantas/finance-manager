import { expect, type Page } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { gotoInvoice } from "../support/cartoes";
import { Given, Then, When, type World } from "../support/fixtures";
import { setToday } from "../support/world";

const db = testDb();
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const monthStart = (mes: string, ano: string) =>
  `${ano}-${String(MESES.indexOf(mes) + 1).padStart(2, "0")}-01`;
const monthEnd = (mes: string, ano: string) => {
  const m = MESES.indexOf(mes) + 1;
  return `${ano}-${String(m).padStart(2, "0")}-${String(new Date(Date.UTC(Number(ano), m, 0)).getUTCDate()).padStart(2, "0")}`;
};
const mainCard = (world: World) => world.data.card as { id: string; name: string };
const rows = (page: Page) => page.getByTestId("ledger-row");
const rowOf = (page: Page, titulo: string) => rows(page).filter({ hasText: titulo });
const parcelRow = (page: Page, parcela: string) =>
  rows(page).filter({ hasText: new RegExp(`· ${parcela.replace("/", "\\/")}`) });

async function gotoIntervalo(
  page: Page,
  world: World,
  de: [string, string],
  ate: [string, string],
  extra = "",
) {
  await gotoReady(
    page,
    `/extrato?${extra}from=${monthStart(de[0], de[1])}&to=${monthEnd(ate[0], ate[1])}`,
  );
  void world;
}

Then(
  /^as despesas de (\w{3})\/(\d{4}) no Extrato são "(.+)"$/,
  async ({ page }, mes: string, ano: string, valor: string) => {
    await gotoReady(page, `/extrato?period=${monthStart(mes, ano).slice(0, 7)}`);
    await expect(page.getByTestId("totals-expense")).toHaveText(normalizeSpaces(valor));
  },
);

When(
  /^Lucas abre o Extrato filtrado pelo cartão no intervalo de (\w{3})\/(\d{4}) a (\w{3})\/(\d{4})$/,
  async ({ page, world }, m1: string, a1: string, m2: string, a2: string) => {
    await gotoReady(
      page,
      `/extrato?cardId=${mainCard(world).id}&from=${monthStart(m1, a1)}&to=${monthEnd(m2, a2)}`,
    );
  },
);

Then(
  "vê {int} linhas {string} com rótulos {string} a {string}",
  async ({ page }, n: number, titulo: string, de: string, ate: string) => {
    await expect(rowOf(page, titulo)).toHaveCount(n);
    await expect(parcelRow(page, de)).toHaveCount(1);
    await expect(parcelRow(page, ate)).toHaveCount(1);
  },
);

When("Lucas abre o Extrato de {word}", async ({ page }, periodo: string) => {
  await gotoReady(page, `/extrato?period=${periodo}`);
});

Then(
  "vê a linha {string} com a etiqueta {string}",
  async ({ page }, titulo: string, etiqueta: string) => {
    await expect(rowOf(page, titulo).first()).toBeVisible();
    await expect(rowOf(page, titulo).first()).toContainText(normalizeSpaces(etiqueta));
  },
);

Then(
  "o Extrato de {word} não mostra a linha {string}",
  async ({ page }, periodo: string, titulo: string) => {
    await gotoReady(page, `/extrato?period=${periodo}`);
    await expect(page.getByTestId("totals-expense")).toBeVisible();
    await expect(rowOf(page, titulo)).toHaveCount(0);
  },
);

Then(
  "o Extrato de {word} mostra a linha {string}",
  async ({ page }, periodo: string, titulo: string) => {
    await gotoReady(page, `/extrato?period=${periodo}`);
    await expect(rowOf(page, titulo).first()).toBeVisible();
  },
);

When(
  "Lucas toca em {string} na parcela {string} do Extrato de {word}\\/{int} a {word}\\/{int}",
  async (
    { page, world },
    rotulo: string,
    parcela: string,
    m1: string,
    a1: number,
    m2: string,
    a2: number,
  ) => {
    await gotoIntervalo(page, world, [m1, String(a1)], [m2, String(a2)]);
    await parcelRow(page, parcela).first().locator("xpath=..").getByTestId("view-plan").click();
    void rotulo;
  },
);

Then(
  "vê o total {string} e as {int} parcelas com a fatura de cada uma",
  async ({ page }, total: string, n: number) => {
    const d = page.getByRole("dialog", { name: "Compra parcelada" });
    await expect(d.getByTestId("plan-total")).toHaveText(normalizeSpaces(total));
    await expect(d.getByTestId("plan-parcel")).toHaveCount(n);
    await expect(d.getByTestId("plan-parcel").nth(2)).toContainText("jan/2027");
  },
);

async function openFirstParcel(page: Page, world: World) {
  await gotoReady(page, `/extrato?cardId=${mainCard(world).id}&from=2026-11-01&to=2027-08-31`);
  await rows(page).first().click();
}

async function excluirPeloDetalhe(page: Page, world: World) {
  await openFirstParcel(page, world);
  await page.getByRole("button", { name: "Excluir compra parcelada" }).click();
}

When("Lucas exclui a compra parcelada pelo detalhe e confirma", async ({ page, world }) => {
  await excluirPeloDetalhe(page, world);
  await page
    .getByRole("dialog", { name: "Excluir compra parcelada?" })
    .getByRole("button", { name: "Excluir compra parcelada" })
    .click();
  await expect(page.getByText("Compra parcelada excluída")).toBeVisible();
});

Given("Lucas excluiu a compra parcelada pelo detalhe", async ({ page, world }) => {
  await excluirPeloDetalhe(page, world);
  await page
    .getByRole("dialog", { name: "Excluir compra parcelada?" })
    .getByRole("button", { name: "Excluir compra parcelada" })
    .click();
  await expect(page.getByText("Compra parcelada excluída")).toBeVisible();
});

When("Lucas desfaz pelo aviso", async ({ page }) => {
  await page.getByRole("button", { name: "Desfazer" }).click();
  await expect(page.getByText("Compra parcelada restaurada")).toBeVisible();
});

Then("nenhuma fatura mostra {string}", async ({ page, world }, titulo: string) => {
  expect(await db.transaction.count({ where: { description: titulo, deletedAt: null } })).toBe(0);
  for (const ref of ["2026-11", "2026-12"]) {
    await gotoInvoice(page, world, ref);
    await expect(rowOf(page, titulo)).toHaveCount(0);
  }
});

Then(/^o limite disponível do cartão volta a "(.+)"$/, async ({ page }, valor: string) => {
  await gotoReady(page, "/cartoes");
  await expect(page.getByTestId("card-available").first()).toHaveText(normalizeSpaces(valor));
});

Then("as {int} parcelas voltam às suas faturas", async ({ page, world }, n: number) => {
  expect(
    await db.transaction.count({ where: { installmentPlanId: { not: null }, deletedAt: null } }),
  ).toBe(n);
  await gotoInvoice(page, world, "2026-12");
  await expect(rowOf(page, "Notebook 2/10")).toHaveCount(1);
});

Given("a fatura de nov\\/2026 está fechada e não paga", async () => {
  await setToday("2026-11-26");
});

When("Lucas tenta excluir a compra parcelada pelo detalhe", async ({ page, world }) => {
  await excluirPeloDetalhe(page, world);
  await page
    .getByRole("dialog", { name: "Excluir compra parcelada?" })
    .getByRole("button", { name: "Excluir compra parcelada" })
    .click();
});

Then("a tela mostra {string}", async ({ page }, texto: string) => {
  await expect(page.getByRole("alert").filter({ hasText: texto }).first()).toBeVisible();
});

Then("nenhuma parcela é excluída", async () => {
  expect(
    await db.transaction.count({ where: { installmentPlanId: { not: null }, deletedAt: null } }),
  ).toBe(10);
});

When("Lucas abre o detalhe da parcela {string}", async ({ page, world }, parcela: string) => {
  await gotoReady(page, `/extrato?cardId=${mainCard(world).id}&from=2026-11-01&to=2027-08-31`);
  await parcelRow(page, parcela).first().click();
  await expect(page.getByRole("dialog", { name: "Detalhe do lançamento" })).toBeVisible();
});

Then("o detalhe da parcela não tem {string}", async ({ page }, botao: string) => {
  const d = page.getByRole("dialog", { name: "Detalhe do lançamento" });
  await expect(d.getByRole("button", { name: botao, exact: true })).toHaveCount(0);
});

Then("o detalhe da parcela tem {string}", async ({ page }, botao: string) => {
  const d = page.getByRole("dialog", { name: "Detalhe do lançamento" });
  await expect(d.getByRole("button", { name: botao, exact: true })).toBeVisible();
});

When("Lucas escolhe no Extrato um intervalo de {int} meses", async ({ page }, _n: number) => {
  await gotoReady(page, "/extrato?from=2026-11-01&to=2028-11-30");
});
