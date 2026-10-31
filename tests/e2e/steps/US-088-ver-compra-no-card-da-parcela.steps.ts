import { expect, type Page } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { Then, When } from "../support/fixtures";

const parcelPattern = (t: string) => {
  const m = /^(.*) (\d+\/\d+)$/.exec(t);
  return m ? new RegExp(`${m[1]}[\\s\\S]*· ${(m[2] as string).replace("/", "\\/")}`) : t;
};
const rows = (page: Page) => page.getByTestId("ledger-row");
/** Contêiner (card) da linha: o `ledger-card` que envolve a linha clicável e as ações. */
const cardOf = (page: Page, titulo: string) =>
  rows(page)
    // "Notebook 2/10" => título + selo "Fatura … · 2/10" (no Extrato a parcela vai no selo)
    .filter({ hasText: parcelPattern(titulo) })
    .first()
    .locator('xpath=ancestor::*[@data-testid="ledger-card"][1]');

Then(
  "a parcela {string} mostra {string} dentro do próprio card",
  async ({ page }, parcela: string, acao: string) => {
    const card = cardOf(page, parcela);
    await expect(card.getByTestId("view-plan")).toHaveCount(1);
    await expect(card.getByRole("button", { name: acao })).toBeVisible();
  },
);

When(
  "Lucas toca no botão {string} da parcela {string}",
  async ({ page }, acao: string, parcela: string) => {
    await cardOf(page, parcela).getByRole("button", { name: acao }).click();
  },
);

Then(
  "vê o total {string} e as {int} parcelas da compra com a fatura de cada uma",
  async ({ page }, total: string, n: number) => {
    const d = page.getByRole("dialog", { name: "Compra parcelada" });
    await expect(d).toBeVisible();
    await expect(d).toContainText(normalizeSpaces(total));
    await expect(d.getByTestId("plan-parcel")).toHaveCount(n);
    await expect(d.getByTestId("plan-parcel").first()).toContainText("nov/2026");
  },
);

Then("a linha {string} não mostra {string}", async ({ page }, titulo: string, acao: string) => {
  await expect(rows(page).filter({ hasText: titulo })).toHaveCount(1);
  await expect(cardOf(page, titulo).getByRole("button", { name: acao })).toHaveCount(0);
});

Then(
  "a ação da parcela {string} é anunciada como botão {string} com dica e alvo de {int} pixels",
  async ({ page }, parcela: string, nome: string, px: number) => {
    const b = cardOf(page, parcela).getByRole("button", { name: nome, exact: true });
    await expect(b).toHaveAttribute("aria-label", nome);
    await expect(b).toHaveAttribute("title", nome);
    const box = await b.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(px);
    expect(box?.height).toBeGreaterThanOrEqual(px);
    // ação do card, não filha da linha clicável (sem button dentro de button)
    expect(await b.evaluate((el) => !!el.closest('[data-testid="ledger-row"]'))).toBe(false);
  },
);
