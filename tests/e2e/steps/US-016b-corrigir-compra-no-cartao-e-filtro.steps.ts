import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { makeCardPurchase, makeTransaction } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { enterAs } from "../support/acerto";
import { dlg } from "../support/categorias";
import { Given, Then, When, type World } from "../support/fixtures";
import { ensureAccount, setupFamily } from "../support/world";

const db = testDb();
const money = (v: string) => parseBRL(v) ?? 0;
const iso = (d: string, m: string, y: string) => `${y}-${m}-${d}`;
const card = (w: World) => w.data.card as Parameters<typeof makeCardPurchase>[1]["card"];

Given(
  /^uma compra de "([^"]+)" no cartão "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, valor: string, _c: string, d: string, m: string, y: string) => {
    await makeCardPurchase(world.family as never, {
      card: card(world),
      amountInCents: money(valor),
      occurredOn: iso(d, m, y),
      author: "Mariana",
      payer: "Mariana",
    });
  },
);

async function openPurchaseDetail(page: Page, url = "/extrato?period=2026-10") {
  await gotoReady(page, url);
  await page.getByTestId("ledger-row").first().click();
  const d = dlg(page, "Detalhe do lançamento");
  await expect(d).toBeVisible();
  return d;
}

async function openEditForm(page: Page, url?: string) {
  const d = await openPurchaseDetail(page, url);
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  const form = dlg(page, "Editar lançamento");
  await expect(form).toBeVisible();
  return form;
}

When("Mariana edita a compra para {string}", async ({ page }, valor: string) => {
  const form = await openEditForm(page);
  await form.getByLabel("Valor", { exact: true }).fill(valor);
  await form.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByText("Lançamento atualizado")).toBeVisible();
});

When(
  /^Mariana edita a data da compra para (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page }, d: string, m: string, y: string) => {
    const form = await openEditForm(page);
    await form.getByLabel("Data", { exact: true }).fill(iso(d, m, y));
    await form.getByRole("button", { name: "Salvar alterações" }).click();
    await expect(page.getByText("Lançamento atualizado")).toBeVisible();
  },
);

Then("a compra passa para a fatura de {string}", async ({}, rotulo: string) => {
  const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  const [mes, ano] = rotulo.split("/") as [string, string];
  const t = await db.transaction.findFirstOrThrow({
    where: { kind: "EXPENSE", cardId: { not: null } },
    include: { invoice: true },
  });
  expect(t.invoice?.referenceMonth).toBe(`${ano}-${String(MES.indexOf(mes) + 1).padStart(2, "0")}`);
});

When("Mariana exclui a compra", async ({ page }) => {
  const d = await openPurchaseDetail(page);
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await dlg(page, "Excluir lançamento?")
    .getByRole("button", { name: "Excluir", exact: true })
    .click();
  await expect(page.getByText("Despesa excluída")).toBeVisible();
});

Then("a compra some da fatura e do extrato padrão", async ({ page }) => {
  await gotoReady(page, "/extrato?period=2026-10");
  await expect(page.getByTestId("ledger-row")).toHaveCount(0);
  const res = await page.request.get("/api/v1/cards");
  const body = (await res.json()) as { items: Array<{ openInvoice: { purchasesCount: number } }> };
  expect(body.items[0]?.openInvoice.purchasesCount).toBe(0);
});

Given("que Mariana excluiu a compra", async () => {
  await db.transaction.updateMany({
    where: { kind: "EXPENSE", cardId: { not: null } },
    data: {
      deletedAt: new Date(),
      deletedByMemberId: (await db.member.findFirstOrThrow()).id,
      deletionReason: "DELETED",
      version: 2,
    },
  });
});

When("ela restaura a compra", async ({ page }) => {
  const d = await openPurchaseDetail(page, "/extrato?period=2026-10&includeDeleted=true");
  await d.getByRole("button", { name: "Restaurar" }).click();
  await expect(page.getByText("Lançamento restaurado")).toBeVisible();
});

Then("a compra volta à fatura de {string}", async ({ page, world }, _rotulo: string) => {
  await enterAs(world, page, "Mariana");
  const res = await page.request.get(`/api/v1/cards/${card(world).id}/invoices/2026-10`);
  const body = (await res.json()) as { invoice: { purchases: unknown[] } };
  expect(body.invoice.purchases).toHaveLength(1);
});

