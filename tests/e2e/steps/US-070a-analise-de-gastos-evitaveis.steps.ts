import { expect, type Page } from "@playwright/test";
import { seedSilva } from "../../support/analise";
import { testDb } from "../../support/db";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { accountsOf, family } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const SCENARIO_URL = "http://localhost:3101/api/dev/llm-scenario";
const setScenario = async (body: Record<string, unknown>) => {
  const r = await fetch(SCENARIO_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  expect(r.status).toBe(200);
};

export async function openAvoidable(world: World, page: Page, who: "Mariana" | "Lucas" = "Lucas") {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
  await gotoReady(page, "/analise/gastos-evitaveis");
  await expect(page.getByRole("heading", { name: "Gastos evitáveis" })).toBeVisible();
}

Given("4 meses de lançamentos categorizados até set\\/2026 para a análise", async ({ world }) => {
  await seedSilva(family(world), {
    account: accountsOf(world).nubank,
    months: ["2026-06", "2026-07", "2026-08", "2026-09"],
  });
});
Given("apenas 1 mês de lançamentos para a análise", async ({ world }) => {
  await seedSilva(family(world), {
    account: accountsOf(world).nubank,
    months: ["2026-09"],
  });
});
Given("o provedor simulado devolve texto com número", async () => {
  await setScenario({ scenario: "numbers_in_text" });
});
Given("o provedor simulado devolve texto com nome de membro", async () => {
  await setScenario({ scenario: "member_name_in_text" });
});
Given("o provedor simulado responde com erro", async () => {
  await setScenario({ scenario: "unavailable" });
});
Given("o provedor simulado está lento", async () => {
  await setScenario({ delayMs: 15_000 });
});

When("Lucas abre os {string} da análise", async ({ world, page }, _nome: string) => {
  await openAvoidable(world, page);
});

When("toca em {string} na análise", async ({ page }, nome: string) => {
  await page.getByRole("button", { name: nome, exact: true }).click();
});

async function send(world: World, page: Page, month: string, wait: boolean) {
  await openAvoidable(world, page);
  await expect(page.getByTestId("period-label")).toHaveText(month);
  await page.getByRole("button", { name: "Analisar", exact: true }).click();
  await page.getByRole("button", { name: "Enviar para análise" }).click();
  if (wait) {
    // termina com o resultado ou com a mensagem de erro
    await page
      .locator('[data-testid="analysis-body"], [role="alert"]')
      .first()
      .waitFor({ timeout: 20_000 });
  }
}

When("Lucas envia a análise de {string}", async ({ world, page }, month: string) => {
  await send(world, page, month, true);
});
When("Lucas envia a análise de {string} sem esperar", async ({ world, page }, month: string) => {
  await send(world, page, month, false);
});

Then("vê na análise {string}", async ({ page }, texto: string) => {
  await expect(page.locator("main").getByText(texto, { exact: true })).toBeVisible();
});

Then("precisa tocar em {string} para continuar", async ({ page }, nome: string) => {
  await expect(page.getByRole("button", { name: nome })).toBeVisible();
});

Then("nenhuma análise foi salva", async () => {
  // dá tempo a um eventual salvamento tardio
  await new Promise((r) => setTimeout(r, 400));
  expect(await testDb().spendingAnalysis.count()).toBe(0);
});

const group = (page: Page, cls: string) =>
  page
    .getByTestId("analysis-group")
    .filter({ has: page.getByRole("heading", { name: cls, exact: true }) });

Then(
  "a categoria {string} aparece no grupo {string}",
  async ({ page }, cat: string, cls: string) => {
    await expect(
      group(page, cls).getByTestId("analysis-category").filter({ hasText: cat }),
    ).toBeVisible();
  },
);

Then("cada categoria tem uma explicação curta", async ({ page }) => {
  const items = page.getByTestId("analysis-category");
  const n = await items.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const text = ((await items.nth(i).innerText()) ?? "").split("\n").filter(Boolean);
    expect(text.length).toBeGreaterThanOrEqual(3); // nome, valor e motivo
  }
});

Then("vê o selo {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("ai-badge")).toHaveText(texto);
});

Then("o valor de {string} mostrado é {string}", async ({ page }, cat: string, valor: string) => {
  const item = page.getByTestId("analysis-category").filter({ hasText: cat }).first();
  await expect(item).toContainText(valor);
});

Then("a análise não mostra {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("analysis-body")).not.toContainText(texto);
});

Then(
  "o texto da análise não contém o nome {string} nem {string}",
  async ({ page }, a: string, b: string) => {
    const body = page.getByTestId("analysis-body");
    await expect(body).toBeVisible();
    await expect(body).not.toContainText(a);
    await expect(body).not.toContainText(b);
  },
);

Then("vê o aviso fixo da análise {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("analysis-disclaimer")).toHaveText(texto);
});

Then("nenhum lançamento ou categoria foi alterado", async ({ world }) => {
  const db = testDb();
  const txs = await db.transaction.findMany({ where: { familyId: family(world).family.id } });
  expect(txs.every((t) => t.version === 1 && t.updatedByMemberId === null)).toBe(true);
  expect(await db.transactionRevision.count({ where: { action: "UPDATE" } })).toBe(0);
});

Then("o botão {string} está desabilitado na análise", async ({ page }, nome: string) => {
  await expect(page.getByRole("button", { name: nome, exact: true })).toBeDisabled();
});

Then("não há botão {string} na análise", async ({ page }, nome: string) => {
  await expect(page.getByRole("button", { name: nome, exact: true })).toHaveCount(0);
});

Then("vê o erro da análise {string}", async ({ page }, texto: string) => {
  await expect(page.getByRole("alert").filter({ hasText: texto })).toBeVisible();
});

Then("a análise deixa de aparecer como em andamento", async ({ page }) => {
  await expect(page.getByText("Analisando…")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Enviar para análise" })).toBeVisible();
});
