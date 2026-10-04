import { expect, type Page } from "@playwright/test";
import { gotoReady } from "../../support/nav";
import { dlg } from "./categorias";
import type { World } from "./fixtures";
import { drawer, fillAmount, openDrawer, pickCategory, setDate, waitSaved } from "./lancamento";

/** Abre a tela de cartões pelo menu de navegação. */
export async function openCartoes(page: Page) {
  if (!/\/cartoes$/.test(page.url())) {
    await page.getByRole("link", { name: "Cartões", exact: true }).first().click();
    await expect(page).toHaveURL(/\/cartoes$/);
  }
  await expect(page.getByRole("heading", { name: "Cartões" })).toBeVisible();
}

export const cardItem = (page: Page, nome: string) =>
  page.getByTestId("card-item").filter({ hasText: nome });

export async function openNewCard(page: Page) {
  await page.getByRole("button", { name: "Novo cartão" }).first().click();
  const d = dlg(page, "Novo cartão");
  await expect(d).toBeVisible();
  return d;
}

/** Preenche o drawer de novo cartão. `undefined` deixa o campo como está; `null` não preenche. */
export async function fillCard(
  d: ReturnType<Page["getByRole"]>,
  o: { name?: string; limit?: string; closing?: number; due?: number },
) {
  if (o.name !== undefined) await d.getByLabel("Nome", { exact: true }).fill(o.name);
  if (o.limit !== undefined) await d.getByLabel("Limite", { exact: true }).fill(o.limit);
  if (o.closing !== undefined)
    await d.getByLabel("Dia de fechamento", { exact: true }).fill(String(o.closing));
  if (o.due !== undefined)
    await d.getByLabel("Dia de vencimento", { exact: true }).fill(String(o.due));
}

export async function createCardViaUi(
  page: Page,
  o: { name: string; limit?: string; closing?: number; due?: number; save?: boolean },
) {
  const d = await openNewCard(page);
  await fillCard(d, {
    name: o.name,
    limit: o.limit ?? "R$ 1.000,00",
    closing: o.closing ?? 25,
    due: o.due ?? 5,
  });
  if (o.save !== false) await d.getByRole("button", { name: "Salvar cartão" }).click();
  return d;
}

// ── Compra no cartão pelo drawer de despesa (US-016a) ──
/** Garante uma página do app (com o botão "+") antes de abrir o drawer. */
export async function ensureAppPage(page: Page) {
  if (!page.url().startsWith("http")) await gotoReady(page, "/");
}

/** Escolhe em "Pagar com" a opção cujo texto começa com o nome (ex.: "Nubank Mariana · Disponível …"). */
export async function chooseSource(page: Page, nome: string) {
  const select = drawer(page).getByLabel("Pagar com", { exact: true });
  const value = await select.locator("option", { hasText: nome }).first().getAttribute("value");
  if (!value) throw new Error(`Opção "${nome}" não encontrada em "Pagar com"`);
  await select.selectOption(value);
}

export type BuyOptions = {
  amount: string;
  card?: string;
  category?: string;
  date?: string; // ISO
  payer?: string; // primeiro nome
  shared?: boolean;
  /** `false` só preenche; `string` clica no botão com esse rótulo; padrão clica "Salvar Despesa". */
  submit?: false | string;
};

/** Preenche (e por padrão salva) uma despesa; com `card`, paga no cartão. */
export async function fillExpense(page: Page, o: BuyOptions) {
  await ensureAppPage(page);
  await openDrawer(page);
  await fillAmount(page, o.amount);
  await pickCategory(page, o.category ?? "Supermercado");
  if (o.card) await chooseSource(page, o.card);
  if (o.payer) await drawer(page).getByRole("radio", { name: o.payer, exact: true }).click();
  if (o.shared === false) {
    await drawer(page).getByRole("switch", { name: "Dividir com a família" }).click();
  }
  if (o.date) await setDate(page, o.date);
  if (o.submit !== false) {
    await drawer(page)
      .getByRole("button", { name: o.submit ?? "Salvar Despesa" })
      .click();
  }
}

/** Lança no cartão e espera o drawer fechar. */
export async function buyOnCard(page: Page, o: BuyOptions & { card: string }) {
  await fillExpense(page, o);
  await waitSaved(page);
}

export const todayOf = (world: World) => (world.data.today as string | undefined) ?? "2026-10-04";
