import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeCard, makeCardPurchase } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { openPanel } from "../support/acerto";
import { buyOnCard, chooseSource, fillExpense, todayOf } from "../support/cartoes";
import { Given, Then, When } from "../support/fixtures";
import { drawer, openDrawer, waitSaved } from "../support/lancamento";
import { setToday, setupFamily } from "../support/world";

const db = testDb();
const money = (v: string) => parseBRL(v) ?? 0;
const card = (world: { data: Record<string, unknown> }) =>
  world.data.card as Awaited<ReturnType<typeof makeCard>>;

Given(
  "o cartão {string} com limite {string}, fechamento dia {int} e vencimento dia {int}",
  async ({ world }, nome: string, limite: string, fecha: number, vence: number) => {
    world.data.card = await makeCard(await setupFamily(world), {
      name: nome,
      owner: "Mariana",
      limitInCents: money(limite),
      closingDay: fecha,
      dueDay: vence,
    });
  },
);

Given(
  /^(?:que )?hoje é (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, d: string, m: string, y: string) => {
    const iso = `${y}-${m}-${d}`;
    world.data.today = iso;
    await setToday(iso);
  },
);

When(
  "Lucas toca em {string}, digita {string}, escolhe {string}, escolhe {string} e toca em {string}",
  async (
    { page, world },
    _plus: string,
    valor: string,
    categoria: string,
    pagar: string,
    salvar: string,
  ) => {
    await buyOnCard(page, {
      amount: valor,
      category: categoria,
      card: pagar.replace(/^Pagar com:\s*/, ""),
      submit: salvar,
    });
    world.data.lastAmount = valor;
  },
);

Then(
  "a despesa é registrada com autor {string}, quem pagou {string}, cartão {string} e data de hoje",
  async ({ world }, autor: string, pagador: string, cartao: string) => {
    const row = await db.transaction.findFirstOrThrow({
      where: { kind: "EXPENSE" },
      include: { card: true },
    });
    const names = new Map(
      (await db.member.findMany({ include: { user: true } })).map((m) => [
        m.id,
        (m.user.name ?? "").split(" ")[0],
      ]),
    );
    expect(names.get(row.authorMemberId)).toBe(autor);
    expect(names.get(row.payerMemberId as string)).toBe(pagador);
    expect(row.card?.name).toBe(cartao);
    expect(row.accountId).toBeNull();
    expect(row.occurredOn.toISOString().slice(0, 10)).toBe(todayOf(world));
  },
);

Then("o saldo de {string} continua {string}", async ({ page }, conta: string, saldo: string) => {
  await gotoReady(page, "/contas");
  const item = page.getByTestId("account-card").filter({ hasText: conta });
  await expect(item).toContainText(normalizeSpaces(saldo));
});

Then("o limite disponível do cartão passa a {string}", async ({ page }, valor: string) => {
  await gotoReady(page, "/cartoes");
  await expect(page.getByTestId("card-available").first()).toHaveText(normalizeSpaces(valor));
});

When("Lucas lança {string} no cartão {string}", async ({ page }, valor: string, cartao: string) => {
  await buyOnCard(page, { amount: valor, card: cartao });
});

Then(
  "a compra está na fatura de {string} que fecha em {int}\\/{int} e vence em {int}\\/{int}",
  async ({ world }, rotulo: string, fd: number, fm: number, vd: number, vm: number) => {
    const row = await db.transaction.findFirstOrThrow({
      where: { kind: "EXPENSE" },
      include: { invoice: true },
    });
    const [mes, ano] = rotulo.split("/") as [string, string];
    const meses = [
      "jan",
      "fev",
      "mar",
      "abr",
      "mai",
      "jun",
      "jul",
      "ago",
      "set",
      "out",
      "nov",
      "dez",
    ];
    const ref = `${ano}-${String(meses.indexOf(mes) + 1).padStart(2, "0")}`;
    expect(row.invoice?.referenceMonth).toBe(ref);
    const iso = (d: Date) => d.toISOString().slice(5, 10);
    expect(iso(row.invoice?.closingDate as Date)).toBe(
      `${String(fm).padStart(2, "0")}-${String(fd).padStart(2, "0")}`,
    );
    expect(iso(row.invoice?.dueDate as Date)).toBe(
      `${String(vm).padStart(2, "0")}-${String(vd).padStart(2, "0")}`,
    );
    void world;
  },
);

