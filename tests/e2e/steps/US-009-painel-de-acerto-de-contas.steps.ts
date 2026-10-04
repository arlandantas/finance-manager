import { expect } from "@playwright/test";
import type { DataTable } from "playwright-bdd";
import { normalizeSpaces } from "../../support/constants";
import {
  addExpense,
  memberCard,
  openPanel,
  setProportionalRule,
  setupCouple,
} from "../support/acerto";
import { Given, Then, When } from "../support/fixtures";

type Name = "Mariana" | "Lucas";

Given("a regra 50\\/50 e as despesas comuns de outubro:", async ({ world }, table: DataTable) => {
  await setupCouple(world);
  for (const r of table.hashes()) {
    await addExpense(world, r["quem pagou"] as Name, r.valor as string);
  }
});

When("abro o painel de acerto de outubro", async ({ world, page }) => {
  await openPanel(world, page, "Lucas", "2026-10");
});

When("abro o painel de acerto", async ({ world, page }) => {
  await openPanel(world, page, "Mariana");
});

Then(
  "{word}: pagou {string}, cota {string}, diferença {string}",
  async ({ page }, nome: string, pagou: string, cota: string, dif: string) => {
    const card = memberCard(page, nome);
    await expect(card).toBeVisible();
    const text = normalizeSpaces(await card.innerText()).replace(/\s+/g, " ");
    expect(text).toContain(`Pagou ${pagou}`);
    expect(text).toContain(`Cota devida ${cota}`);
    expect(text).toContain(`Diferença ${dif}`);
  },
);

Given("uma despesa pessoal de {string} de Mariana", async ({ world }, valor: string) => {
  await setupCouple(world);
  await addExpense(world, "Mariana", valor, { shared: false });
});

Then("o total comum não inclui {string}", async ({ page }, valor: string) => {
  const total = normalizeSpaces(await page.getByTestId("settlement-total").innerText());
  expect(total).not.toContain(valor);
  expect(total).toContain("R$ 0,00");
});

Given(
  "a regra 60% \\/ 40% e total comum de {string} pago integralmente por Mariana",
  async ({ world }, valor: string) => {
    await setupCouple(world);
    await setProportionalRule(world, { Mariana: 6000, Lucas: 4000 });
    await addExpense(world, "Mariana", valor);
  },
);

Then(
  "a cota de Mariana é {string} e a de Lucas é {string}",
  async ({ page }, m: string, l: string) => {
    await expect(memberCard(page, "Mariana").getByTestId("quota")).toHaveText(m);
    await expect(memberCard(page, "Lucas").getByTestId("quota")).toHaveText(l);
  },
);

Given(
  "a regra 50\\/50 e uma única despesa comum de {string} paga por Mariana",
  async ({ world }, valor: string) => {
    await setupCouple(world);
    await addExpense(world, "Mariana", valor);
  },
);

Then("as cotas somam exatamente {string}", async ({ page }, total: string) => {
  const quotas = await page.getByTestId("quota").allInnerTexts();
  const cents = quotas.map((q) => {
    const m = /(\d[\d.]*),(\d{2})/.exec(normalizeSpaces(q));
    return Number((m?.[1] ?? "0").replace(/\./g, "") + (m?.[2] ?? "00"));
  });
  const expected = /(\d[\d.]*),(\d{2})/.exec(total);
  expect(cents.reduce((a, b) => a + b, 0)).toBe(
    Number((expected?.[1] ?? "0").replace(/\./g, "") + (expected?.[2] ?? "00")),
  );
});

Then("uma cota é {string} e a outra {string}", async ({ page }, a: string, b: string) => {
  const quotas = (await page.getByTestId("quota").allInnerTexts()).map(normalizeSpaces).sort();
  expect(quotas).toEqual([a, b].sort());
});

Given("que ambos pagaram o mesmo valor em despesas comuns", async ({ world }) => {
  await setupCouple(world);
  await addExpense(world, "Mariana", "R$ 500,00");
  await addExpense(world, "Lucas", "R$ 500,00");
});

Then("vejo {string} e nenhuma sugestão de transferência", async ({ page }, texto: string) => {
  await expect(page.getByTestId("settlement-hero")).toContainText(texto);
  await expect(page.getByTestId("settlement-hero")).toHaveAttribute("data-status", "BALANCED");
  await expect(page.getByTestId("settlement-suggestions")).toHaveCount(0);
  await expect(page.getByText(/ deve R\$/)).toHaveCount(0);
});

Given("que não há despesas comuns no mês", async ({ world }) => {
  await setupCouple(world);
});

Then("vejo o estado vazio explicativo e nenhum valor devido", async ({ page }) => {
  const hero = page.getByTestId("settlement-hero");
  await expect(hero).toContainText("Nenhuma despesa comum neste mês.");
  await expect(hero).toContainText("Marque despesas como Dividir com a família para vê-las aqui.");
  await expect(page.getByText(/ deve R\$/)).toHaveCount(0);
});

Given("que a família tem apenas Mariana", async ({ world }) => {
  await setupCouple(world, { onlyMariana: true });
});

Then(
  "vejo que o acerto exige pelo menos dois membros e a ação {string}",
  async ({ page }, acao: string) => {
    await expect(page.getByTestId("settlement-hero")).toContainText(
      "O acerto exige pelo menos dois membros",
    );
    await expect(page.getByRole("link", { name: acao })).toHaveAttribute("href", "/familia");
  },
);

Given("despesas comuns de setembro e de outubro", async ({ world }) => {
  await setupCouple(world);
  await addExpense(world, "Mariana", "R$ 300,00", { occurredOn: "2026-09-15" });
  await addExpense(world, "Mariana", "R$ 900,00", { occurredOn: "2026-10-02" });
});

When("navego para o mês anterior", async ({ page }) => {
  await page.getByRole("button", { name: "Mês anterior" }).click();
});

Then("o painel recalcula apenas com as despesas daquele mês", async ({ page }) => {
  await expect(page).toHaveURL(/period=2026-09/);
  await expect(page.getByTestId("period-label")).toHaveText("Setembro de 2026");
  await expect(page.getByTestId("settlement-total")).toContainText("R$ 300,00");
  await expect(page.getByTestId("settlement-total")).not.toContainText("R$ 900,00");
  await expect(page.getByTestId("settlement-hero")).toContainText(
    "Lucas deve R$ 150,00 para Mariana",
  );
});
