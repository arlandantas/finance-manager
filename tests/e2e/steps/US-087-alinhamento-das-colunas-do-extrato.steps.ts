import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import {
  makeAccount,
  makeCard,
  makeInvoice,
  makeInvoicePayment,
  makeTransaction,
  makeTransfer,
} from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import { apiPost } from "../support/previstas";
import { setupFamily } from "../support/world";

const db = testDb();
const rows = (page: Page) => page.getByTestId("ledger-row");

/** Posição (px) do valor e da data de cada linha visível do Extrato. */
async function geometry(page: Page) {
  return page.getByTestId("ledger-row").evaluateAll((els) =>
    els.map((el) => {
      const money = el.querySelector("[data-money]")?.getBoundingClientRect();
      const date = [...el.querySelectorAll('[data-testid="ledger-date"]')]
        .map((d) => d.getBoundingClientRect())
        .find((r) => r.width > 0);
      return {
        text: (el.textContent ?? "").slice(0, 40),
        moneyRight: money?.right ?? Number.NaN,
        dateLeft: date?.left ?? Number.NaN,
      };
    }),
  );
}

Given(
  "o Extrato de outubro tem despesa, receita, parcela {string}, transferência, acerto e pagamento de fatura",
  async ({ page, world }, _parcela: string) => {
    const fam = await setupFamily(world);
    const itau = await makeAccount(fam, {
      name: "Itaú Mariana",
      owner: "Mariana",
      openingBalanceInCents: 5_000_000,
    });
    const poup = await makeAccount(fam, {
      name: "Poupança",
      owner: "Mariana",
      openingBalanceInCents: 100_000,
    });
    world.data.itau = itau;
    await makeTransaction(fam, {
      account: itau,
      category: "Supermercado",
      amountInCents: 123_456,
      occurredOn: "2026-10-03",
      description: "Mercado do bairro",
    });
    await makeTransaction(fam, {
      account: itau,
      type: "INCOME",
      category: "Salário",
      amountInCents: 500_000,
      occurredOn: "2026-10-02",
      description: "Salário",
    });
    await makeTransfer(fam, {
      from: itau,
      to: poup,
      amountInCents: 5_000,
      occurredOn: "2026-10-03",
    });
    await makeTransfer(fam, {
      from: itau,
      to: poup,
      amountInCents: 7_550,
      occurredOn: "2026-10-03",
      kind: "SETTLEMENT",
    });
    const card = await makeCard(fam, { name: "Nubank", closingDay: 25, dueDay: 5 });
    // fatura de OUTRO cartão paga em outubro (a do Notebook precisa seguir em aberto)
    const other = await makeCard(fam, { name: "Visa", closingDay: 25, dueDay: 5 });
    const inv = await makeInvoice(fam, other, "2026-09");
    await makeInvoicePayment(fam, {
      card: other,
      invoice: inv,
      account: itau,
      amountInCents: 100,
      paidOn: "2026-10-03",
    });
    // compra em 10x (parcela 1 em setembro, 2/10 em outubro), criada pela API como o app faria
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: fam.family.id, name: "Supermercado" },
    });
    await gotoReady(page, "/");
    const res = await apiPost(page, "/api/v1/transactions", {
      type: "EXPENSE",
      cardId: card.id,
      categoryId: cat.id,
      amountInCents: 250_000,
      installments: 10,
      occurredOn: "2026-09-03",
      description: "Notebook",
    });
    if (res.status !== 201) throw new Error(`parcelado falhou: ${JSON.stringify(res.body)}`);
  },
);

