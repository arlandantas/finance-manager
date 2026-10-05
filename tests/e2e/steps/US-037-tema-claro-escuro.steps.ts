import { expect, type Page } from "@playwright/test";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const theme = (p: Page) => p.evaluate(() => document.documentElement.getAttribute("data-theme"));

Given("Lucas está na Home para o tema", async ({ world, page }) => {
  await setupCouple(world);
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  world.data.loggedAs = "Lucas";
});
Given(
  /^que o sistema operacional está em modo (escuro|claro) e Lucas nunca escolheu um tema$/,
  async ({ page }, modo: string) => {
    await page.emulateMedia({ colorScheme: modo === "escuro" ? "dark" : "light" });
  },
);
When("Lucas abre a Home para o tema", async ({ page }) => {
  await gotoReady(page, "/");
});
Then('o tema escuro está aplicado e "Sistema" está marcada em "Aparência"', async ({ page }) => {
  expect(await theme(page)).toBe("dark");
  await page.getByRole("button", { name: /^Menu do usuário/ }).click();
  await expect(page.getByRole("menuitemradio", { name: "Sistema" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});
When("Lucas escolhe o tema {string}", async ({ page }, nome: string) => {
  if (!/localhost/.test(page.url()) || page.url() === "about:blank") await gotoReady(page, "/");
  const radio = page.getByRole("menuitemradio", { name: nome });
  if (!(await radio.isVisible()))
    await page.getByRole("button", { name: /^Menu do usuário/ }).click();
  await radio.click();
});
Then("o tema aplicado é {string}", async ({ page }, t: string) => {
  await expect.poll(() => theme(page)).toBe(t);
});
When("Lucas recarrega a página do tema", async ({ page }) => {
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
});
When(
  "Lucas abre o app em um celular que nunca usou com o sistema claro",
  async ({ browser, world }) => {
    const ctx = await browser.newContext({
      baseURL: "http://localhost:3101",
      colorScheme: "light",
    });
    const p = await ctx.newPage();
    await loginAs(p, { email: "lucas@exemplo.com", name: "Lucas Silva" });
    await gotoReady(p, "/");
    world.data.otherPage = p;
  },
);
Then("o tema aplicado no outro dispositivo é {string}", async ({ world }, t: string) => {
  expect(await theme(world.data.otherPage as Page)).toBe(t);
});
Given(
  "que Lucas escolheu o tema {string} e a página registra o primeiro tema aplicado",
  async ({ page }, nome: string) => {
    await gotoReady(page, "/");
    await page.getByRole("button", { name: /^Menu do usuário/ }).click();
    await page.getByRole("menuitemradio", { name: nome }).click();
    await page.addInitScript(() => {
      // registra o primeiro `data-theme` aplicado (antes de qualquer pintura)
      const real = Element.prototype.setAttribute;
      Element.prototype.setAttribute = function (this: Element, k: string, v: string) {
        const w = window as unknown as { __firstTheme?: string };
        if (k === "data-theme" && !w.__firstTheme) w.__firstTheme = v;
        return real.call(this, k, v);
      };
    });
  },
);
Then("o primeiro tema registrado foi {string}", async ({ page }, t: string) => {
  expect(
    await page.evaluate(() => (window as unknown as { __firstTheme?: string }).__firstTheme),
  ).toBe(t);
});
Given("que o navegador não permite guardar o tema", async ({ page }) => {
  await page.addInitScript(() => {
    const deny = () => {
      throw new DOMException("negado", "SecurityError");
    };
    Storage.prototype.getItem = deny;
    Storage.prototype.setItem = deny;
  });
  await page.emulateMedia({ colorScheme: "light" });
  await gotoReady(page, "/");
});

export type { World };
