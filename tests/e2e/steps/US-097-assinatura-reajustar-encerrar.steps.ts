import { expect, type Page, test } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();
const dlg = (page: Page) => page.getByRole("dialog", { name: "Editar assinatura" });
const SHOTS =
  "/tmp/claude-1000/-home-arlan-ai-tests-finance-manager/5f1caabc-bd63-4581-86ca-b9d16318acfb/scratchpad";

const subOf = (familyId: string, nome: string) =>
  db.cardSubscription.findFirstOrThrow({ where: { familyId, description: nome } });

When(/^(?:Lucas|Mariana) abre a assinatura "([^"]+)"$/, async ({ page }, nome: string) => {
  await page
    .getByRole("region", { name: "Assinaturas do cartão" })
    .getByTestId("subscription-item")
    .filter({ hasText: nome })
    .getByTestId("subscription-open")
    .click();
  await expect(dlg(page)).toBeVisible();
});

When(
  "Lucas altera o valor para {string} a partir de {string}",
  async ({ page }, valor: string, mes: string) => {
    await dlg(page).getByLabel("Valor", { exact: true }).fill(valor);
    await dlg(page).getByLabel("A partir de", { exact: true }).selectOption({ label: mes });
  },
);

Then("o aviso de impacto é {string}", async ({ page }, texto: string) => {
  await expect(dlg(page).getByTestId("subscription-impact")).toHaveText(normalizeSpaces(texto));
});

When("Lucas salva as alterações da assinatura", async ({ page }) => {
  await dlg(page).getByRole("button", { name: "Salvar alterações" }).click();
  await expect(dlg(page)).toHaveCount(0);
});

When("Lucas tenta salvar as alterações da assinatura", async ({ page }) => {
  await dlg(page).getByRole("button", { name: "Salvar alterações" }).click();
});

Then("o aviso de erro diz {string}", async ({ page }, texto: string) => {
  await expect(dlg(page).getByRole("alert").first()).toHaveText(texto);
});

Then(
  "a família tem a assinatura {string} com {int} valores, o último {string} a partir de {string}",
  async ({ world }, nome: string, qtd: number, valor: string, mes: string) => {
    const familyId = world.family?.family.id as string;
    const sub = await subOf(familyId, nome);
    const rows = await db.cardSubscriptionAmount.findMany({
      where: { familyId, subscriptionId: sub.id },
      orderBy: [{ fromMonth: "asc" }, { createdAt: "asc" }],
    });
    expect(rows).toHaveLength(qtd);
    const last = rows[rows.length - 1];
    const reais = (Number(last?.amountInCents) / 100).toFixed(2).replace(".", ",");
    expect(`R$ ${reais}`).toBe(normalizeSpaces(valor).replace(/\s/g, " "));
    expect(last?.fromMonth.toISOString().slice(0, 7)).toBe(mes);
  },
);

Then(
  /^a cobrança de nov\/2026 de "([^"]+)" continua em "([^"]+)"$/,
  async ({ world }, nome: string, valor: string) => {
    const familyId = world.family?.family.id as string;
    const sub = await subOf(familyId, nome);
    const charge = await db.subscriptionCharge.findFirstOrThrow({
      where: { familyId, subscriptionId: sub.id, status: "POSTED" },
      include: { transaction: true },
    });
    const reais = (Number(charge.transaction?.amountInCents) / 100).toFixed(2).replace(".", ",");
    expect(`R$ ${reais}`).toBe(normalizeSpaces(valor).replace(/\s/g, " "));
    expect(charge.isAmended).toBe(false);
  },
);

When("Lucas pede para encerrar a assinatura", async ({ page }) => {
  await dlg(page).getByRole("button", { name: "Encerrar assinatura" }).click();
});

Then("a confirmação de encerrar a assinatura diz {string}", async ({ page }, texto: string) => {
  await expect(dlg(page).getByRole("alertdialog")).toContainText(texto);
});

When("Lucas confirma o encerramento", async ({ page }) => {
  await dlg(page).getByRole("button", { name: "Confirmar encerramento" }).click();
  await expect(dlg(page)).toHaveCount(0);
});

Then("o bloco de assinaturas mostra {string}", async ({ page }, texto: string) => {
  await expect(page.getByRole("region", { name: "Assinaturas do cartão" })).toContainText(texto);
});

Then(
  "a assinatura {string} da família está encerrada e a cobrança lançada continua",
  async ({ world }, nome: string) => {
    const familyId = world.family?.family.id as string;
    const sub = await subOf(familyId, nome);
    expect(sub.endedAt).not.toBeNull();
    expect(sub.nextChargeOn).toBeNull();
    const posted = await db.subscriptionCharge.count({
      where: { familyId, subscriptionId: sub.id, status: "POSTED" },
    });
    expect(posted).toBe(1);
    expect(
      await db.transaction.count({ where: { familyId, origin: "SUBSCRIPTION", deletedAt: null } }),
    ).toBe(1);
  },
);

Given(
  /^a cobrança de nov\/2026 de "([^"]+)" foi corrigida no Extrato$/,
  async ({ page, world }, nome: string) => {
    // o lançamento preguiçoso roda ao abrir o Extrato; aqui só garantimos a cobrança e marcamos
    const familyId = world.family?.family.id as string;
    const sub = await subOf(familyId, nome);
    await page.request.get("/api/v1/subscriptions");
    await db.subscriptionCharge.updateMany({
      where: { familyId, subscriptionId: sub.id },
      data: { isAmended: true },
    });
  },
);

Given("a assinatura {string} passa a ser de Mariana", async ({ world }, nome: string) => {
  const familyId = world.family?.family.id as string;
  const mariana = await db.member.findFirstOrThrow({
    where: { familyId, user: { name: { startsWith: "Mariana" } } },
  });
  await db.cardSubscription.updateMany({
    where: { familyId, description: nome },
    data: { payerMemberId: mariana.id, authorMemberId: mariana.id },
  });
});

Then("a linha {string} do Extrato tem o selo {string}", async ({ page }, titulo, selo) => {
  const row = page.getByTestId("ledger-row").filter({ hasText: titulo });
  await expect(row).toHaveCount(1);
  await expect(row.getByTestId("subscription-amended-badge")).toHaveText(selo);
});

Then(
  "a edição da assinatura não tem rolagem horizontal e não há erros no console",
  async ({ page, world }) => {
    await expect(dlg(page).getByTestId("subscription-impact")).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/us097-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect(world.data.consoleErrors).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  },
);
