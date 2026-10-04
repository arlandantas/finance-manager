import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { fillPayInvoice, openPayInvoice } from "./cartoes";
import { dlg } from "./categorias";
import type { World } from "./fixtures";

export const PERIOD_NOV = "2026-11";

/** Abre "Contas a pagar" pelo menu de navegação (mês corrente). */
export async function openPrevistas(page: Page) {
  if (!/\/previstas/.test(page.url())) {
    await page.getByRole("link", { name: "A pagar", exact: true }).first().click();
    await expect(page).toHaveURL(/\/previstas/);
  }
  await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible();
}

export async function openPrevistasOf(page: Page, period: string) {
  await gotoReady(page, `/previstas?period=${period}`);
  await expect(page.getByRole("heading", { name: "Contas a pagar" })).toBeVisible();
}

export const payableItem = (page: Page, title: string) =>
  page.getByTestId("payable-item").filter({ hasText: title });

export async function openNewPlanned(page: Page) {
  await page.getByRole("button", { name: "Nova despesa prevista" }).first().click();
  const d = dlg(page, "Nova despesa prevista");
  await expect(d).toBeVisible();
  return d;
}

export type PlannedForm = {
  description?: string;
  amount?: string;
  category?: string;
  responsible?: string;
  due?: string; // ISO
  shared?: boolean;
  note?: string;
};

export async function fillPlanned(d: ReturnType<Page["getByRole"]>, o: PlannedForm) {
  if (o.description !== undefined)
    await d.getByLabel("Descrição", { exact: true }).fill(o.description);
  if (o.amount !== undefined) await d.getByLabel("Valor previsto", { exact: true }).fill(o.amount);
  if (o.category) await d.getByRole("radio", { name: o.category, exact: true }).click();
  if (o.responsible) await d.getByRole("radio", { name: o.responsible, exact: true }).click();
  if (o.shared === false) await d.getByRole("switch", { name: "Dividir com a família" }).click();
  if (o.due || o.note) {
    const due = d.getByLabel("Vencimento", { exact: true });
    if (!(await due.isVisible())) await d.getByText("Mais detalhes").click();
    if (o.due) await due.fill(o.due);
    if (o.note) await d.getByLabel("Observação", { exact: true }).fill(o.note);
  }
}

export async function createPlannedViaUi(
  page: Page,
  o: PlannedForm & { description: string; amount: string; save?: boolean },
) {
  const d = await openNewPlanned(page);
  await fillPlanned(d, { category: "Moradia", ...o });
  if (o.save !== false) await d.getByRole("button", { name: "Salvar", exact: true }).click();
  return d;
}

// ── Baixa (US-019) ──
/** POST na API com a sessão do navegador (usado para semear estados já pagos). */
export async function apiPost(page: Page, path: string, data: unknown) {
  const res = await page.request.post(path, {
    headers: { origin: "http://localhost:3101", "idempotency-key": randomUUID() },
    data,
  });
  return { status: res.status(), body: (await res.json()) as Record<string, any> };
}

export async function plannedIdOf(description: string, dueOn = "2026-11-10") {
  const row = await testDb().plannedExpense.findFirstOrThrow({
    where: { description, dueOn: new Date(`${dueOn}T00:00:00Z`) },
  });
  return { id: row.id, version: row.version };
}

/** Semeia a baixa pela API (como o app faria). */
export async function payViaApi(
  page: Page,
  world: World,
  description: string,
  o: { amountInCents?: number; accountName?: string; dueOn?: string } = {},
) {
  const db = testDb();
  const { id, version } = await plannedIdOf(description, o.dueOn);
  const account = await db.bankAccount.findFirstOrThrow({
    where: { name: o.accountName ?? "Itaú Lucas" },
  });
  const res = await apiPost(page, `/api/v1/planned-expenses/${id}/pay`, {
    version,
    accountId: account.id,
    ...(o.amountInCents ? { amountInCents: o.amountInCents } : {}),
  });
  if (res.status !== 201) throw new Error(`baixa semeada falhou: ${JSON.stringify(res.body)}`);
  world.data.plannedId = id;
  return res.body;
}

export const payDrawer = (page: Page, title: string) => dlg(page, `Dar baixa em ${title}`);

export async function openPay(page: Page, title: string) {
  await page
    .getByRole("button", { name: `Dar baixa em ${title}`, exact: true })
    .first()
    .click();
  const d = payDrawer(page, title);
  await expect(d).toBeVisible();
  await expect(d.getByLabel("Valor pago")).not.toHaveValue("R$ 0,00");
  return d;
}

export async function fillPay(
  d: ReturnType<Page["getByRole"]>,
  o: { amount?: string; account?: string | null; payer?: string; date?: string },
) {
  if (o.amount !== undefined) await d.getByLabel("Valor pago").fill(o.amount);
  if (o.account) {
    const select = d.getByLabel("Conta", { exact: true });
    const value = await select
      .locator("option", { hasText: o.account })
      .first()
      .getAttribute("value");
    await select.selectOption(value as string);
  }
  if (o.account === null) {
    await d.getByLabel("Conta", { exact: true }).evaluate((el) => {
      const s = el as HTMLSelectElement;
      s.value = "";
      s.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  if (o.payer) await d.getByRole("radio", { name: o.payer, exact: true }).click();
  if (o.date) {
    const date = d.getByLabel("Data do pagamento", { exact: true });
    if (!(await date.isVisible())) await d.getByText("Mais detalhes").click();
    await date.fill(o.date);
  }
}

export async function confirmPay(d: ReturnType<Page["getByRole"]>, label = "Confirmar pagamento") {
  await d.getByRole("button", { name: label }).click();
}

/** Duplo clique em "Confirmar pagamento" (usado pelo passo comum "toca duas vezes" da US-005). */
export async function doubleClickPay(page: Page, botao: string, world?: World) {
  if (world?.data.invoiceContext) {
    // US-017b: pagamento da fatura
    const d = await openPayInvoice(page, world);
    await fillPayInvoice(d, { account: "Itaú Lucas" });
    await d.getByRole("button", { name: botao }).dblclick();
    await expect(page.getByText("Fatura paga com sucesso!")).toBeVisible();
    return;
  }
  await openPrevistasOf(page, PERIOD_NOV);
  const d = await openPay(page, "Condomínio");
  await d.getByRole("button", { name: botao }).dblclick();
  await expect(page.getByText("Pagamento registrado com sucesso!")).toBeVisible();
}
