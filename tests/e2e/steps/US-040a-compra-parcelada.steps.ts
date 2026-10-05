import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeCard } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { buyOnCard, fillExpense, gotoInvoice } from "../support/cartoes";
import { Given, Then, When, type World } from "../support/fixtures";
import { drawer, waitSaved } from "../support/lancamento";
import { setToday, setupFamily } from "../support/world";

const db = testDb();
const money = (v: string) => parseBRL(v) ?? 0;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const refOf = (mes: string, ano: string) =>
  `${ano}-${String(MESES.indexOf(mes) + 1).padStart(2, "0")}`;
const mainCard = (world: World) => world.data.card as { id: string; name: string };

/** Lança pela API (mesma sessão do navegador) quando o passo é só contexto do cenário. */
async function postPurchase(
  page: Page,
  world: World,
  o: { description: string; total: string; installments: number },
) {
  const category = await db.category.findFirstOrThrow({
    where: { name: "Outros", kind: "EXPENSE" },
  });
  const res = await page.request.post("/api/v1/transactions", {
    headers: { origin: "http://localhost:3101", "idempotency-key": randomUUID() },
    data: {
      type: "EXPENSE",
      cardId: mainCard(world).id,
      categoryId: category.id,
      amountInCents: money(o.total),
      description: o.description,
      installments: o.installments,
    },
  });
  expect(res.status()).toBe(201);
}

When(
  "Lucas abre a despesa no cartão, digita {string} e escolhe {string} parcelas",
  async ({ page, world }, valor: string, parcelas: string) => {
    await fillExpense(page, {
      amount: valor,
      card: mainCard(world).name,
      installments: parcelas,
      submit: false,
    });
  },
);

Then("vê a prévia {string}", async ({ page }, texto: string) => {
  await expect(drawer(page).getByTestId("installment-preview")).toHaveText(normalizeSpaces(texto));
});

When(
  "Lucas lança {string} de {string} em {string} na categoria {string}",
  async (
    { page, world },
    descricao: string,
    valor: string,
    parcelas: string,
    categoria: string,
  ) => {
    await buyOnCard(page, {
      amount: valor,
      description: descricao,
      category: categoria,
      card: mainCard(world).name,
      installments: parcelas,
    });
  },
);

When(
  "Lucas lança {string} de {string} em {string}",
  async ({ page, world }, descricao: string, valor: string, parcelas: string) => {
    await fillExpense(page, {
      amount: valor,
      description: descricao,
      card: mainCard(world).name,
      installments: parcelas,
      submit: false,
    });
    const preview = drawer(page).getByTestId("installment-preview");
    world.data.preview = (await preview.count()) > 0 ? await preview.textContent() : null;
    await drawer(page).getByRole("button", { name: "Salvar Despesa" }).click();
    await waitSaved(page);
  },
);

Given(
  "o cartão {string} com fechamento dia {int} e vencimento dia {int}",
  async ({ world }, nome: string, fecha: number, vence: number) => {
    world.data.card2 = await makeCard(await setupFamily(world), {
      name: nome,
      owner: "Lucas",
      limitInCents: 500000,
      closingDay: fecha,
      dueDay: vence,
    });
  },
);

When(
  "Lucas lança {string} de {string} em {string} no cartão {string}",
  async ({ page }, descricao: string, valor: string, parcelas: string, cartao: string) => {
    await buyOnCard(page, {
      amount: valor,
      description: descricao,
      card: cartao,
      installments: parcelas,
    });
  },
);

Then(
  /^a fatura de (\w{3})\/(\d{4}) mostra "(.+) (R\$ [\d.,]+)"$/,
  async ({ page, world }, mes: string, ano: string, titulo: string, valor: string) => {
    await gotoInvoice(page, world, refOf(mes, ano));
    const row = page.getByTestId("ledger-row").filter({ hasText: titulo }).first();
    await expect(row).toBeVisible();
    await expect(row).toContainText(normalizeSpaces(valor));
  },
);

Then(
  "o limite do cartão {string} passa a {string}",
  async ({ page }, _cartao: string, valor: string) => {
    await gotoReady(page, "/cartoes");
    await expect(page.getByTestId("card-available").first()).toHaveText(normalizeSpaces(valor));
  },
);

Then(
  "as parcelas são {string} e {string} e {string}",
  async ({}, a: string, b: string, c: string) => {
    const rows = await db.transaction.findMany({
      where: { installmentPlanId: { not: null } },
      orderBy: { installmentNo: "asc" },
    });
    expect(rows.map((r) => Number(r.amountInCents))).toEqual([money(a), money(b), money(c)]);
  },
);

Then("a soma das parcelas é {string}", async ({}, total: string) => {
  const rows = await db.transaction.findMany({ where: { installmentPlanId: { not: null } } });
  expect(rows.reduce((s, r) => s + Number(r.amountInCents), 0)).toBe(money(total));
});

Then(
  "a fatura de nov\\/2026 mostra {string} sem rótulo de parcela",
  async ({ page, world }, texto: string) => {
    await gotoInvoice(page, world, "2026-11");
    const [titulo, valor] = [texto.replace(/ R\$.*$/, ""), texto.replace(/^.* (R\$ .*)$/, "$1")];
    const row = page.getByTestId("ledger-row").filter({ hasText: titulo }).first();
    await expect(row).toContainText(normalizeSpaces(valor));
    await expect(row).not.toContainText(new RegExp(`${titulo} \\d+/\\d+`));
    expect(
      (await db.transaction.findFirstOrThrow({ where: { description: titulo } })).installmentPlanId,
    ).toBeNull();
  },
);

