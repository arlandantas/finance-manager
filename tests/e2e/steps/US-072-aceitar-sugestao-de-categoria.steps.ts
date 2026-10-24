import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import {
  makeCard,
  makeCardPurchase,
  makeInvoice,
  makeInvoicePayment,
  makeTransaction,
} from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { accountsOf, family, setupCouple } from "../support/acerto";
import { loginAsMember } from "../support/analise";
import { Given, Then, When, type World } from "../support/fixtures";

const ORIGIN = "http://localhost:3101";
const db = testDb();
const toast = (page: Page) => page.locator("[data-sonner-toast]");
const suggestion = (page: Page, nome: string) =>
  page.getByTestId("category-suggestion").filter({ hasText: nome });

async function ensureCouple(world: World) {
  await setupCouple(world);
}

Given(
  "{int} lançamentos de {string} na categoria {string}",
  async ({ world }, n: number, descricao: string, categoria: string) => {
    await ensureCouple(world);
    const d = new Date("2026-06-02T00:00:00Z");
    for (let i = 0; i < n; i++) {
      await makeTransaction(family(world), {
        account: accountsOf(world).nubank,
        category: categoria,
        amountInCents: 4_500 + i,
        description: descricao,
        occurredOn: d.toISOString().slice(0, 10),
        author: "Mariana",
        payer: "Mariana",
        shared: true,
      });
      d.setUTCDate(d.getUTCDate() + 9);
    }
  },
);

Given(
  "o lançamento de {string} na categoria {string} em set\\/2026",
  async ({ world }, descricao: string, categoria: string) => {
    await ensureCouple(world);
    const tx = await makeTransaction(family(world), {
      account: accountsOf(world).nubank,
      category: categoria,
      amountInCents: 5_100,
      description: descricao,
      occurredOn: "2026-09-12",
      author: "Mariana",
      payer: "Mariana",
      shared: true,
    });
    world.data.txId = tx.id;
    world.data.before = { amount: 5_100, occurredOn: "2026-09-12", accountId: tx.accountId };
  },
);

Given("que a compra {string} está em uma fatura paga", async ({ world }, descricao: string) => {
  // troca o lançamento de conta por uma compra no cartão, em fatura já paga
  const fx = family(world);
  await db.transaction.delete({ where: { id: world.data.txId as string } }).catch(async () => {
    await db.$executeRaw`ALTER TABLE transactions DISABLE TRIGGER USER`;
    await db.$executeRaw`DELETE FROM transactions WHERE id = ${world.data.txId as string}::uuid`;
    await db.$executeRaw`ALTER TABLE transactions ENABLE TRIGGER USER`;
  });
  const card = await makeCard(fx, {
    name: "Nubank Lucas",
    closingDay: 25,
    dueDay: 5,
    limitInCents: 5_000_000,
  });
  const purchase = await makeCardPurchase(fx, {
    card,
    category: "Lazer e restaurantes",
    amountInCents: 5_100,
    occurredOn: "2026-09-12",
    description: descricao,
  });
  const invoice = await makeInvoice(fx, card, "2026-09");
  await makeInvoicePayment(fx, {
    card,
    invoice,
    account: accountsOf(world).nubank,
    amountInCents: 5_100,
    paidOn: "2026-09-28",
  });
  world.data.txId = purchase.id;
});

Given("que Lucas aceitou a sugestão de {string}", async ({ world, page }, _d: string) => {
  await loginAsMember(world, page, "Lucas");
  const list = await page.request.get("/api/v1/category-suggestions");
  const [s] = ((await list.json()) as { items: Array<Record<string, any>> }).items;
  const r = await page.request.post("/api/v1/category-suggestions/accept", {
    data: {
      transactionId: s?.transactionId,
      version: s?.version,
      fromCategoryId: s?.from.id,
      toCategoryId: s?.to.id,
    },
    headers: { origin: ORIGIN, "idempotency-key": randomUUID() },
  });
  expect(r.status()).toBe(200);
});

When("Lucas abre as {string}", async ({ world, page }, _aba: string) => {
  await loginAsMember(world, page, "Lucas");
  await gotoReady(page, "/analise/gastos-evitaveis?aba=sugestoes");
  await expect(page.getByRole("heading", { name: "Sugestões de categoria" })).toBeVisible();
});

Then("vê a sugestão {string}", async ({ page }, texto: string) => {
  await expect(suggestion(page, texto)).toBeVisible();
});
Then("vê a explicação da sugestão {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("category-suggestion").first()).toContainText(texto);
});

When("aceita a sugestão de {string}", async ({ page }, nome: string) => {
  await suggestion(page, nome).getByRole("button", { name: "Aceitar", exact: true }).click();
});
When("recusa a sugestão de {string}", async ({ page }, nome: string) => {
  await suggestion(page, nome).getByRole("button", { name: "Recusar" }).click();
});

const categoryOf = async (world: World) =>
  (
    await db.transaction.findUniqueOrThrow({
      where: { id: world.data.txId as string },
      include: { category: true },
    })
  ).category?.name;

Then(
  "o lançamento de {string} passa a ter a categoria {string}",
  async ({ world }, _d: string, categoria: string) => {
    await expect.poll(() => categoryOf(world)).toBe(categoria);
  },
);
Then(
  "o lançamento de {string} volta à categoria {string}",
  async ({ world }, _d: string, categoria: string) => {
    await expect.poll(() => categoryOf(world)).toBe(categoria);
  },
);
Then("a categoria do lançamento continua {string}", async ({ world }, categoria: string) => {
  expect(await categoryOf(world)).toBe(categoria);
});

Then("o valor, a data e a divisão do lançamento não mudam", async ({ world }) => {
  const before = world.data.before as { amount: number; occurredOn: string; accountId: string };
  const tx = await db.transaction.findUniqueOrThrow({
    where: { id: world.data.txId as string },
    include: { splits: true },
  });
  expect(Number(tx.amountInCents)).toBe(before.amount);
  expect(tx.occurredOn.toISOString().slice(0, 10)).toBe(before.occurredOn);
  expect(tx.accountId).toBe(before.accountId);
  expect(tx.isSharedExpense).toBe(true);
});

Then("vê o aviso de categoria {string}", async ({ page }, texto: string) => {
  await expect(toast(page).filter({ hasText: texto })).toBeVisible();
});
When("toca em {string} no aviso de categoria", async ({ page }, acao: string) => {
  await toast(page).getByRole("button", { name: acao }).click();
});

Then("não vê o botão {string} nas sugestões", async ({ page }, nome: string) => {
  await expect(page.getByTestId("category-suggestion")).toHaveCount(1);
  await expect(page.getByRole("button", { name: nome })).toHaveCount(0);
});

Then("a sugestão some", async ({ page }) => {
  await expect(page.getByTestId("category-suggestion")).toHaveCount(0);
  await expect(page.getByTestId("suggestions-empty")).toBeVisible();
});

When(
  "Mariana abre o histórico do lançamento de {string} em set\\/2026",
  async ({ world, page }, descricao: string) => {
    await loginAsMember(world, page, "Mariana");
    await gotoReady(page, "/extrato?period=2026-09");
    await page.getByTestId("ledger-row").filter({ hasText: descricao }).first().click();
    await page.getByRole("button", { name: "Histórico", exact: true }).click();
    await expect(page.getByTestId("history")).toBeVisible();
  },
);

Then("vê no histórico {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("history-source").first()).toHaveText(texto);
});
