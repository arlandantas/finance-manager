import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { addExpense, family, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";
import { setToday } from "../support/world";

const NB = (s: string) => s.replace(/R\$ /g, "R$ ");
const lines = (page: Page) => page.getByTestId("home-settlement-lines");

Given(
  /^a família do indicador de acerto com Mariana e Lucas e hoje (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, d: string, m: string, y: string) => {
    await setupCouple(world);
    await setToday(`${y}-${m}-${d}`);
  },
);

const when = (q: string) =>
  q.startsWith("maio") ? "2025-05-10" : q.startsWith("setembro") ? "2026-09-10" : "2026-10-02";

Given(
  /^uma diferença do indicador de "([^"]+)" em (outubro de 2026|setembro de 2026|maio de 2025)$/,
  async ({ world }, valor: string, quando: string) => {
    // diferença a acertar = metade da despesa paga por um só membro (50/50)
    const cents = Math.round(Number(valor.replace(/[^\d,]/g, "").replace(",", ".")) * 200);
    await addExpense(world, "Mariana", `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`, {
      occurredOn: when(quando),
    });
  },
);

Given("despesas iguais pagas por cada membro em outubro de 2026", async ({ world }) => {
  await addExpense(world, "Mariana", "R$ 100,00", { occurredOn: "2026-10-02" });
  await addExpense(world, "Lucas", "R$ 100,00", { occurredOn: "2026-10-03" });
});

Given("o acerto está desligado na família do indicador", async ({ world }) => {
  await testDb().family.update({
    where: { id: family(world).family.id },
    data: { settlementEnabled: false },
  });
});

When("Lucas abre a Home do indicador", async ({ world, page }) => {
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  world.data.loggedAs = "Lucas";
  await gotoReady(page, "/");
  await expect(page.getByTestId("home-summary")).toBeVisible();
});

Then(
  "o Resumo mostra a linha {string} sem a palavra {string}",
  async ({ page }, texto: string, proibido: string) => {
    await expect(lines(page)).toContainText(NB(texto));
    await expect(lines(page)).not.toContainText(new RegExp(`\\b${proibido}\\b`));
  },
);
Then("o Resumo mostra a linha {string}", async ({ page }, texto: string) => {
  await expect(lines(page)).toContainText(texto);
});
Then("a Home não tem um card separado {string}", async ({ page }, titulo: string) => {
  await expect(page.getByRole("region", { name: titulo, exact: true })).toHaveCount(0);
});
Then("o Resumo não mostra nenhuma linha de acerto", async ({ page }) => {
  await expect(page.getByTestId("home-summary")).toBeVisible();
  await expect(lines(page)).toHaveCount(0);
});
Then("o Resumo não mostra o aviso de meses anteriores", async ({ page }) => {
  await expect(page.getByTestId("home-summary")).toBeVisible();
  await expect(page.getByTestId("home-settlement-previous")).toHaveCount(0);
});
When("Lucas toca na linha de acerto do mês", async ({ page }) => {
  await page.getByTestId("home-settlement").click();
});
When("Lucas toca no aviso de meses anteriores", async ({ page }) => {
  await page.getByTestId("home-settlement-previous").click();
});
Then("Lucas vê o painel de Acerto de {string}", async ({ page }, key: string) => {
  await expect(page).toHaveURL(new RegExp(`/acerto\\?period=${key}`));
  await expect(page.getByRole("heading", { name: "Acerto de contas" })).toBeVisible();
});

export type { World };
