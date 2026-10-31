import { expect, type Locator, type Page } from "@playwright/test";
import { gotoReady } from "../../support/nav";
import type { World } from "../support/fixtures";
import { Given, Then, When } from "../support/fixtures";
import { drawer, openDrawer } from "../support/lancamento";
import { ensureAccount } from "../support/world";

const radio = (scope: Page | Locator, nome: string) =>
  scope.getByRole("radio", { name: nome, exact: true });
/** O formulário só abre com conta cadastrada: cria uma e recarrega a Início. */
async function openForm(page: Page, world: World) {
  await ensureAccount(world);
  await gotoReady(page, "/");
  await openDrawer(page);
}
const group = (page: Page, nome: string) => page.getByRole("radiogroup", { name: nome });

When(/^Mariana abre o lançamento "(Nova [^"]+)"$/, async ({ page, world }, o: string) => {
  if (o === "Nova categoria") {
    await ensureAccount(world); // antes de qualquer visita: o cache de contas do cliente nasce completo
    await gotoReady(page, "/categorias");
    await page.getByRole("button", { name: "Nova categoria" }).click();
    await expect(page.getByRole("dialog", { name: "Nova categoria" })).toBeVisible();
  } else {
    await openForm(page, world);
  }
});
Given(/^que Mariana abre o lançamento "(Nova [^"]+)"$/, async ({ page, world }, _o: string) => {
  await openForm(page, world);
});

Then("{string} aparece selecionado com ícone e texto", async ({ page }, nome: string) => {
  const r = radio(drawer(page), nome);
  await expect(r).toHaveAttribute("aria-checked", "true");
  await expect(r.locator("svg")).toHaveCount(1);
  await expect(r).toHaveText(nome);
});

Then("{string} aparece não selecionado", async ({ page }, nome: string) => {
  await expect(radio(drawer(page), nome)).toHaveAttribute("aria-checked", "false");
});

When("Mariana seleciona {string}", async ({ page }, nome: string) => {
  await radio(drawer(page), nome).click();
});

Then("o título é {string}", async ({ page }, t: string) => {
  await expect(page.getByRole("dialog", { name: t, exact: true })).toBeVisible();
});

Then("o botão de salvar é {string}", async ({ page }, t: string) => {
  await expect(drawer(page).getByRole("button", { name: t, exact: true })).toBeVisible();
});

Then(
  "o seletor {string} tem o mesmo destaque do lançamento",
  async ({ page, world }, _s: string) => {
    const d = page.getByRole("dialog", { name: "Nova categoria" });
    const sel = radio(d, "Despesa");
    await expect(sel).toHaveAttribute("aria-checked", "true");
    await expect(sel.locator("svg")).toHaveCount(1);
    const catClass = await sel.getAttribute("class");
    await page.keyboard.press("Escape");
    await gotoReady(page, "/");
    await openDrawer(page);
    const txClass = await radio(drawer(page), "Despesa").getAttribute("class");
    expect(catClass).toBe(txClass); // componente único
  },
);

Given("que o tema é escuro", async ({ page, world }) => {
  await ensureAccount(world);
  await page.emulateMedia({ colorScheme: "dark" });
  await gotoReady(page, "/");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

Then("o tipo selecionado se distingue pelo ícone e pelo texto além da cor", async ({ page }) => {
  const r = radio(drawer(page), "Despesa");
  await expect(r.locator("svg")).toHaveCount(1);
  await expect(r).toHaveText("Despesa");
  await expect(r).toHaveAttribute("aria-checked", "true");
  const other = radio(drawer(page), "Receita");
  await expect(other).toHaveAttribute("aria-checked", "false");
  const [a, b] = await Promise.all([
    r.evaluate((el) => getComputedStyle(el).backgroundColor),
    other.evaluate((el) => getComputedStyle(el).backgroundColor),
  ]);
  expect(a).not.toBe(b);
});

Then("o texto do tipo selecionado tem contraste AA", async ({ page }) => {
  const ratio = await radio(drawer(page), "Despesa").evaluate((el) => {
    const lum = (css: string) => {
      const m = css
        .match(/[\d.]+/g)
        ?.slice(0, 3)
        .map(Number) ?? [0, 0, 0];
      const [r, g, b] = m.map((v) => {
        const c = (v as number) / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * (r as number) + 0.7152 * (g as number) + 0.0722 * (b as number);
    };
    const s = getComputedStyle(el);
    const [l1, l2] = [lum(s.color), lum(s.backgroundColor)].sort((x, y) => y - x);
    return ((l1 as number) + 0.05) / ((l2 as number) + 0.05);
  });
  expect(ratio).toBeGreaterThanOrEqual(4.5);
});

Given("que o foco está no seletor de tipo", async ({ page, world }) => {
  await openForm(page, world);
  await radio(drawer(page), "Despesa").focus();
});

When("Mariana pressiona a seta para a direita", async ({ page }) => {
  await page.keyboard.press("ArrowRight");
});

Then("{string} fica selecionada", async ({ page }, nome: string) => {
  await expect(radio(drawer(page), nome)).toHaveAttribute("aria-checked", "true");
  await expect(group(page, "Tipo de lançamento")).toBeVisible();
});
