import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makePlannedExpense } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { fillPayInvoice, gotoInvoice, openPayInvoice, payInvoiceDrawer } from "../support/cartoes";
import { dlg } from "../support/categorias";
import { Given, Then, When, type World } from "../support/fixtures";
import {
  apiPost,
  confirmPay,
  fillPay,
  openPay,
  openPrevistasOf,
  PERIOD_NOV,
  payDrawer,
  payViaApi,
} from "../support/previstas";
import { setupFamily } from "../support/world";

const db = testDb();
const money = (v: string) => parseBRL(v) ?? 0;
const iso = (d: string, m: string, y: string) => `${y}-${m}-${d}`;

async function payNov(
  page: Page,
  o: { amount?: string; account?: string | null; payer?: string; date?: string } = {},
  title = "Condomínio",
) {
  await openPrevistasOf(page, PERIOD_NOV);
  const d = await openPay(page, title);
  await fillPay(d, o);
  return d;
}

Given(
  /^a despesa prevista "([^"]+)" de "([^"]+)" na categoria "([^"]+)" com vencimento em (\d{2})\/(\d{2})\/(\d{4}) e responsável "([^"]+)"$/,
  async (
    { world },
    nome: string,
    valor: string,
    categoria: string,
    d: string,
    m: string,
    y: string,
    resp: string,
  ) => {
    await makePlannedExpense(await setupFamily(world), {
      description: nome,
      amountInCents: money(valor),
      dueOn: iso(d, m, y),
      category: categoria,
      responsible: resp,
    });
  },
);

Given(
  /^a despesa prevista "([^"]+)" de "([^"]+)" com vencimento em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, nome: string, valor: string, d: string, m: string, y: string) => {
    await makePlannedExpense(await setupFamily(world), {
      description: nome,
      amountInCents: money(valor),
      dueOn: iso(d, m, y),
      responsible: "Lucas",
    });
  },
);

When(
  "Lucas dá baixa em {string} de novembro escolhendo a conta {string} e a data de hoje",
  async ({ page }, nome: string, conta: string) => {
    const d = await payNov(page, { account: conta }, nome);
    await confirmPay(d);
    await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
  },
);

Then("a despesa de novembro fica {string}", async ({ page }, situacao: string) => {
  await page.getByRole("tab", { name: "Pagas" }).click();
  const item = page.getByTestId("paid-item").filter({ hasText: "Condomínio" });
  await expect(item).toHaveCount(1);
  await expect(item).toContainText(situacao === "Pago" ? "Pago em 10/11" : situacao);
});

When(
  "Lucas dá baixa em {string} de novembro pagando {string} pela conta {string}",
  async ({ page }, nome: string, valor: string, conta: string) => {
    const d = await payNov(page, { amount: valor, account: conta }, nome);
    await confirmPay(d);
    await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
  },
);

When(
  /^Lucas dá baixa em "([^"]+)" de novembro pagando "([^"]+)" pela conta "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page }, nome: string, valor: string, conta: string, d: string, m: string, y: string) => {
    const dlgPay = await payNov(page, { amount: valor, account: conta, date: iso(d, m, y) }, nome);
    await confirmPay(dlgPay);
    await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
  },
);

Then(
  /^o extrato mostra uma despesa de "([^"]+)" na categoria "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4}) na conta "([^"]+)"$/,
  async (
    { page },
    valor: string,
    categoria: string,
    d: string,
    m: string,
    _y: string,
    conta: string,
  ) => {
    await gotoReady(page, `/extrato?period=${PERIOD_NOV}`);
    const row = page.getByTestId("ledger-row").first();
    await expect(row).toContainText(normalizeSpaces(valor));
    await expect(row).toContainText(categoria);
    await expect(row).toContainText(conta);
    await expect(row).toContainText(`${d}/${m}`);
  },
);

Then("o total de despesas de novembro aumenta {string}", async ({ page }, valor: string) => {
  await expect(page.getByTestId("totals-expense")).toHaveText(normalizeSpaces(valor));
});

async function lastExpense() {
  return db.transaction.findFirstOrThrow({
    where: { kind: "EXPENSE" },
    orderBy: { createdAt: "desc" },
    include: { payer: { include: { user: true } }, author: { include: { user: true } } },
  });
}
const first = (n: string | null | undefined) => (n ?? "").split(" ")[0];

When("Lucas dá baixa sem alterar quem pagou", async ({ page }) => {
  const d = await payNov(page);
  await confirmPay(d);
  await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
});

