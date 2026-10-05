import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { addExpense, family, openPanel, setProportionalRule, setupCouple } from "../support/acerto";
import { Given, Then, When } from "../support/fixtures";

Given(
  'a "Família Silva" com os membros {string} e {string} e a regra igual vigente',
  async ({ world }, _a: string, _b: string) => {
    await setupCouple(world);
    // "regra igual vigente desde 01/01/2026": versão explícita (a padrão de 1970 continua existindo)
    await testDb().splitRuleVersion.create({
      data: {
        familyId: family(world).family.id,
        kind: "EQUAL",
        effectiveFrom: new Date("2026-01-01T00:00:00Z"),
      },
    });
  },
);

Given(
  "despesas comuns de setembro de 2026 que somam {string}",
  async ({ world }, valor: string) => {
    await addExpense(world, "Mariana", valor, { occurredOn: "2026-09-10" });
  },
);

Given("despesas comuns de outubro de {string} e regra igual", async ({ world }, valor: string) => {
  await addExpense(world, "Mariana", valor, { occurredOn: "2026-10-02" });
});

Given(
  /^uma nova regra proporcional "(\d+)% \/ (\d+)%" com vigência a partir de (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, m: string, l: string, d: string, mo: string, y: string) => {
    await setProportionalRule(
      world,
      { Mariana: Number(m) * 100, Lucas: Number(l) * 100 },
      `${y}-${mo}-${d}`,
    );
  },
);

Given(
  /^uma despesa comum de "([^"]+)" paga por (Mariana|Lucas) em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, valor: string, quem: "Mariana" | "Lucas", d: string, mo: string, y: string) => {
    expect(parseBRL(valor)).not.toBeNull();
    await addExpense(world, quem, valor, { occurredOn: `${y}-${mo}-${d}` });
  },
);

When("Lucas abre o Acerto de {string}", async ({ world, page }, period: string) => {
  await openPanel(world, page, "Lucas", period);
});

Then("o rótulo da divisão é {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("rule-summary")).toHaveText(texto);
});

Then("o rótulo não menciona {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("rule-summary")).not.toContainText(texto);
});

Then("o painel mostra {string}", async ({ page }, texto: string) => {
  await expect(page.locator("main")).toContainText(texto);
});

Then("o painel não mostra {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("rule-summary"))
    .toBeVisible()
    .catch(() => undefined);
  await expect(page.locator("main")).not.toContainText(texto);
});

When("Lucas abre o histórico de regras de divisão", async ({ page }) => {
  await page.getByText("Ver histórico de regras").click();
});

Then(
  "vê {int} regras no histórico com o percentual e a data de vigência",
  async ({ page }, n: number) => {
    const items = page.getByTestId("rule-history-item");
    await expect(items).toHaveCount(n);
    await expect(items.first()).toContainText("Divisão proporcional");
    await expect(items.first()).toContainText("desde 04/10/2026");
    await expect(items.last()).toContainText("padrão");
  },
);

Given("que o serviço está indisponível para o histórico de regras", async ({ page }) => {
  await page.route("**/api/v1/split-rule/history", (route) => route.abort("failed"));
});
