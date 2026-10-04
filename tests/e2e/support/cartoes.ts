import { expect, type Page } from "@playwright/test";
import { dlg } from "./categorias";

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