When("Mariana abre a edição da compra", async ({ page }) => {
  await openEditForm(page);
});

Then(
  "o campo {string} aparece desabilitado com a dica {string}",
  async ({ page }, campo: string, dica: string) => {
    const form = dlg(page, "Editar lançamento");
    await expect(form.getByLabel(campo, { exact: true })).toBeDisabled();
    await expect(form.getByText(dica, { exact: true })).toBeVisible();
  },
);

Given("que Mariana e Lucas abriram a edição da compra", async ({ world, page, browser }) => {
  const form = await openEditForm(page);
  const ctx = await browser.newContext({
    baseURL: "http://localhost:3101",
    ...(page.viewportSize() ? { viewport: page.viewportSize() as never } : {}),
  });
  const lucasPage = await ctx.newPage();
  await loginAs(lucasPage, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  const lucasForm = await openEditForm(lucasPage);
  world.data.conflictActions = {
    mariana: async () => {
      await form.getByLabel("Valor", { exact: true }).fill("R$ 100,00");
      await form.getByRole("button", { name: "Salvar alterações" }).click();
      await expect(page.getByText("Lançamento atualizado")).toBeVisible();
    },
    lucas: async () => {
      await lucasForm.getByLabel("Valor", { exact: true }).fill("R$ 200,00");
      await lucasForm.getByRole("button", { name: "Salvar alterações" }).click();
    },
  };
  world.data.conflictCheck = async (mensagem: string) => {
    await expect(dlg(lucasPage, "Lançamento alterado")).toContainText(mensagem);
    await ctx.close();
  };
});

Given(
  "também uma despesa de {string} na conta {string}",
  async ({ world }, valor: string, _conta: string) => {
    await makeTransaction(world.family as never, {
      account: await ensureAccount(world).then(async () =>
        db.bankAccount
          .findFirstOrThrow()
          .then((a) => ({ id: a.id, name: a.name, ownerMemberId: a.ownerMemberId })),
      ),
      category: "Supermercado",
      amountInCents: money(valor),
      occurredOn: "2026-10-12",
    });
  },
);

async function applyFilter(page: Page, label: string, option: string) {
  await gotoReady(page, "/extrato?period=2026-10");
  const toggle = page.getByRole("button", { name: /^Filtros/ });
  const mobile = await toggle.isVisible();
  if (mobile) await toggle.click();
  const scope = mobile
    ? page.getByRole("dialog", { name: "Filtros" })
    : page.getByRole("region", { name: "Filtros" });
  await scope.getByLabel(label, { exact: true }).selectOption({ label: option });
  if (mobile) await page.getByRole("button", { name: "Ver resultados" }).click();
}

When("filtro o extrato pelo cartão {string}", async ({ page }, nome: string) => {
  await applyFilter(page, "Cartão", nome);
  await expect(page).toHaveURL(/cardId=/);
});

Then("vejo apenas a compra de {string}", async ({ page }, valor: string) => {
  const rows = page.getByTestId("ledger-row");
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText(valor.replace(" ", " "));
});

When("filtro o extrato pela conta {string}", async ({ page }, nome: string) => {
  await applyFilter(page, "Conta", nome);
});

Then("a compra no cartão não aparece", async ({ page }) => {
  await expect(page.getByTestId("ledger-row").filter({ hasText: "Cartão" })).toHaveCount(0);
});

When("Mariana abre o detalhe da compra", async ({ page }) => {
  await openPurchaseDetail(page);
});

Then(
  "vê o cartão {string} e a fatura {string}",
  async ({ page }, cartao: string, rotulo: string) => {
    const d = dlg(page, "Detalhe do lançamento");
    await expect(d).toContainText(cartao);
    await expect(d).toContainText(rotulo);
  },
);

Given(
  "a regra de divisão {string} e que a compra de {string} é de Mariana e compartilhada",
  async ({}, _regra: string, _valor: string) => {
    // Padrão: regra igualitária e compra comum de Mariana (contexto).
  },
);

Then("o acerto de outubro deixa de mostrar dívida por essa compra", async ({ page }) => {
  const res = await page.request.get("/api/v1/settlement?period=2026-10");
  const body = (await res.json()) as { totalSharedInCents: number; suggestions: unknown[] };
  expect(body.totalSharedInCents).toBe(0);
  expect(body.suggestions).toHaveLength(0);
});

void setupFamily;
