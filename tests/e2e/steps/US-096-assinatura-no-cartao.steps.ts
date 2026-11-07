import { expect, type Page, test } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { enterAs } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const dlg = (page: Page) => page.getByRole("dialog", { name: "Nova assinatura" });
const block = (page: Page) => page.getByRole("region", { name: "Assinaturas do cartão" });
const itemOf = (page: Page, nome: string) =>
  block(page).getByTestId("subscription-item").filter({ hasText: nome });

const SHOTS =
  "/tmp/claude-1000/-home-arlan-ai-tests-finance-manager/5f1caabc-bd63-4581-86ca-b9d16318acfb/scratchpad";

async function openCard(page: Page, world: World) {
  if (!world.data.consoleErrors) {
    const errors: string[] = [];
    world.data.consoleErrors = errors;
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
  }
  if (!world.data.loggedAs) await enterAs(world, page, "Lucas");
  const card = await db.creditCard.findFirstOrThrow({
    where: { familyId: world.family?.family.id },
  });
  await gotoReady(page, `/cartoes/${card.id}`);
  await expect(page.getByTestId("invoice-total")).toBeVisible();
}

async function fill(page: Page, nome: string, valor: string, dia: number, categoria: string) {
  await block(page).getByRole("button", { name: "Nova assinatura" }).click();
  const d = dlg(page);
  await expect(d).toBeVisible();
  await d.getByLabel("Descrição", { exact: true }).fill(nome);
  await d.getByLabel("Valor", { exact: true }).fill(valor);
  await d.getByLabel("Categoria", { exact: true }).selectOption({ label: categoria });
  await d.getByLabel("Dia da cobrança", { exact: true }).fill(String(dia));
}

When(
  "Lucas preenche a assinatura {string} de {string} no dia {int} com a categoria {string}",
  async ({ page }, nome: string, valor: string, dia: number, categoria: string) => {
    await fill(page, nome, valor, dia, categoria);
  },
);

Then("a frase da primeira cobrança é {string}", async ({ page }, frase: string) => {
  await expect(dlg(page).getByTestId("subscription-effect")).toHaveText(frase);
});

When("Lucas salva a assinatura", async ({ page }) => {
  await dlg(page).getByRole("button", { name: "Salvar assinatura" }).click();
  await expect(dlg(page)).toHaveCount(0);
});

Then(
  "o bloco de assinaturas mostra {string} com {string} e {string}",
  async ({ page }, nome: string, valor: string, dia: string) => {
    const item = itemOf(page, nome);
    await expect(item).toHaveCount(1);
    await expect(item).toContainText(normalizeSpaces(valor));
    await expect(item).toContainText(dia);
  },
);

Given(
  "a assinatura {string} de {string} no dia {int} cadastrada pela tela do cartão",
  async ({ page, world }, nome: string, valor: string, dia: number) => {
    await openCard(page, world);
    await fill(page, nome, valor, dia, "Moradia");
    await dlg(page).getByRole("button", { name: "Salvar assinatura" }).click();
    await expect(dlg(page)).toHaveCount(0);
    await expect(itemOf(page, nome)).toHaveCount(1);
  },
);

Given(
  /^a cobrança de nov\/2026 de "([^"]+)" foi pulada porque a fatura estava paga$/,
  async ({ world }, nome: string) => {
    const sub = await db.cardSubscription.findFirstOrThrow({
      where: { familyId: world.family?.family.id as string, description: nome },
    });
    await db.subscriptionCharge.create({
      data: {
        familyId: sub.familyId,
        subscriptionId: sub.id,
        chargeMonth: new Date("2026-11-01T00:00:00Z"),
        chargeOn: new Date("2026-11-10T00:00:00Z"),
        status: "SKIPPED_INVOICE_PAID",
      },
    });
  },
);

Then(
  "a fatura aberta mostra {string} e total {string}",
  async ({ page }, frase: string, total: string) => {
    await expect(page.getByTestId("invoice-projected-subscriptions")).toContainText(
      normalizeSpaces(frase),
    );
    await expect(page.getByTestId("invoice-total")).toHaveText(normalizeSpaces(total));
  },
);

When("Lucas recarrega a tela do cartão", async ({ page }) => {
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
  await expect(page.getByTestId("invoice-total")).toBeVisible();
});

Then(
  "a fatura aberta não mostra assinaturas previstas e o total é {string}",
  async ({ page }, total: string) => {
    await expect(page.getByTestId("invoice-total")).toHaveText(normalizeSpaces(total));
    await expect(page.getByTestId("invoice-projected-subscriptions")).toHaveCount(0);
  },
);

When("Lucas abre o Extrato para ver a assinatura", async ({ page, world }) => {
  if (!world.data.loggedAs) await enterAs(world, page, "Lucas");
  await gotoReady(page, "/extrato");
});

Then(
  "a linha {string} do Extrato tem o selo {string} e nenhuma parcela",
  async ({ page }, titulo: string, selo: string) => {
    const row = page.getByTestId("ledger-row").filter({ hasText: titulo });
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId("subscription-badge")).toHaveText(selo);
    await expect(row).not.toContainText(/\d+\/\d+ *$|· \d+\/\d+/);
  },
);

Then("o bloco de assinaturas avisa {string}", async ({ page }, aviso: string) => {
  await expect(block(page).getByTestId("subscription-skip")).toHaveText(aviso);
});

Given("o tema do sistema é escuro", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
});

Then(
  "a tela do cartão não tem rolagem horizontal e o bloco de assinaturas está visível",
  async ({ page, world }) => {
    await expect(block(page)).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/us096c-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect(world.data.consoleErrors).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  },
);
