import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { family } from "../support/acerto";
import { createAnalysisVia, loginAsMember } from "../support/analise";
import { Given, Then, When, type World } from "../support/fixtures";

const PERIODS: Record<string, string> = { "ago/2026": "2026-08", "set/2026": "2026-09" };
const rows = (page: Page) => page.getByTestId("history-row");

Given(
  "duas análises salvas de {string} e {string}",
  async ({ world, page }, a: string, b: string) => {
    const first = await createAnalysisVia(world, page, "Lucas", PERIODS[a] as string);
    await createAnalysisVia(world, page, "Lucas", PERIODS[b] as string);
    // o relógio do E2E é fixo: separa as datas de geração para a ordenação ser determinística
    await testDb().spendingAnalysis.update({
      where: { id: first },
      data: { createdAt: new Date("2026-10-03T15:00:00Z") },
    });
  },
);

async function openHistory(world: World, page: Page) {
  await loginAsMember(world, page, "Lucas");
  await gotoReady(page, "/analise/gastos-evitaveis?aba=historico");
  await expect(page.getByRole("heading", { name: "Gastos evitáveis" })).toBeVisible();
}

When("Lucas abre o {string} da análise", async ({ world, page }, _aba: string) => {
  await openHistory(world, page);
});

Then(
  "vê as análises {string} e {string} com data de geração",
  async ({ page }, a: string, b: string) => {
    await expect(rows(page)).toHaveCount(2);
    await expect(rows(page).nth(0)).toContainText(a);
    await expect(rows(page).nth(1)).toContainText(b);
    for (const i of [0, 1]) {
      await expect(rows(page).nth(i)).toContainText(/Gerada em \d{2}\/\d{2}\/\d{4}/);
    }
  },
);

When(
  "Lucas abre a análise de {string} no histórico e toca em {string}",
  async ({ world, page }, mes: string, botao: string) => {
    await openHistory(world, page);
    await rows(page).filter({ hasText: mes }).getByRole("link").click();
    await expect(page.getByTestId("analysis-body")).toBeVisible();
    await page.getByRole("button", { name: botao, exact: true }).click();
  },
);

Then("vê os totais por categoria e os valores recorrentes enviados", async ({ page }) => {
  const sent = page.getByTestId("sent-data");
  await expect(sent).toContainText("Totais por categoria");
  await expect(sent).toContainText("Moradia");
  await expect(sent).toContainText("Valores recorrentes");
  await expect(sent).toContainText("Recorrente 1");
});

Then("não vê nomes de pessoas nem dados de conta no que foi enviado", async ({ page }) => {
  const sent = page.getByTestId("sent-data");
  await page.getByRole("button", { name: "Ver o JSON exato" }).click();
  for (const t of ["Mariana", "Lucas", "Silva", "Nubank", "Streaming", "@"]) {
    await expect(sent).not.toContainText(t);
  }
});

When("apaga a análise de {string} e confirma", async ({ page }, mes: string) => {
  await rows(page)
    .filter({ hasText: mes })
    .getByRole("button", { name: /Apagar/ })
    .click();
  await page.getByRole("dialog").getByRole("button", { name: "Apagar", exact: true }).click();
});

Then("a análise de {string} some do histórico", async ({ page }, mes: string) => {
  await expect(rows(page).filter({ hasText: mes })).toHaveCount(0);
});
Then("a análise de {string} continua no histórico", async ({ page }, mes: string) => {
  await expect(rows(page).filter({ hasText: mes })).toHaveCount(1);
});

When("toca em {string} e confirma", async ({ page }, botao: string) => {
  await page.getByRole("button", { name: botao, exact: true }).click();
  const dialog = page.getByRole("dialog");
  if (botao === "Apagar todo o histórico") {
    await expect(dialog).toContainText("As sugestões descartadas continuam salvas");
  }
  await dialog.getByRole("button", { name: "Apagar", exact: true }).click();
});

Then("o histórico fica vazio", async ({ page }) => {
  await expect(page.getByTestId("history-empty")).toBeVisible();
  expect(await testDb().spendingAnalysis.count()).toBe(0);
});

Then("as sugestões descartadas continuam salvas", async ({ page }) => {
  expect(await testDb().avoidableDismissal.count()).toBe(1);
  await expect(page.getByTestId("dismissed-item").filter({ hasText: "Streaming X" })).toBeVisible();
});

Then("todos os lançamentos continuam presentes", async ({ world }) => {
  const n = await testDb().transaction.count({
    where: { familyId: family(world).family.id, kind: { in: ["EXPENSE", "INCOME"] } },
  });
  expect(n).toBe(24); // 6 lançamentos por mês x 4 meses
});
