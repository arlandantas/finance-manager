import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { makePlannedExpense } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { dlg } from "../support/categorias";
import { Given, Then, When } from "../support/fixtures";
import { PERIOD_NOV } from "../support/previstas";
import { setupFamily } from "../support/world";

const money = (v: string) => parseBRL(v) ?? 0;
const iso = (d: string, m: string, y: string) => `${y}-${m}-${d}`;
const DATE = String.raw`(\d{2})\/(\d{2})\/(\d{4})`;

Given(
  new RegExp(
    String.raw`^a receita prevista "([^"]+)" de "([^"]+)" com data esperada ${DATE} e responsável "([^"]+)"$`,
  ),
  async ({ world }, nome: string, valor: string, d: string, m: string, y: string, resp: string) => {
    await makePlannedExpense(await setupFamily(world), {
      kind: "INCOME",
      description: nome,
      amountInCents: money(valor),
      dueOn: iso(d, m, y),
      responsible: resp,
    });
  },
);

async function openReceber(page: import("@playwright/test").Page) {
  await gotoReady(page, `/previstas?period=${PERIOD_NOV}&tab=receber`);
  await expect(page.getByRole("heading", { level: 1, name: "Previstas" })).toBeVisible();
}

When(
  new RegExp(
    String.raw`^Lucas cadastra a receita prevista "([^"]+)" de "([^"]+)" com data esperada ${DATE}$`,
  ),
  async ({ page }, nome: string, valor: string, d: string, m: string, y: string) => {
    await openReceber(page);
    await page.getByRole("button", { name: "Nova receita prevista" }).first().click();
    const dr = dlg(page, "Nova receita prevista");
    await expect(dr).toBeVisible();
    await dr.getByLabel("Descrição", { exact: true }).fill(nome);
    await dr.getByLabel("Valor previsto", { exact: true }).fill(valor);
    await dr.getByRole("radio", { name: "Salário", exact: true }).click();
    await dr.getByText("Mais detalhes").click();
    await dr.getByLabel("Data esperada", { exact: true }).fill(iso(d, m, y));
    await dr.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(dr).toBeHidden();
  },
);

Then(
  'a aba "A receber" lista {string} com o total {string}',
  async ({ page }, nome: string, total: string) => {
    await openReceber(page);
    await expect(page.getByTestId("receivable-item").filter({ hasText: nome })).toBeVisible();
    await expect(page.getByTestId("receivables-total")).toContainText(total.replace(/\s/g, " "));
  },
);

When("Lucas abre a Home de novembro", async ({ page }) => {
  await gotoReady(page, `/?period=${PERIOD_NOV}`);
});

Then('o Resumo do Mês mostra "A receber" com {string}', async ({ page }, valor: string) => {
  await expect(page.getByTestId("home-toreceive")).toContainText(valor);
});

Then("o Resumo do Mês mostra {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("home-summary")).toContainText(texto);
});

When(
  "Lucas recebe {string} por {string} na conta {string}",
  async ({ page }, nome: string, valor: string, conta: string) => {
    await openReceber(page);
    await page.getByRole("button", { name: `Receber ${nome}`, exact: true }).click();
    const dr = dlg(page, "Receber receita prevista");
    await expect(dr).toBeVisible();
    await dr.getByLabel("Valor recebido").fill(valor);
    const select = dr.getByLabel("Conta de destino", { exact: true });
    const value = await select.locator("option", { hasText: conta }).first().getAttribute("value");
    await select.selectOption(value as string);
    await dr.getByRole("button", { name: "Confirmar recebimento" }).click();
    await expect(dr).toBeHidden();
  },
);

When('Lucas abre a aba "A receber" de novembro', async ({ page }) => {
  await openReceber(page);
});

Then("a receita {string} mostra o selo {string}", async ({ page }, nome: string, selo: string) => {
  await expect(
    page.getByTestId("receivable-item").filter({ hasText: nome }).getByText(selo),
  ).toBeVisible();
});

When("Lucas abre a edição da receita prevista {string}", async ({ page }, nome: string) => {
  await openReceber(page);
  await page.getByRole("button", { name: `Ações de ${nome}` }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  await expect(dlg(page, "Editar receita prevista")).toBeVisible();
});

Then("a edição mostra {string}", async ({ page }, texto: string) => {
  await expect(dlg(page, "Editar receita prevista")).toContainText(texto);
  await expect(
    dlg(page, "Editar receita prevista").getByRole("radio", { name: "Despesa prevista" }),
  ).toHaveCount(0);
});
