import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import {
  makeCard,
  makeCardPurchase,
  makeFamily,
  makeInvoice,
  makeInvoicePayment,
} from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { enterAs } from "../support/acerto";
import {
  buyOnCard,
  cardItem,
  fillPayInvoice,
  gotoInvoice,
  openPayInvoice,
  payInvoiceDrawer,
} from "../support/cartoes";
import { dlg } from "../support/categorias";
import { Given, Then, When, type World } from "../support/fixtures";
import { setupFamily } from "../support/world";

const db = testDb();
const money = (v: string) => parseBRL(v) ?? 0;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const refOf = (label: string) => {
  const [mes, ano] = label.split("/") as [string, string];
  return `${ano}-${String(MESES.indexOf(mes) + 1).padStart(2, "0")}`;
};
const card = (w: World) => w.data.card as Awaited<ReturnType<typeof makeCard>>;
const iso = (d: string, m: string, y: string) => `${y}-${m}-${d}`;
let seq = 0;
const stamp = () => new Date(Date.UTC(2026, 9, 1, 12, 0, ++seq));

Given("a fatura {string} com total {string}", async ({ world }, _rotulo: string, total: string) => {
  world.data.invoiceContext = true;
  world.data.baselineTx = 1; // a compra do contexto
  await makeCardPurchase(world.family as never, {
    card: card(world),
    amountInCents: money(total),
    occurredOn: "2026-10-10",
    author: "Lucas",
    payer: "Lucas",
    createdAt: stamp(),
  });
});

When(
  "Lucas toca em {string}, escolhe a conta {string} e confirma o pagamento de {string}",
  async ({ page, world }, botao: string, conta: string, valor: string) => {
    await gotoInvoice(page, world, "2026-10");
    await page.getByRole("button", { name: botao }).click();
    const d = payInvoiceDrawer(page, world, "2026-10");
    await expect(d).toBeVisible();
    await expect(d.getByTestId("pay-invoice-total")).toHaveText(normalizeSpaces(valor));
    await fillPayInvoice(d, { account: conta });
    await d.getByRole("button", { name: "Confirmar pagamento" }).click();
    await expect(page.getByText("Fatura paga com sucesso!")).toBeVisible();
  },
);

Then(
  /^a fatura "([^"]+)" fica "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page }, _rotulo: string, situacao: string, d: string, m: string, _y: string) => {
    await expect(page.getByTestId("invoice-status")).toHaveText(situacao);
    await expect(page.getByTestId("invoice-paid-on")).toHaveText(`Paga em ${d}/${m}`);
  },
);

Given("o limite disponível de {string}", async ({ page, world }, valor: string) => {
  await enterAs(world, page, "Lucas");
  const res = await page.request.get("/api/v1/cards");
  const body = (await res.json()) as { items: Array<{ availableInCents: number }> };
  expect(body.items[0]?.availableInCents).toBe(money(valor));
});

/** Paga a fatura pela UI (padrões: conta padrão do membro e data de hoje). */
async function payThroughUi(page: Page, world: World, ref: string) {
  const d = await openPayInvoice(page, world, ref);
  await fillPayInvoice(d, { account: "Itaú Lucas" });
  await d.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByText("Fatura paga com sucesso!")).toBeVisible();
}

When("Lucas paga a fatura {string}", async ({ page, world }, rotulo: string) => {
  await payThroughUi(page, world, refOf(rotulo));
});

When(
  /^Lucas paga a fatura "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page, world }, rotulo: string, d: string, m: string, y: string) => {
    const dialog = await openPayInvoice(page, world, refOf(rotulo));
    await fillPayInvoice(dialog, { account: "Itaú Lucas", date: iso(d, m, y) });
    await dialog.getByRole("button", { name: "Confirmar pagamento" }).click();
    await expect(page.getByText("Fatura paga com sucesso!")).toBeVisible();
  },
);

Then("o total de despesas de outubro no extrato e na Home não muda", async ({ page }) => {
  await gotoReady(page, "/extrato");
  await expect(page.getByTestId("totals-expense")).toHaveText(normalizeSpaces("R$ 1.200,00"));
  await gotoReady(page, "/");
  await expect(page.getByTestId("home-expense")).toContainText(normalizeSpaces("R$ 1.200,00"));
});

Then("o acerto de contas de outubro não muda", async ({ page }) => {
  const res = await page.request.get("/api/v1/settlement?period=2026-10");
  const body = (await res.json()) as { totalSharedInCents: number };
  expect(body.totalSharedInCents).toBe(120000);
});

When("abre o extrato", async ({ page }) => {
  await gotoReady(page, "/extrato");
  await expect(page.getByRole("heading", { name: "Extrato" })).toBeVisible();
});

Then(
  "vê {string} de {string} na conta {string}",
  async ({ page }, descricao: string, valor: string, conta: string) => {
    const row = page.getByTestId("ledger-row").filter({ hasText: descricao });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(normalizeSpaces(valor));
    await expect(row).toContainText(conta);
  },
);

