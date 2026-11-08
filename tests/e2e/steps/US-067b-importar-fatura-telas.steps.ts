import { expect, type Page } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { buildPdf } from "../../support/pdf";
import { enterAs } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();

const CSV = [
  "data;descrição;valor",
  "10/10/2026;MERCADO BOM PRECO;150,00",
  "11/10/2026;POSTO IPIRANGA;80,00",
  "12/10/2026;ESTORNO LOJA XYZ;-20,00",
].join("\n");

const PDF_DOC = [
  "Resumo da fatura",
  "12/10 MERCADO BOM PRECO 123,45",
  "15/10 FARMACIA SAO JOAO 80,00",
  "Total da fatura R$ 203,45",
  "Vencimento 05/11/2026",
];

const calls = (world: World) => (world.data.importCalls ?? []) as string[];
const upload = (page: Page, name: string, mimeType: string, buffer: Buffer) =>
  page.setInputFiles("#imp-file", { name, mimeType, buffer });
const sendButton = (page: Page) => page.getByRole("button", { name: "Enviar arquivo" });

Given("a importação por IA está ligada para a família", async ({ world }) => {
  const fx = world.family as {
    family: { id: string };
    byName: Record<string, { memberId: string }>;
  };
  await db.aiConsentEvent.create({
    data: {
      familyId: fx.family.id,
      purpose: "INVOICE_IMPORT",
      action: "ENABLED",
      textVersion: 1,
      memberId: fx.byName.Mariana?.memberId as string,
      createdAt: new Date("2026-10-04T15:00:00Z"),
    },
  });
});

When(
  "Mariana abre a fatura {string} e toca em {string}",
  async ({ page, world }, rotulo: string, acao: string) => {
    world.data.importCalls = [];
    await enterAs(world, page, "Mariana");
    const card = await db.creditCard.findFirstOrThrow({
      where: { familyId: world.family?.family.id },
    });
    await gotoReady(page, `/cartoes/${card.id}?ref=2026-10`);
    await expect(page.getByTestId("invoice-ref")).toHaveText(rotulo);
    page.on("request", (r) => {
      const m = /invoice-imports\/(preview|extract)$/.exec(r.url());
      if (m && r.method() === "POST") calls(world).push(m[1] as string);
    });
    await page.getByRole("link", { name: acao }).click();
    await expect(page.getByRole("heading", { name: "Importar fatura" })).toBeVisible();
    await expect(page.locator("#imp-file")).toBeVisible();
  },
);

When("envia o CSV da fatura com duas compras e um estorno", async ({ page }) => {
  await upload(page, "fatura.csv", "text/csv", Buffer.from(CSV, "utf8"));
  await sendButton(page).click();
  await expect(page.getByRole("heading", { name: "Compras" })).toBeVisible();
});

When("envia o PDF da fatura", async ({ page }) => {
  await upload(page, "fatura.pdf", "application/pdf", Buffer.from(buildPdf([PDF_DOC])));
  await sendButton(page).click();
});

When("envia um arquivo de texto qualquer", async ({ page }) => {
  await upload(page, "nota.txt", "text/plain", Buffer.from("isso não é uma fatura", "utf8"));
  await sendButton(page).click();
});

Then("vê os grupos {string} e {string}", async ({ page }, a: string, b: string) => {
  for (const g of [a, b]) await expect(page.getByRole("heading", { name: g })).toBeVisible();
});

Then("vê os grupos {string}", async ({ page }, g: string) => {
  await expect(page.getByRole("heading", { name: g })).toBeVisible();
});

Then("na revisão {string} mostra {string}", async ({ page }, rotulo: string, valor: string) => {
  const id = rotulo === "Selecionados" ? "import-selected-total" : "import-difference";
  await expect(page.getByTestId(id)).toHaveText(normalizeSpaces(valor));
});

When("desmarca o item {string}", async ({ page }, nome: string) => {
  await page.getByLabel(`Selecionar ${nome}`).uncheck();
});

When("altera o valor do item {string} para {string}", async ({ page }, nome: string, v: string) => {
  const row = page
    .getByTestId("import-item")
    .filter({ has: page.getByLabel(`Selecionar ${nome}`) });
  await row.getByLabel("Valor", { exact: true }).fill(v);
});

When("confirma a importação", async ({ page }) => {
  await page.getByRole("button", { name: /^Confirmar \d+ (item|itens)$/ }).click();
});

Then(
  "vê o aviso {string} e a fatura {string} com total {string}",
  async ({ page }, aviso: string, rotulo: string, total: string) => {
    await expect(page.getByText(aviso, { exact: true })).toBeVisible();
    await expect(page.getByTestId("invoice-ref")).toHaveText(
      rotulo.replace("out/2026", "out/2026"),
    );
    await expect(page.getByTestId("invoice-total")).toHaveText(normalizeSpaces(total));
  },
);

Then("vê o aviso {string} com as linhas a enviar", async ({ page }, aviso: string) => {
  await expect(page.getByText(aviso)).toBeVisible();
  await expect(page.getByTestId("import-pdf-lines").getByText(/MERCADO BOM PRECO/)).toBeVisible();
});

Then("só a pré-visualização foi chamada", async ({ world }) => {
  expect(calls(world)).toEqual(["preview"]);
});

Then("a extração não foi chamada", async ({ world }) => {
  expect(calls(world)).not.toContain("extract");
});

When("toca no botão {string}", async ({ page }, nome: string) => {
  await page.getByRole("button", { name: nome, exact: true }).click();
});

Then("não oferece o link {string}", async ({ page }, nome: string) => {
  await expect(page.getByTestId("invoice-ref")).toBeVisible();
  await expect(page.getByRole("link", { name: nome })).toHaveCount(0);
});

When("cancela a revisão e confirma a saída", async ({ page }) => {
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.getByText("A revisão será perdida")).toBeVisible();
  await page.getByRole("button", { name: "Sair sem importar" }).click();
});

Then("vê a fatura {string} com total {string}", async ({ page }, rotulo: string, total: string) => {
  await expect(page.getByTestId("invoice-ref")).toHaveText(rotulo.replace("out/2026", "out/2026"));
  await expect(page.getByTestId("invoice-total")).toHaveText(normalizeSpaces(total));
});

Then("nenhuma compra foi importada", async () => {
  expect(await db.importBatch.count()).toBe(0);
  expect(await db.transaction.count({ where: { origin: "INVOICE_IMPORT" } })).toBe(0);
});