Then("a despesa gerada tem {string}", async ({}, texto: string) => {
  const t = await lastExpense();
  expect(`Pago por ${first(t.payer?.user.name)}`).toBe(texto);
});

When("Lucas dá baixa escolhendo {string}", async ({ page }, escolha: string) => {
  const d = await payNov(page, { payer: escolha.replace(/^Quem pagou:\s*/, "") });
  await confirmPay(d);
  await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
});

Then(
  "a despesa gerada tem autor {string} e {string}",
  async ({}, autor: string, pagador: string) => {
    const t = await lastExpense();
    expect(first(t.author.user.name)).toBe(autor);
    expect(`Pago por ${first(t.payer?.user.name)}`).toBe(pagador);
  },
);

When(
  "Lucas dá baixa em {string} pagando {string}",
  async ({ page }, nome: string, valor: string) => {
    const d = await payNov(page, { amount: valor }, nome);
    await confirmPay(d);
    await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
  },
);

Then("o acerto de novembro considera {string} pago por Lucas", async ({ page }, valor: string) => {
  const res = await page.request.get("/api/v1/settlement?period=2026-11");
  const body = (await res.json()) as {
    members: Array<{ member: { name: string }; paidInCents: number }>;
  };
  const lucas = body.members.find((m) => m.member.name.startsWith("Lucas"));
  expect(lucas?.paidInCents).toBe(money(valor));
});

Given(
  "a previsão {string} de {string} marcada como pessoal",
  async ({ world }, nome: string, valor: string) => {
    await makePlannedExpense(await setupFamily(world), {
      description: nome,
      amountInCents: money(valor),
      dueOn: "2026-11-10",
      responsible: "Lucas",
      shared: false,
    });
  },
);

When("Lucas dá baixa nela", async ({ page }) => {
  const d = await payNov(page, {}, "Plano de saúde de Lucas");
  await confirmPay(d);
  await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
});

Then("o acerto de novembro não muda", async ({ page }) => {
  const res = await page.request.get("/api/v1/settlement?period=2026-11");
  expect(((await res.json()) as { totalSharedInCents: number }).totalSharedInCents).toBe(0);
});

When("Lucas dá baixa em {string} de novembro", async ({ page }, nome: string) => {
  const d = await payNov(page, {}, nome);
  await confirmPay(d);
  await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
});

Then(
  /^a despesa de (\d{2})\/(\d{2})\/(\d{4}) continua "([^"]+)" com valor "([^"]+)"$/,
  async ({}, d: string, m: string, y: string, estado: string, valor: string) => {
    const row = await db.plannedExpense.findFirstOrThrow({
      where: { dueOn: new Date(`${iso(d, m, y)}T00:00:00Z`) },
    });
    expect(row.status).toBe(estado.toUpperCase());
    expect(row.amountInCents).toBe(BigInt(money(valor)));
    expect(row.version).toBe(1);
  },
);

When("Lucas tenta confirmar a baixa sem escolher a conta", async ({ page }) => {
  const d = await payNov(page, { account: null });
  await confirmPay(d);
});

When("Lucas informa o valor pago {string}", async ({ page }, valor: string) => {
  await openPrevistasOf(page, PERIOD_NOV);
  const d = await openPay(page, "Condomínio");
  await fillPay(d, { amount: valor });
  await confirmPay(d);
});

When("Lucas escolhe, para a baixa, uma data posterior a hoje", async ({ page }) => {
  const d = await payNov(page, { date: "2026-11-11" });
  await confirmPay(d);
});

When(
  /^Lucas dá baixa com a data (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page }, d: string, m: string, y: string) => {
    const dd = await payNov(page, { date: iso(d, m, y) });
    await confirmPay(dd);
    await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
  },
);