Then("a linha não é contada em receitas nem em despesas", async ({ page }) => {
  await expect(page.getByTestId("totals-expense")).toHaveText(normalizeSpaces("R$ 1.200,00"));
  await expect(page.getByTestId("totals-income")).toHaveText(normalizeSpaces("R$ 0,00"));
  const row = page.getByTestId("ledger-row").filter({ hasText: "Pagamento da fatura" });
  await expect(row.locator(".text-emerald-700")).toHaveCount(0);
});

Given(
  "a fatura {string} aberta com total {string}",
  async ({ world }, _rotulo: string, total: string) => {
    await makeCardPurchase(world.family as never, {
      card: card(world),
      amountInCents: money(total),
      occurredOn: "2026-10-27",
      createdAt: stamp(),
    });
  },
);

When("Lucas abre a fatura {string}", async ({ page, world }, rotulo: string) => {
  await gotoInvoice(page, world, refOf(rotulo));
});

Then("não vê o botão {string}", async ({ page }, botao: string) => {
  await expect(page.getByRole("button", { name: botao })).toHaveCount(0);
});

Given(
  "a fatura {string} fechada com total {string}",
  async ({ world }, rotulo: string, _total: string) => {
    await makeInvoice(world.family as never, card(world), refOf(rotulo));
  },
);

When("Lucas tenta confirmar o pagamento sem escolher a conta", async ({ page, world }) => {
  const d = await openPayInvoice(page, world);
  await fillPayInvoice(d, { account: null });
  await d.getByRole("button", { name: "Confirmar pagamento" }).click();
});

When("Lucas escolhe uma data posterior a hoje para o pagamento", async ({ page, world }) => {
  const d = await openPayInvoice(page, world);
  await fillPayInvoice(d, { account: "Itaú Lucas", date: "2026-10-29" });
  await d.getByRole("button", { name: "Confirmar pagamento" }).click();
});

When(
  /^Lucas escolhe a data (\d{2})\/(\d{2})\/(\d{4}) para o pagamento$/,
  async ({ page, world }, d: string, m: string, y: string) => {
    const dialog = await openPayInvoice(page, world);
    await fillPayInvoice(dialog, { account: "Itaú Lucas", date: iso(d, m, y) });
    await dialog.getByRole("button", { name: "Confirmar pagamento" }).click();
  },
);

Then("apenas um pagamento é registrado", async () => {
  expect(await db.transaction.count({ where: { kind: "INVOICE_PAYMENT", deletedAt: null } })).toBe(
    1,
  );
});

Given("que a fatura {string} já foi paga por Mariana", async ({ page, world }, rotulo: string) => {
  // Lucas já está com a tela da fatura aberta (desatualizada) quando Mariana paga.
  world.data.expectedPayments = 1;
  await gotoInvoice(page, world, refOf(rotulo));
  await expect(page.getByRole("button", { name: "Pagar fatura" })).toBeVisible();
  const inv = await db.cardInvoice.findFirstOrThrow({ where: { referenceMonth: refOf(rotulo) } });
  const account = await db.bankAccount.findFirstOrThrow();
  await makeInvoicePayment(world.family as never, {
    card: card(world),
    invoice: { id: inv.id, cardId: inv.cardId, ref: inv.referenceMonth },
    account: { id: account.id, name: account.name, ownerMemberId: "" },
    amountInCents: 120000,
    paidOn: "2026-10-28",
    author: "Mariana",
  });
});

When("Lucas tenta pagar a fatura pela tela que estava aberta", async ({ page, world }) => {
  await page.getByRole("button", { name: "Pagar fatura" }).click();
  const d = payInvoiceDrawer(page, world, "2026-10");
  await expect(d).toBeVisible();
  await fillPayInvoice(d, { account: "Itaú Lucas" });
  await d.getByRole("button", { name: "Confirmar pagamento" }).click();
});

Then("nada é debitado", async ({ world }) => {
  const expected = world.data.expectedPayments as number | undefined;
  expect(await db.transaction.count({ where: { kind: "INVOICE_PAYMENT", deletedAt: null } })).toBe(
    expected ?? (world.data.preExistingPayment ? 1 : 0),
  );
});

Given(
  "que Lucas abriu o pagamento da fatura de {string}",
  async ({ page, world }, valor: string) => {
    const d = await openPayInvoice(page, world);
    await expect(d.getByTestId("pay-invoice-total")).toHaveText(normalizeSpaces(valor));
    await fillPayInvoice(d, { account: "Itaú Lucas" });
  },
);

Given(
  "que Mariana lançou depois uma compra retroativa de {string} na mesma fatura",
  async ({ world }, valor: string) => {
    await makeCardPurchase(world.family as never, {
      card: card(world),
      amountInCents: money(valor),
      occurredOn: "2026-10-20",
      author: "Mariana",
      payer: "Mariana",
      createdAt: stamp(),
    });
  },
);

When("Lucas confirma o pagamento", async ({ page, world }) => {
  const d = payInvoiceDrawer(page, world, "2026-10");
  if (!(await d.isVisible())) {
    const opened = await openPayInvoice(page, world);
    await fillPayInvoice(opened, { account: "Itaú Lucas" });
  }
  await payInvoiceDrawer(page, world, "2026-10")
    .getByRole("button", { name: "Confirmar pagamento" })
    .click();
});