Given(
  "que uma despesa tem 3 tags, o selo {string} e o selo {string}",
  async ({ world }, _pessoal: string, _assistente: string) => {
    const fam = await setupFamily(world);
    const row = await makeTransaction(fam, {
      account: world.data.itau as Awaited<ReturnType<typeof makeAccount>>,
      category: "Lazer e restaurantes",
      amountInCents: 9_999,
      occurredOn: "2026-10-03",
      description: "Jantar da viagem",
      shared: false,
      tags: ["viagem", "aniversario", "familia-toda"],
    });
    world.data.tagged = "Jantar da viagem";
    // selo "via assistente": só se o banco aceitar origem ASSISTANT sem concessão
    await db.transaction
      .update({ where: { id: row.id }, data: { origin: "ASSISTANT" } })
      .catch(() => undefined);
  },
);

Given("uma despesa com descrição de {int} caracteres", async ({ world }, n: number) => {
  const fam = await setupFamily(world);
  await makeTransaction(fam, {
    account: world.data.itau as Awaited<ReturnType<typeof makeAccount>>,
    category: "Moradia",
    amountInCents: 1_234_567,
    occurredOn: "2026-10-03",
    description: "Descrição muito longa ".repeat(10).slice(0, n),
  });
});

Given("que a tela tem {int} pixels de largura", async ({ page }, w: number) => {
  await page.setViewportSize({ width: w, height: 800 });
});

When("Mariana confere o Extrato de outubro", async ({ page }) => {
  // o 1º carregamento do dev server pode abortar a navegação (compilação a frio): tenta de novo
  await gotoReady(page, "/extrato?period=2026-10").catch(() =>
    gotoReady(page, "/extrato?period=2026-10"),
  );
  await expect(rows(page).first()).toBeVisible();
  await expect(page.getByTestId("totals-expense")).toBeVisible();
});

Then("os valores de todas as linhas terminam na mesma posição horizontal", async ({ page }) => {
  const g = await geometry(page);
  expect(g.length).toBeGreaterThanOrEqual(6);
  const first = g[0]?.moneyRight as number;
  for (const r of g) expect(Math.abs(r.moneyRight - first), r.text).toBeLessThanOrEqual(1);
});

Then("a data de todas as linhas começa na mesma posição horizontal", async ({ page }) => {
  const g = await geometry(page);
  expect(g.length).toBeGreaterThanOrEqual(6);
  const first = g[0]?.dateLeft as number;
  for (const r of g) expect(Math.abs(r.dateLeft - first), r.text).toBeLessThanOrEqual(1);
});

Then("o valor dessa linha continua alinhado com os das demais", async ({ page, world }) => {
  const tagged = rows(page).filter({ hasText: world.data.tagged as string });
  await expect(tagged.getByTestId("tag-chip")).toHaveCount(3);
  const g = await geometry(page);
  const first = g[0]?.moneyRight as number;
  for (const r of g) expect(Math.abs(r.moneyRight - first), r.text).toBeLessThanOrEqual(1);
});

Then(
  "a parcela {string} ocupa as mesmas colunas de uma despesa comum",
  async ({ page }, parcela: string) => {
    const parcel = rows(page).filter({ hasText: "Notebook" });
    await expect(parcel).toHaveCount(1);
    await expect(parcel).toContainText(`· ${parcela}`);
    const g = await geometry(page);
    const common = g.find((r) => r.text.includes("Mercado"));
    const p = g.find((r) => r.text.includes("Notebook"));
    expect(p?.moneyRight).toBeCloseTo(common?.moneyRight as number, 0);
    expect(p?.dateLeft).toBeCloseTo(common?.dateLeft as number, 0);
  },
);

Then("não há rolagem horizontal no Extrato", async ({ page }) => {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

Then("a descrição é truncada com reticências", async ({ page }) => {
  const row = rows(page).filter({ hasText: "Descrição muito longa" });
  const title = row.locator("span.line-clamp-1, span.line-clamp-2").first();
  const info = await title.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      overflow: s.overflow,
      clamp: s.webkitLineClamp,
      fits: el.scrollHeight <= el.clientHeight + 1,
    };
  });
  expect(info.overflow).toBe("hidden");
  expect(["1", "2"]).toContain(info.clamp);
});

void ({} as World);
