import { expect, type Locator, type Page } from "@playwright/test";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import { drawer, openDrawer } from "../support/lancamento";
import { ensureAccount } from "../support/world";

const dialogOf = (page: Page) => page.getByRole("dialog").last();
const inViewport = async (page: Page, l: Locator) => {
  const b = await l.boundingBox();
  const vp = page.viewportSize();
  return !!b && !!vp && b.y >= 0 && b.y + b.height <= vp.height && b.x >= 0;
};
const rowGap = (l: Locator) => l.evaluate((el) => getComputedStyle(el).rowGap);

async function open(page: Page, world: World, nome: string) {
  await ensureAccount(world);
  await gotoReady(page, nome === "Nova conta" ? "/contas" : "/");
  if (nome === "Nova conta") {
    await page.getByRole("button", { name: "Nova conta" }).first().click();
    await expect(page.getByRole("dialog", { name: "Nova conta" })).toBeVisible();
  } else {
    await openDrawer(page);
  }
}

Given("a tela tem {int} por {int} pixels", async ({ page }, w: number, h: number) => {
  await page.setViewportSize({ width: w, height: h });
});

When("Mariana abre o formulário-gaveta {string}", async ({ page, world }, nome: string) => {
  await open(page, world, nome);
});

Then("o botão {string} está visível sem rolar", async ({ page }, nome: string) => {
  const b = dialogOf(page).getByRole("button", { name: nome, exact: true });
  await expect(b).toBeVisible();
  expect(await inViewport(page, b)).toBe(true);
});

Then(
  "as categorias ocupam {int} colunas de pelo menos {int} pixels de altura",
  async ({ page }, cols: number, px: number) => {
    const grid = drawer(page).getByRole("radiogroup", { name: "Categoria" });
    await expect(grid.getByRole("radio").first()).toBeVisible();
    const tpl = await grid.evaluate(
      (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
    );
    expect(tpl).toBe(cols);
    const h = await grid
      .getByRole("radio")
      .first()
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(h).toBeGreaterThanOrEqual(px);
  },
);

Then("o espaço entre os campos é o token padrão de {int} pixels", async ({ page }, px: number) => {
  const form = page.getByRole("dialog", { name: "Nova conta" }).locator("form");
  expect(await rowGap(form)).toBe(`${px}px`);
});

Then("o espaço é o mesmo do formulário de lançamento", async ({ page, world }) => {
  const conta = await rowGap(page.getByRole("dialog", { name: "Nova conta" }).locator("form"));
  await open(page, world, "Nova despesa");
  const lanc = await rowGap(drawer(page).locator("form"));
  expect(lanc).toBe(conta);
});

Then(
  "cada campo e botão visível tem pelo menos {int} pixels de altura",
  async ({ page }, px: number) => {
    const small = await dialogOf(page)
      .locator("form")
      .evaluate((form, min) => {
        const vp = innerHeight;
        return [...form.querySelectorAll("input:not([type=hidden]), select, textarea, button")]
          .map((e) => ({
            r: e.getBoundingClientRect(),
            n: e.getAttribute("aria-label") ?? e.id ?? e.tagName,
          }))
          .filter(({ r }) => r.width > 0 && r.height > 0 && r.top < vp && r.bottom > 0)
          .filter(({ r }) => r.height < (min as number) - 0.5)
          .map(({ n, r }) => `${n}:${Math.round(r.height)}`);
      }, px);
    expect(small).toEqual([]);
  },
);

When("Mariana anota a posição do campo {string}", async ({ page, world }, campo: string) => {
  const top = await drawer(page)
    .getByLabel(campo, { exact: true })
    .evaluate((el) => el.getBoundingClientRect().top);
  world.data.fieldTop = top;
});

When("Mariana tenta salvar a despesa vazia", async ({ page }) => {
  await dialogOf(page).getByRole("button", { name: "Salvar despesa", exact: true }).click();
});

Then("a mensagem de valor aparece logo abaixo do campo", async ({ page }) => {
  const input = drawer(page).getByLabel("Valor", { exact: true });
  const err = drawer(page).locator("#tx-amount-error");
  await expect(err).toBeVisible();
  const [a, b] = [await input.boundingBox(), await err.boundingBox()];
  expect((b?.y ?? 0) - ((a?.y ?? 0) + (a?.height ?? 0))).toBeLessThan(24);
});

Then("o campo {string} não mudou de posição", async ({ page, world }, campo: string) => {
  const top = await drawer(page)
    .getByLabel(campo, { exact: true })
    .evaluate((el) => el.getBoundingClientRect().top);
  expect(Math.abs(top - (world.data.fieldTop as number))).toBeLessThanOrEqual(1);
});

When("Mariana toca no campo {string}", async ({ page }, campo: string) => {
  await drawer(page).getByLabel(campo, { exact: false }).first().click();
});

Then("o campo {string} fica dentro da tela", async ({ page }, campo: string) => {
  const f = drawer(page).getByLabel(campo, { exact: false }).first();
  expect(await inViewport(page, f)).toBe(true);
});
