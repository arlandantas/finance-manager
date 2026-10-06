import { expect, type Page } from "@playwright/test";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { setupCouple } from "../support/acerto";
import { Given, Then } from "../support/fixtures";

Given("Lucas está autenticado na Home do layout", async ({ world, page }) => {
  await setupCouple(world);
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  world.data.loggedAs = "Lucas";
});
Given("um viewport do layout de {int} px de largura", async ({ page }, w: number) => {
  await page.setViewportSize({ width: w, height: 900 });
  await gotoReady(page, "/");
});
const sideNav = (p: Page) => p.getByRole("navigation", { name: "Principal", exact: true });
const bottomNav = (p: Page) => p.getByRole("navigation", { name: "Principal (celular)" });

Then(
  "o menu está à esquerda com o item ativo destacado e o conteúdo tem no máximo 960 px à direita dele",
  async ({ page }) => {
    await expect(sideNav(page)).toBeVisible();
    await expect(bottomNav(page)).toBeHidden();
    await expect(sideNav(page).getByRole("link", { name: "Início" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const nav = await sideNav(page).boundingBox();
    const main = await page.locator("main").first().boundingBox();
    expect(nav?.x ?? 0).toBeLessThanOrEqual(1);
    expect(main?.width ?? 0).toBeLessThanOrEqual(960);
    expect(main?.x ?? 0).toBeGreaterThanOrEqual((nav?.x ?? 0) + (nav?.width ?? 0));
  },
);
Then("a navegação está na barra inferior e não há menu lateral", async ({ page }) => {
  await expect(bottomNav(page)).toBeVisible();
  await expect(sideNav(page)).toBeHidden();
});
Then('o botão "+" está visível e dentro da área do conteúdo centralizado', async ({ page }) => {
  const fab = page.getByRole("button", { name: "Novo lançamento" });
  await expect(fab).toBeVisible();
  const box = await fab.boundingBox();
  const main = await page.locator("main").first().boundingBox();
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(
    (main?.x ?? 0) + (main?.width ?? 0) + 24,
  );
  expect(box?.x ?? 0).toBeGreaterThanOrEqual(main?.x ?? 0);
});
Then("nenhuma das seis telas tem rolagem horizontal", async ({ page }) => {
  for (const path of ["/", "/extrato", "/acerto", "/cartoes", "/previstas", "/contas"]) {
    await gotoReady(page, path);
    await page.waitForLoadState("networkidle");
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      path,
    ).toBe(true);
  }
});
