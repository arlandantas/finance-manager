import { expect, type Page } from "@playwright/test";
import { gotoReady } from "../../support/nav";
import { dlg } from "./categorias";

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