Then(
  /^a despesa gerada tem a data (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({}, d: string, m: string, y: string) => {
    expect((await lastExpense()).occurredOn.toISOString().slice(0, 10)).toBe(iso(d, m, y));
  },
);

Given("que o saldo de {string} é {string}", async ({}, conta: string, saldo: string) => {
  const account = await db.bankAccount.findFirstOrThrow({ where: { name: conta } });
  await db.transaction.updateMany({
    where: { accountId: account.id, kind: "OPENING" },
    data: { amountInCents: BigInt(money(saldo)) },
  });
});

When(
  "Lucas escolhe {string} para pagar {string}",
  async ({ page, world }, conta: string, valor: string) => {
    if (world.data.invoiceContext) {
      // US-017b: pagamento da fatura (o valor é o total da fatura, somente leitura)
      const d = await openPayInvoice(page, world);
      await expect(d.getByTestId("pay-invoice-total")).toHaveText(normalizeSpaces(valor));
      await fillPayInvoice(d, { account: conta });
      return;
    }
    await payNov(page, { account: conta, amount: valor });
  },
);

Then("ao confirmar o saldo da conta passa a {string}", async ({ page, world }, saldo: string) => {
  if (world.data.invoiceContext) {
    await payInvoiceDrawer(page, world, "2026-10")
      .getByRole("button", { name: "Confirmar mesmo assim" })
      .click();
    await expect(page.getByText("Fatura paga com sucesso!")).toBeVisible();
  } else {
    await confirmPay(payDrawer(page, "Condomínio"), "Confirmar mesmo assim");
    await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
  }
  await gotoReady(page, "/contas");
  await expect(page.getByTestId("account-card").filter({ hasText: "Itaú Lucas" })).toContainText(
    normalizeSpaces(saldo),
  );
});

Then("apenas uma despesa é gerada", async () => {
  expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
});

Then("a conta é debitada uma única vez", async ({ page, world }) => {
  await gotoReady(page, "/contas");
  // baixa: 3.000 - 650 · fatura (US-017b): 3.000 - 1.200
  const esperado = world.data.invoiceContext ? "R$ 1.800,00" : "R$ 2.350,00";
  await expect(page.getByTestId("account-card").filter({ hasText: "Itaú Lucas" })).toContainText(
    normalizeSpaces(esperado),
  );
});

Given(
  "que Lucas e Mariana abriram a baixa de {string} de novembro",
  async ({ world, page, browser }, nome: string) => {
    await openPrevistasOf(page, PERIOD_NOV);
    await openPay(page, nome);
    const { loginAs } = await import("../../support/login");
    const ctx = await browser.newContext({
      baseURL: "http://localhost:3101",
      ...(page.viewportSize() ? { viewport: page.viewportSize() as never } : {}),
    });
    const marianaPage = await ctx.newPage();
    await loginAs(marianaPage, { email: "mariana@exemplo.com", name: "Mariana Silva" });
    await openPrevistasOf(marianaPage, PERIOD_NOV);
    await openPay(marianaPage, nome);
    world.data.marianaPage = marianaPage;
    world.data.conflictCheck = async (mensagem: string) => {
      await expect(payDrawer(page, nome)).toContainText(mensagem);
      await ctx.close();
    };
    world.data.payTitle = nome;
  },
);

When("Mariana confirma a baixa", async ({ world }) => {
  const p = world.data.marianaPage as Page;
  await confirmPay(payDrawer(p, world.data.payTitle as string));
  await expect(p.getByText("Pagamento registrado com sucesso!")).toBeVisible();
});

When("Lucas tenta confirmar a baixa", async ({ page, world }) => {
  await confirmPay(payDrawer(page, world.data.payTitle as string));
});

Then("apenas um débito existe", async () => {
  expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
});

Given("que a despesa de novembro está {string}", async ({ page, world }, _estado: string) => {
  await payViaApi(page, world, "Condomínio");
});

When("Lucas abre a previsão", async ({ page }) => {
  await openPrevistasOf(page, PERIOD_NOV);
  await page.getByRole("tab", { name: "Pagas" }).click();
});

Then(
  "não vê {string} nem {string}, só {string}",
  async ({ page }, _a: string, _b: string, acao: string) => {
    const item = page.getByTestId("paid-item").filter({ hasText: "Condomínio" });
    await expect(item).toHaveCount(1);
    await expect(item.getByRole("button", { name: /^Ações de/ })).toHaveCount(0);
    await expect(item.getByRole("menuitem")).toHaveCount(0);
    await expect(item.getByRole("button", { name: new RegExp(acao) })).toBeVisible();
    await expect(item.getByText("Editar", { exact: true })).toHaveCount(0);
    await expect(item.getByText("Excluir", { exact: true })).toHaveCount(0);
  },
);

Given(
  "que Lucas deu baixa em {string} pagando {string} pela conta {string}",
  async ({ page, world }, nome: string, valor: string, conta: string) => {
    await payViaApi(page, world, nome, { amountInCents: money(valor), accountName: conta });
  },
);

When("Lucas toca em {string} e confirma", async ({ page, world }, acao: string) => {
  if (world.data.invoiceContext) {
    // US-017b: desfazer o pagamento da fatura pela tela da fatura
    await gotoInvoice(page, world, "2026-10");
    await page.getByRole("button", { name: "Desfazer pagamento", exact: true }).click();
    const dd = dlg(page, `${acao}?`);
    await expect(dd).toBeVisible();
    await dd.getByRole("button", { name: acao, exact: true }).click();
    await expect(page.getByText("Pagamento desfeito")).toBeVisible();
    return;
  }
  await openPrevistasOf(page, PERIOD_NOV);
  await page.getByRole("tab", { name: "Pagas" }).click();
  await page.getByRole("button", { name: /^Desfazer pagamento de/ }).click();
  const d = dlg(page, `${acao}?`);
  await expect(d).toBeVisible();
  await d.getByRole("button", { name: acao, exact: true }).click();
  await expect(page.getByText("Pagamento desfeito")).toBeVisible();
});

Then("o saldo de {string} volta a {string}", async ({ page }, conta: string, saldo: string) => {
  await gotoReady(page, "/contas");
  await expect(page.getByTestId("account-card").filter({ hasText: conta })).toContainText(
    normalizeSpaces(saldo),
  );
});

Then(
  "a previsão volta a {string} com valor {string}",
  async ({ page }, estado: string, valor: string) => {
    await openPrevistasOf(page, PERIOD_NOV);
    const item = page.getByTestId("payable-item").filter({ hasText: "Condomínio" });
    await expect(item).toHaveCount(1);
    await expect(item).toContainText(normalizeSpaces(valor));
    const row = await db.plannedExpense.findFirstOrThrow({
      where: { dueOn: new Date("2026-11-10T00:00:00Z") },
    });
    expect(row.status).toBe(estado.toUpperCase());
  },
);

Then("a despesa de {string} some do extrato e do acerto", async ({ page }, valor: string) => {
  await gotoReady(page, `/extrato?period=${PERIOD_NOV}`);
  await expect(
    page.getByTestId("ledger-row").filter({ hasText: normalizeSpaces(valor) }),
  ).toHaveCount(0);
  const res = await page.request.get("/api/v1/settlement?period=2026-11");
  expect(((await res.json()) as { totalSharedInCents: number }).totalSharedInCents).toBe(0);
});

Given("a despesa gerada pela baixa de {string}", async ({ page, world }, nome: string) => {
  await payViaApi(page, world, nome);
});

Given(
  "a despesa gerada pela baixa de {string} de {string}",
  async ({ page, world }, nome: string, valor: string) => {
    await payViaApi(page, world, nome, { amountInCents: money(valor) });
  },
);

When("Lucas tenta excluí-la pelo extrato", async ({ page, world }) => {
  await gotoReady(page, `/extrato?period=${PERIOD_NOV}`);
  await page.getByTestId("ledger-row").first().click();
  const d = dlg(page, "Detalhe do lançamento");
  await expect(d).toBeVisible();
  // A UI não oferece "Excluir" para despesa vinda de previsão; o servidor também recusa.
  await expect(page.getByRole("button", { name: "Excluir", exact: true })).toHaveCount(0);
  const t = await db.transaction.findFirstOrThrow({ where: { kind: "EXPENSE" } });
  const res = await apiPost(page, `/api/v1/transactions/${t.id}/delete`, { version: t.version });
  world.data.apiError = res.body.error;
  expect(res.status).toBe(422);
  expect(res.body.error.message).toBe(
    "Esta despesa veio de uma despesa prevista. Use Desfazer pagamento.",
  );
});

Then("vê {string} no detalhe", async ({ page }, texto: string) => {
  await expect(dlg(page, "Detalhe do lançamento").getByText(texto, { exact: false })).toBeVisible();
});

When("Lucas corrige o valor no extrato para {string}", async ({ page }, valor: string) => {
  await gotoReady(page, `/extrato?period=${PERIOD_NOV}`);
  await page.getByTestId("ledger-row").first().click();
  const detail = dlg(page, "Detalhe do lançamento");
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const form = dlg(page, "Editar lançamento");
  await form.getByLabel("Valor", { exact: true }).fill(valor);
  await form.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Lançamento atualizado")).toBeVisible();
});

Then(
  "a previsão mostra {string} com a diferença {string}",
  async ({ page }, texto: string, diferenca: string) => {
    if (!page.url().includes("/previstas")) await openPrevistasOf(page, PERIOD_NOV);
    await page.getByRole("tab", { name: "Pagas" }).click();
    const item = page.getByTestId("paid-item").filter({ hasText: "Condomínio" });
    await expect(item.getByTestId("paid-summary")).toContainText(normalizeSpaces(texto));
    await expect(item.getByTestId("paid-difference")).toContainText(normalizeSpaces(diferenca));
  },
);

When("Lucas confirma a baixa", async ({ page }) => {
  const d = await payNov(page);
  await confirmPay(d);
});

void (null as unknown as World);