Then("a compra está na fatura de {string}", async ({}, rotulo: string) => {
  const row = await db.transaction.findFirstOrThrow({
    where: { kind: "EXPENSE" },
    include: { invoice: true },
  });
  const [mes, ano] = rotulo.split("/") as [string, string];
  const meses = [
    "jan",
    "fev",
    "mar",
    "abr",
    "mai",
    "jun",
    "jul",
    "ago",
    "set",
    "out",
    "nov",
    "dez",
  ];
  expect(row.invoice?.referenceMonth).toBe(
    `${ano}-${String(meses.indexOf(mes) + 1).padStart(2, "0")}`,
  );
});

When(
  /^Lucas lança "([^"]+)" no cartão com a data (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page, world }, valor: string, d: string, m: string, y: string) => {
    await buyOnCard(page, { amount: valor, card: card(world).name, date: `${y}-${m}-${d}` });
  },
);

When(
  "Lucas lança {string} em {string} no cartão {string} e escolhe {string}",
  async ({ page }, valor: string, categoria: string, cartao: string, quem: string) => {
    await buyOnCard(page, {
      amount: valor,
      category: categoria,
      card: cartao,
      payer: quem.replace(/^Quem pagou:\s*/, ""),
    });
  },
);

When(
  "Lucas lança {string} em {string} no cartão com {string} desligado",
  async ({ page, world }, valor: string, categoria: string, _switch: string) => {
    await buyOnCard(page, {
      amount: valor,
      category: categoria,
      card: card(world).name,
      shared: false,
    });
  },
);

Then("a compra é registrada como pessoal", async () => {
  const row = await db.transaction.findFirstOrThrow({ where: { kind: "EXPENSE" } });
  expect(row.isSharedExpense).toBe(false);
  expect(row.cardId).not.toBeNull();
});

Given("a regra de divisão {string}", async ({}, _regra: string) => {
  // Padrão da família criada pelo fixture: igualitária (EQUAL).
});

Given(
  /^que Mariana lançou "([^"]+)" em "([^"]+)" no cartão "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4})$/,
  async (
    { world },
    valor: string,
    categoria: string,
    _cartao: string,
    d: string,
    m: string,
    y: string,
  ) => {
    await makeCardPurchase(world.family as never, {
      card: card(world),
      category: categoria,
      amountInCents: money(valor),
      occurredOn: `${y}-${m}-${d}`,
      author: "Mariana",
      payer: "Mariana",
    });
  },
);

When("abro o acerto de outubro", async ({ world, page }) => {
  await openPanel(world, page, "Lucas", "2026-10");
});

Then(
  "o total de despesas de outubro no extrato e na Home aumenta {string}",
  async ({ page }, valor: string) => {
    await gotoReady(page, "/extrato");
    await expect(page.getByTestId("totals-expense")).toHaveText(normalizeSpaces(valor));
    await gotoReady(page, "/");
    await expect(page.getByTestId("home-expense")).toContainText(normalizeSpaces(valor));
  },
);

Then("o saldo da família não muda", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(page.getByTestId("family-balance-value")).toContainText(
    normalizeSpaces("R$ 3.000,00"),
  );
});

Given("que o limite disponível do cartão é {string}", async ({ world }, disponivel: string) => {
  const c = card(world);
  const limit = Number(
    (await db.creditCard.findUniqueOrThrow({ where: { id: c.id } })).limitInCents,
  );
  await makeCardPurchase(world.family as never, {
    card: c,
    amountInCents: limit - money(disponivel),
    occurredOn: "2026-10-10",
    description: "Consumo do limite",
  });
});

When(
  "Lucas tenta salvar uma compra de {string} no cartão",
  async ({ page, world }, valor: string) => {
    await fillExpense(page, { amount: valor, card: card(world).name, submit: false });
  },
);

Then("vê o aviso {string} com o botão {string}", async ({ page }, aviso: string, botao: string) => {
  const d = page.getByRole("dialog").last();
  await expect(d.getByText(aviso, { exact: true })).toBeVisible();
  await expect(d.getByRole("button", { name: botao })).toBeVisible();
});

Then("ao confirmar a compra é registrada", async ({ page }) => {
  await drawer(page).getByRole("button", { name: "Confirmar mesmo assim" }).click();
  await waitSaved(page);
  expect(
    await db.transaction.count({ where: { kind: "EXPENSE", description: "Supermercado" } }),
  ).toBe(1);
});