Then("o drawer passa a mostrar {string}", async ({ page, world }, valor: string) => {
  await expect(
    payInvoiceDrawer(page, world, "2026-10").getByTestId("pay-invoice-total"),
  ).toHaveText(normalizeSpaces(valor));
});

async function seedPayment(world: World, rotulo: string, author = "Lucas") {
  const inv = await db.cardInvoice.findFirstOrThrow({ where: { referenceMonth: refOf(rotulo) } });
  const account = await db.bankAccount.findFirstOrThrow({ where: { name: "Itaú Lucas" } });
  await makeInvoicePayment(world.family as never, {
    card: card(world),
    invoice: { id: inv.id, cardId: inv.cardId, ref: inv.referenceMonth },
    account: { id: account.id, name: account.name, ownerMemberId: "" },
    amountInCents: 120000,
    paidOn: "2026-10-28",
    author,
  });
  world.data.preExistingPayment = true;
}

Given(
  /^a fatura "([^"]+)" paga em (\d{2})\/(\d{2})\/(\d{4}) com a conta "([^"]+)"$/,
  async ({ world }, rotulo: string, _d: string, _m: string, _y: string, _conta: string) => {
    await seedPayment(world, rotulo);
  },
);

Then(
  "a fatura {string} volta a {string}",
  async ({ page, world }, rotulo: string, situacao: string) => {
    await gotoInvoice(page, world, refOf(rotulo));
    await expect(page.getByTestId("invoice-status")).toHaveText(situacao);
  },
);

Then("o limite disponível volta a {string}", async ({ page }, valor: string) => {
  await gotoReady(page, "/cartoes");
  await expect(page.getByTestId("card-available").first()).toHaveText(normalizeSpaces(valor));
});

Given("a fatura {string} paga", async ({ world }, rotulo: string) => {
  await seedPayment(world, rotulo);
});

When(
  /^Lucas tenta lançar no cartão uma compra com a data (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page, world }, d: string, m: string, y: string) => {
    await enterAs(world, page, "Lucas");
    await gotoReady(page, "/");
    const { fillExpense } = await import("../support/cartoes");
    await fillExpense(page, { amount: "R$ 10,00", card: card(world).name, date: iso(d, m, y) });
    void buyOnCard;
  },
);

When("Lucas tenta editar ou excluir uma compra dela", async ({ page, world }) => {
  await gotoInvoice(page, world, "2026-10");
  await page.getByTestId("ledger-row").first().click();
  const detail = dlg(page, "Detalhe do lançamento");
  await detail.getByRole("button", { name: "Ações do lançamento" }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  const form = dlg(page, "Editar lançamento");
  await form.getByLabel("Valor", { exact: true }).fill("R$ 100,00");
  await form.getByRole("button", { name: "Salvar alterações" }).click();
});

Given("o pagamento da fatura {string} no extrato", async ({ world }, rotulo: string) => {
  await seedPayment(world, rotulo);
});

When("Lucas abre o detalhe", async ({ page, world }) => {
  await enterAs(world, page, "Lucas");
  await gotoReady(page, "/extrato");
  await page.getByTestId("ledger-row").filter({ hasText: "Pagamento da fatura" }).click();
  await expect(dlg(page, "Detalhe do lançamento")).toBeVisible();
});

Then(
  "não há {string} nem {string}, só {string}",
  async ({ page }, _a: string, _b: string, acao: string) => {
    const d = dlg(page, "Detalhe do lançamento");
    await expect(d.getByRole("button", { name: acao })).toBeVisible();
    await expect(d.getByRole("button", { name: "Ações do lançamento" })).toHaveCount(0);
    await expect(d.getByText("Editar", { exact: true })).toHaveCount(0);
    await expect(d.getByText("Excluir", { exact: true })).toHaveCount(0);
  },
);

Given("a {string} com a fatura {string} fechada", async ({}, familia: string, _rotulo: string) => {
  const other = await makeFamily({
    name: familia,
    members: [{ email: "souza@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
  });
  const c = await makeCard(other, { name: "Visa Souza", closingDay: 25, dueDay: 5 });
  await makeCardPurchase(other, { card: c, amountInCents: 40000, occurredOn: "2026-10-10" });
});

When("Lucas tenta pagá-la por endereço direto", async ({ page, world }) => {
  await enterAs(world, page, "Lucas");
  const other = await db.creditCard.findFirstOrThrow({ where: { name: "Visa Souza" } });
  await gotoReady(page, `/cartoes/${other.id}?ref=2026-10&pay=1`);
});

When("Lucas confirma o pagamento da fatura", async ({ page, world }) => {
  const d = await openPayInvoice(page, world);
  await fillPayInvoice(d, { account: "Itaú Lucas" });
  await d.getByRole("button", { name: "Confirmar pagamento" }).click();
});

void cardItem;
void setupFamily;