Then("a prévia mostrou {string}", async ({ world }, trecho: string) => {
  expect(normalizeSpaces(String(world.data.preview))).toContain(trecho);
});

Then(
  /^a parcela (\d+) tem data (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({}, n: string, d: string, m: string, y: string) => {
    const row = await db.transaction.findFirstOrThrow({ where: { installmentNo: Number(n) } });
    expect(row.occurredOn.toISOString().slice(0, 10)).toBe(`${y}-${m}-${d}`);
  },
);

Then(
  /^a parcela (\d+) está na fatura de (\w{3})\/(\d{4})$/,
  async ({}, n: string, mes: string, ano: string) => {
    const row = await db.transaction.findFirstOrThrow({
      where: { installmentNo: Number(n) },
      include: { invoice: true },
    });
    expect(row.invoice?.referenceMonth).toBe(refOf(mes, ano));
  },
);

Given(
  "que Lucas lançou {string} de {string} em {string}",
  async ({ page, world }, descricao: string, valor: string, parcelas: string) => {
    await postPurchase(page, world, {
      description: descricao,
      total: valor,
      installments: Number.parseInt(parcelas, 10),
    });
  },
);

Given("a fatura de nov\\/2026 foi fechada e paga", async ({ page, world }) => {
  await setToday("2026-11-26");
  const account = await db.bankAccount.findFirstOrThrow({ where: { name: "Itaú Lucas" } });
  const res = await page.request.post(`/api/v1/cards/${mainCard(world).id}/invoices/2026-11/pay`, {
    headers: { origin: "http://localhost:3101", "idempotency-key": randomUUID() },
    data: { accountId: account.id, expectedTotalInCents: 25000 },
  });
  expect(res.status()).toBe(201);
});

When("Lucas abre a lista de cartões", async ({ page }) => {
  await gotoReady(page, "/cartoes");
});

When(
  "Lucas tenta salvar {string} de {string} em {string}",
  async ({ page, world }, descricao: string, valor: string, parcelas: string) => {
    await fillExpense(page, {
      amount: valor,
      description: descricao,
      card: mainCard(world).name,
      installments: parcelas,
      submit: false,
    });
  },
);

Then(
  "vê o aviso de limite {string} com o botão {string}",
  async ({ page }, aviso: string, botao: string) => {
    await expect(drawer(page).getByText(aviso, { exact: true })).toBeVisible();
    await expect(drawer(page).getByRole("button", { name: botao })).toBeVisible();
  },
);

When("Lucas abre a fatura de nov\\/2026 do cartão", async ({ page, world }) => {
  await gotoInvoice(page, world, "2026-11");
});

Then("a fatura mostra {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("invoice-future-installments")).toHaveText(normalizeSpaces(texto));
});

Then(
  "o cartão {string} mostra {string} de {string}",
  async ({ page }, _cartao: string, rotulo: string, valor: string) => {
    await gotoReady(page, "/cartoes");
    await expect(page.getByTestId("card-future-installments").first()).toHaveText(
      normalizeSpaces(`${rotulo} ${valor}`),
    );
  },
);

Given("que a divisão de compras parceladas ainda não foi liberada", async () => {
  // INSTALLMENT_SPLIT_RELEASED = false até a US-042
});

When("Lucas escolhe {string} parcelas", async ({ page, world }, parcelas: string) => {
  await fillExpense(page, {
    amount: "R$ 90,00",
    card: mainCard(world).name,
    installments: parcelas,
    submit: false,
  });
});

Then("o campo {string} mostra {string}", async ({ page }, _campo: string, texto: string) => {
  await expect(drawer(page).getByTestId("split-label")).toHaveText(texto);
  await expect(drawer(page).getByRole("switch", { name: /Dividir com a família/ })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

When(
  "Lucas toca duas vezes rapidamente em {string} com {string} em {string}",
  async ({ page, world }, botao: string, valor: string, parcelas: string) => {
    await fillExpense(page, {
      amount: valor,
      description: "Notebook",
      card: mainCard(world).name,
      installments: parcelas,
      submit: false,
    });
    await drawer(page).getByRole("button", { name: botao }).dblclick();
    await waitSaved(page);
  },
);

Then("existe uma única compra parcelada com {int} parcelas", async ({}, n: number) => {
  expect(await db.installmentPlan.count()).toBe(1);
  expect(await db.transaction.count({ where: { installmentPlanId: { not: null } } })).toBe(n);
});

When("Lucas confirma a compra parcelada", async ({ page, world }) => {
  await fillExpense(page, {
    amount: "R$ 300,00",
    card: mainCard(world).name,
    installments: "3x",
    submit: "Salvar Despesa",
  });
  world.data.formCheck = async () => {
    await expect(drawer(page).getByLabel("Valor", { exact: true })).toHaveValue(/R\$\s300,00/);
    await expect(
      drawer(page).getByLabel("Parcelas", { exact: true }).locator("option:checked"),
    ).toHaveText("3x");
    await page.unroute("**/api/v1/**");
    await drawer(page).getByRole("button", { name: "Salvar Despesa" }).click();
    await waitSaved(page);
    expect(await db.installmentPlan.count()).toBe(1);
  };
});

Then("nenhuma compra parcelada é registrada", async () => {
  expect(await db.installmentPlan.count()).toBe(0);
  expect(await db.transaction.count({ where: { installmentPlanId: { not: null } } })).toBe(0);
});