Then("o limite disponível passa a {string}", async ({ page }, valor: string) => {
  await gotoReady(page, "/cartoes");
  await expect(page.getByTestId("card-available").first()).toHaveText(normalizeSpaces(valor));
});

When("Lucas tenta salvar no cartão com valor {string}", async ({ page, world }, valor: string) => {
  await fillExpense(page, { amount: valor, card: card(world).name });
});

When(
  "Lucas escolhe, para uma compra no cartão, uma data posterior a hoje",
  async ({ page, world }) => {
    const [y, m, d] = todayOf(world).split("-").map(Number) as [number, number, number];
    const next = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
    await fillExpense(page, { amount: "R$ 10,00", card: card(world).name, date: next });
  },
);

Given(
  "que a última despesa de Lucas foi no cartão {string}",
  async ({ world }, _cartao: string) => {
    await makeCardPurchase(world.family as never, {
      card: card(world),
      amountInCents: 5000,
      occurredOn: "2026-10-14",
      author: "Lucas",
      payer: "Lucas",
    });
  },
);

Then("{string} vem com {string}", async ({ page }, campo: string, valor: string) => {
  await expect(
    drawer(page).getByLabel(campo, { exact: true }).locator("option:checked"),
  ).toContainText(valor);
});

When("Lucas alterna para {string}", async ({ page }, aba: string) => {
  await openDrawer(page);
  await drawer(page).getByRole("button", { name: aba }).click();
});

Then("o seletor {string} lista apenas contas, sem cartões", async ({ page }, campo: string) => {
  const select = drawer(page).getByLabel(campo, { exact: true });
  await expect(select.locator("optgroup")).toHaveCount(1);
  await expect(select.locator("option", { hasText: "Nubank Mariana" })).toHaveCount(0);
  await expect(select.locator("option", { hasText: "Itaú Lucas" })).toHaveCount(1);
});

Then(
  "o seletor lista apenas as contas e mostra o atalho {string}",
  async ({ page }, atalho: string) => {
    const select = drawer(page).getByLabel("Pagar com", { exact: true });
    await expect(select.locator("optgroup")).toHaveCount(1);
    await expect(select.locator("option", { hasText: "Itaú Lucas" })).toHaveCount(1);
    await expect(drawer(page).getByRole("link", { name: atalho })).toBeVisible();
  },
);

When(
  "Lucas toca duas vezes rapidamente em {string} para uma compra de {string} no cartão",
  async ({ page, world }, botao: string, valor: string) => {
    await fillExpense(page, { amount: valor, card: card(world).name, submit: false });
    await drawer(page).getByRole("button", { name: botao }).dblclick();
    await waitSaved(page);
  },
);

Then("apenas uma compra é registrada", async () => {
  expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
});

Then("o limite disponível é reduzido uma única vez", async ({ page }) => {
  await gotoReady(page, "/cartoes");
  await expect(page.getByTestId("card-available").first()).toHaveText(
    normalizeSpaces("R$ 4.700,00"),
  );
});

Given(
  "uma compra de {string} no cartão {string}",
  async ({ world }, valor: string, _cartao: string) => {
    await makeCardPurchase(world.family as never, {
      card: card(world),
      amountInCents: money(valor),
      occurredOn: "2026-10-15",
      author: "Lucas",
      payer: "Lucas",
    });
  },
);

Then(
  "a linha mostra {string} no lugar da conta e o marcador {string}",
  async ({ page }, cartao: string, marcador: string) => {
    const row = page.getByTestId("ledger-row").first();
    await expect(row).toContainText(cartao);
    await expect(row.getByText(marcador, { exact: true })).toBeVisible();
    await expect(row).not.toContainText("Itaú Lucas");
  },
);

Then("mostra a fatura {string}", async ({ page }, rotulo: string) => {
  await expect(page.getByTestId("ledger-row").first()).toContainText(`Fatura ${rotulo}`);
});

When("Lucas toca em {string} para uma compra no cartão", async ({ page, world }, botao: string) => {
  await fillExpense(page, { amount: "R$ 50,00", card: card(world).name, submit: botao });
  world.data.formCheck = async () => {
    await expect(drawer(page).getByLabel("Valor", { exact: true })).toHaveValue(/R\$\s50,00/);
    await expect(
      drawer(page).getByLabel("Pagar com", { exact: true }).locator("option:checked"),
    ).toContainText(card(world).name);
    await page.unroute("**/api/v1/**");
    await drawer(page).getByRole("button", { name: botao }).click();
    await waitSaved(page);
    expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
  };
});

void chooseSource;
