import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";

import { family } from "../support/acerto";
import { createAnalysisVia, loginAsMember } from "../support/analise";
import { Given, Then, When, type World } from "../support/fixtures";

const ORIGIN = "http://localhost:3101";
const card = (page: Page, nome: string) =>
  page.getByTestId("avoidable-card").filter({ has: page.getByRole("heading", { name: nome }) });

const as = loginAsMember;

async function createAnalysis(world: World, page: Page, who: "Mariana" | "Lucas") {
  return createAnalysisVia(world, page, who, "2026-09");
}

Given(
  "uma análise de {string} feita por Lucas com o gasto evitável {string}",
  async ({ world, page }, _mes: string, _nome: string) => {
    await createAnalysis(world, page, "Lucas");
  },
);

async function openAnalysis(world: World, page: Page, who: "Mariana" | "Lucas") {
  await as(world, page, who);
  await gotoReady(page, `/analise/gastos-evitaveis/${world.data.analysisId as string}`);
  await expect(page.getByTestId("analysis-body")).toBeVisible();
}

When(
  "Lucas abre a análise feita e toca em {string} em {string}",
  async ({ world, page }, botao: string, nome: string) => {
    await openAnalysis(world, page, "Lucas");
    await card(page, nome).getByRole("button", { name: botao }).click();
  },
);
When("Mariana abre a análise feita", async ({ world, page }) => {
  await openAnalysis(world, page, "Mariana");
});
When(
  "Mariana abre a análise feita e toca em {string} em {string}",
  async ({ world, page }, botao: string, nome: string) => {
    await openAnalysis(world, page, "Mariana");
    await page
      .getByTestId("dismissed-item")
      .filter({ hasText: nome })
      .getByRole("button", { name: botao })
      .click();
  },
);

Given("que Lucas descartou {string}", async ({ world, page }, nome: string) => {
  const id = world.data.analysisId as string;
  const r = await page.request.get(`/api/v1/ai/spending-analyses/${id}`);
  const dto = (await r.json()) as { avoidable: { key: string; displayName: string }[] };
  const key = dto.avoidable.find((a) => a.displayName === nome)?.key;
  expect(key).toBeTruthy();
  const d = await page.request.post("/api/v1/ai/avoidable-dismissals", {
    data: { analysisId: id, key },
    headers: { origin: ORIGIN, "idempotency-key": randomUUID() },
  });
  expect(d.status()).toBe(201);
});

Then("{string} sai da lista de possíveis gastos evitáveis", async ({ page }, nome: string) => {
  await expect(card(page, nome)).toHaveCount(0);
});

const toast = (page: Page) => page.locator("[data-sonner-toast]");

Then("vê o aviso de descarte {string}", async ({ page }, texto: string) => {
  await expect(toast(page).filter({ hasText: texto })).toBeVisible();
});
Then("o aviso de descarte oferece {string}", async ({ page }, acao: string) => {
  await expect(toast(page).getByRole("button", { name: acao })).toBeVisible();
});
When("toca em {string} no aviso de descarte", async ({ page }, acao: string) => {
  await toast(page).getByRole("button", { name: acao }).click();
});

Then("o gasto evitável {string} volta à lista", async ({ page }, nome: string) => {
  await expect(card(page, nome)).toBeVisible();
});

Then("{string} não aparece como possível gasto evitável", async ({ page }, nome: string) => {
  await expect(page.getByTestId("analysis-body")).toBeVisible();
  await expect(card(page, nome)).toHaveCount(0);
});

Then(
  "{string} aparece em {string} das descartadas",
  async ({ page }, nome: string, secao: string) => {
    const section = page
      .locator("section")
      .filter({ has: page.getByRole("heading", { name: secao }) });
    await expect(section.getByTestId("dismissed-item").filter({ hasText: nome })).toBeVisible();
  },
);

Then("a análise seguinte pode apontar {string} de novo", async ({ world, page }, nome: string) => {
  await createAnalysis(world, page, "Lucas");
  await gotoReady(page, `/analise/gastos-evitaveis/${world.data.analysisId as string}`);
  await expect(card(page, nome)).toBeVisible();
});

Then(
  "os lançamentos de {string} continuam no Extrato sem alteração",
  async ({ world }, nome: string) => {
    const rows = await testDb().transaction.findMany({
      where: { familyId: family(world).family.id, description: nome },
    });
    expect(rows).toHaveLength(4);
    expect(rows.every((t) => t.version === 1 && t.deletedAt === null)).toBe(true);
  },
);
