import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import {
  accountsOf,
  addExpense,
  enterAs,
  family,
  memberCard,
  openPanel,
  setupCouple,
} from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const drawer = (page: Page) => page.getByRole("dialog", { name: "Registrar acerto" });

Given("o acerto de outubro: {string}", async ({ world }, _frase: string) => {
  await setupCouple(world);
  await addExpense(world, "Mariana", "R$ 2.000,00");
  await addExpense(world, "Mariana", "R$ 400,00");
  await addExpense(world, "Lucas", "R$ 1.200,00");
  await addExpense(world, "Lucas", "R$ 400,00");
});

async function openSettle(world: World, page: Page, as: "Lucas" | "Mariana" = "Lucas") {
  await openPanel(world, page, as);
  await page.getByRole("button", { name: "Registrar acerto" }).click();
  await expect(drawer(page)).toBeVisible();
  await expect(drawer(page).getByLabel("Valor", { exact: true })).toBeFocused();
}

async function submitSettle(page: Page, valor?: string) {
  if (valor) await drawer(page).getByLabel("Valor", { exact: true }).fill(valor);
  await drawer(page).getByRole("button", { name: "Continuar" }).click();
}

/** Registra o acerto pela API com a sessão do navegador (atalho de contexto). */
async function registerViaApi(world: World, page: Page, valor: string) {
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

When(
  "Lucas toca em {string} e escolhe a conta origem {string} e a conta destino {string}",
  async ({ world, page }, _botao: string, origem: string, destino: string) => {
    await openSettle(world, page);
    await drawer(page).getByLabel("Conta de origem").selectOption({ label: origem });
    await drawer(page).getByLabel("Conta de destino").selectOption({ label: destino });
  },
);

When("confirma o valor sugerido de {string}", async ({ page }, valor: string) => {
  const atual = await drawer(page).getByLabel("Valor", { exact: true }).inputValue();
  expect(normalizeSpaces(atual)).toBe(valor);
  await submitSettle(page);
  await expect(drawer(page).getByTestId("settle-summary")).toContainText(
    "Itaú Lucas → Nubank Mariana",
  );
  await drawer(page).getByRole("button", { name: "Confirmar acerto" }).click();
  await expect(drawer(page)).toBeHidden();
});

Then(
  "{string} é debitada em {string} e {string} é creditada em {string}",
  async ({}, a: string, av: string, b: string, bv: string) => {
    const leg = async (name: string, kind: "TRANSFER_OUT" | "TRANSFER_IN") =>
      db.transaction.findFirstOrThrow({ where: { kind, account: { name } } });
    expect((await leg(a, "TRANSFER_OUT")).amountInCents).toBe(BigInt(parseBRL(av) ?? 0));
    expect((await leg(b, "TRANSFER_IN")).amountInCents).toBe(BigInt(parseBRL(bv) ?? 0));
  },
);

Then("a transferência é marcada como {string}", async ({}, rotulo: string) => {
  const g = await db.transferGroup.findFirstOrThrow({
    where: { kind: "SETTLEMENT" },
    include: { legs: true },
  });
  expect(g.settlementPeriod).toBe("2026-10");
  expect(g.legs.every((l) => l.description === rotulo)).toBe(true);
});

Then("o painel passa a exibir {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("settlement-hero")).toContainText(texto);
});

When("Lucas registra {string} como acerto", async ({ world, page }, valor: string) => {
  await openSettle(world, page);
  await submitSettle(page, valor);
  await drawer(page).getByRole("button", { name: "Confirmar acerto" }).click();
  await expect(drawer(page)).toBeHidden();
});

Then("o painel exibe {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("settlement-hero")).toContainText(texto);
});

When("Lucas informa {string} no acerto", async ({ world, page }, valor: string) => {
  await openSettle(world, page);
  await submitSettle(page, valor);
});

Then("vê {string} e nada é registrado", async ({ page }, msg: string) => {
  await expect(drawer(page).getByText(msg.replace(/ /g, " "))).toBeVisible();
  expect(await db.transferGroup.count()).toBe(0);
});

Given("que o acerto de {string} foi registrado", async ({ world, page }, valor: string) => {
  await registerViaApi(world, page, valor);
});

Given("que o mês foi quitado", async ({ world, page }) => {
  await registerViaApi(world, page, "R$ 400,00");
});

When("consulto totais de despesas e receitas após o acerto", async ({ page }) => {
  await gotoReady(page, "/extrato");
  await expect(page.getByTestId("totals-income")).toBeVisible();
});

Then("o acerto não é contabilizado em nenhum deles", async ({ page }) => {
  await expect(page.getByTestId("totals-income")).toHaveText(/R\$\s0,00/);
  await expect(page.getByTestId("totals-expense")).toContainText("4.000,00");
});

When("abro o painel após o acerto", async ({ world, page }) => {
  await openPanel(world, page, "Lucas");
});

Then("vejo {string} com as contas usadas", async ({ page }, frase: string) => {
  const entry = page.getByTestId("settlement-entry");
  await expect(entry).toContainText(frase.replace(/ /g, " "));
  await expect(entry).toContainText("Itaú Lucas → Nubank Mariana");
});

When("Mariana lança nova despesa comum de {string}", async ({ world, page }, valor: string) => {
  await addExpense(world, "Mariana", valor, { occurredOn: "2026-10-04" });
  await openPanel(world, page, "Lucas");
});

When("preencho o acerto e toco duas vezes em {string}", async ({ world, page }, botao: string) => {
  await openSettle(world, page);
  await submitSettle(page);
  await drawer(page).getByRole("button", { name: botao }).dblclick();
  await expect(drawer(page)).toBeHidden();
});

Then("apenas um acerto é registrado", async () => {
  expect(await db.transferGroup.count({ where: { kind: "SETTLEMENT" } })).toBe(1);
  expect(
    await db.transaction.count({ where: { kind: { in: ["TRANSFER_OUT", "TRANSFER_IN"] } } }),
  ).toBe(2);
});

When("escolho a mesma conta nos dois campos do acerto", async ({ world, page }) => {
  await openSettle(world, page);
  await drawer(page).getByLabel("Conta de destino").selectOption({ label: "Itaú Lucas" });
  await drawer(page).getByLabel("Conta de origem").selectOption({ label: "Itaú Lucas" });
  await submitSettle(page);
});

// referência para evitar import não usado em refatorações futuras
void memberCard;
