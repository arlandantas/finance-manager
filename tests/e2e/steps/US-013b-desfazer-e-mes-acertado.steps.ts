import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { makeTransfer } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { accountsOf, addExpense, enterAs, family, openPanel, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const dlg = (page: Page, name: string) => page.getByRole("dialog", { name });

async function quitado(world: World, page: Page, valor = "R$ 400,00") {
  await setupCouple(world);
  await addExpense(world, "Mariana", "R$ 2.000,00");
  await addExpense(world, "Mariana", "R$ 400,00");
  await addExpense(world, "Lucas", "R$ 1.200,00");
  await addExpense(world, "Lucas", "R$ 400,00");
  await enterAs(world, page, "Lucas");
  await gotoReady(page, "/acerto");
  const fx = family(world);
  const { itau, nubank } = accountsOf(world);
  const res = await page.request.post("/api/v1/settlements", {
    headers: { origin: "http://localhost:3101", "idempotency-key": randomUUID() },
    data: {
      period: "2026-10",
      fromMemberId: fx.byName.Lucas?.memberId,
      toMemberId: fx.byName.Mariana?.memberId,
      amountInCents: parseBRL(valor),
      fromAccountId: itau.id,
      toAccountId: nubank.id,
    },
  });
  expect(res.status()).toBe(201);
}

Given("que outubro foi quitado", async ({ world, page }) => {
  await quitado(world, page);
});

When("edito o valor de uma despesa comum de outubro", async ({ page }) => {
  await gotoReady(page, "/extrato");
  await page.getByTestId("ledger-row").filter({ hasText: "Supermercado" }).first().click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const form = dlg(page, "Editar lançamento");
  await form.getByLabel("Valor", { exact: true }).fill("R$ 300,00");
  await form.getByRole("button", { name: "Salvar alterações" }).click();
});

Then("vejo {string} e posso confirmar", async ({ page }, aviso: string) => {
  const d = dlg(page, "Mês já acertado");
  await expect(d).toContainText(aviso);
  await d.getByRole("button", { name: "Confirmar mesmo assim" }).click();
  await expect(page.getByText("Lançamento atualizado")).toBeVisible();
  const row = await db.transaction.findFirstOrThrow({ where: { amountInCents: 30000n } });
  expect(row.version).toBe(2);
});

Given("um acerto registrado de {string}", async ({ world, page }, valor: string) => {
  await quitado(world, page, valor);
});

When("escolho {string} e confirmo", async ({ world, page }, acao: string) => {
  await openPanel(world, page, "Lucas");
  await page.getByTestId("settlement-entry").getByRole("button", { name: acao }).click();
  const d = dlg(page, `${acao}?`);
  await expect(d).toBeVisible();
  await d.getByRole("button", { name: acao, exact: true }).click();
  await expect(page.getByText("Acerto desfeito")).toBeVisible();
});

Then(
  "as duas pernas são estornadas e o painel volta a exibir {string}",
  async ({ page }, frase: string) => {
    const legs = await db.transaction.findMany({
      where: { kind: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } },
    });
    expect(legs).toHaveLength(2);
    expect(legs.every((l) => l.deletionReason === "UNDONE")).toBe(true);
    await expect(page.getByTestId("settlement-hero")).toContainText(frase);
    await expect(page.getByTestId("settlement-entry")).toHaveCount(0);
  },
);

Given("uma transferência entre contas", async ({ world }) => {
  await setupCouple(world);
  const { itau, nubank } = accountsOf(world);
  await makeTransfer(family(world), {
    from: itau,
    to: nubank,
    amountInCents: 100000,
    occurredOn: "2026-10-03",
  });
});

When("abro o detalhe de uma transferência", async ({ world, page }) => {
  await enterAs(world, page, "Lucas");
  await gotoReady(page, "/extrato");
  await page.getByTestId("ledger-row").first().click();
  await expect(dlg(page, "Detalhe do lançamento")).toBeVisible();
});

Then("não há {string}, apenas {string}", async ({ page }, proibida: string, unica: string) => {
  const d = dlg(page, "Detalhe do lançamento");
  await expect(d.getByRole("button", { name: unica })).toBeVisible();

  await expect(d.getByText(proibida, { exact: true })).toHaveCount(0);
});
