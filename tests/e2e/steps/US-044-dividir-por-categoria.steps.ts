import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { addExpense } from "../support/acerto";
import { openCategorias } from "../support/categorias";
import { Given, Then, When } from "../support/fixtures";
import { drawer, pickCategory } from "../support/lancamento";

const db = testDb();

When("Lucas marca a categoria {string} para dividir por padrão", async ({ page }, nome: string) => {
  await gotoReady(page, "/");
  await openCategorias(page, "Despesa");
  await page.getByRole("button", { name: `Ações da categoria ${nome}` }).click();
  await page.getByRole("menuitem", { name: "Dividir por padrão" }).click();
});

When("Lucas escolhe a categoria {string} no formulário", async ({ page }, nome: string) => {
  await pickCategory(page, nome);
});

When(
  "Lucas escolhe a opção {string} do seletor e a categoria {string} no formulário",
  async ({ page }, opcao: string, nome: string) => {
    await drawer(page)
      .getByRole("radiogroup", { name: "Dividir com a família" })
      .getByRole("radio", { name: opcao })
      .click();
    await pickCategory(page, nome);
  },
);

Given(
  "Lucas tem as despesas {string} {string} de {string} e {string} de {string} em out\\/2026",
  async ({ world }, _modo: string, a: string, va: string, b: string, vb: string) => {
    for (const [desc, valor, day] of [
      [a, va, "2026-10-10"],
      [b, vb, "2026-10-20"],
    ] as const) {
      const t = await addExpense(world, "Lucas", valor, { shared: false, occurredOn: day });
      await db.transaction.update({ where: { id: t.id }, data: { description: desc } });
    }
  },
);

When("Lucas abre o acerto de out\\/2026", async ({ page }) => {
  await gotoReady(page, "/acerto?period=2026-10");
});

Then("o card de revisão diz {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("settlement-review").getByText(texto)).toBeVisible();
});

When("Lucas toca em {string} e divide {string}", async ({ page }, botao: string, item: string) => {
  const card = page.getByTestId("settlement-review");
  await card.getByRole("button", { name: botao, exact: true }).click();
  await expect(card.getByTestId("review-item")).toHaveCount(2);
  await card.getByRole("button", { name: `Dividir ${item}` }).click();
});

Then(
  "a {string} tem cota de {string} para cada membro",
  async ({ page }, desc: string, valor: string) => {
    await expect(page.getByText("Despesa dividida", { exact: true })).toBeVisible();
    const t = await db.transaction.findFirstOrThrow({
      where: { description: desc },
      include: { splits: true },
    });
    expect(t.splitMode).toBe("RULE");
    expect(t.splits.map((s) => Number(s.amountInCents))).toEqual([
      parseBRL(valor),
      parseBRL(valor),
    ]);
  },
);

When("Lucas dispensa o aviso com {string}", async ({ page }, botao: string) => {
  await page.getByTestId("settlement-review").getByRole("button", { name: botao }).click();
});

Then("o aviso de revisão some", async ({ page }) => {
  await expect(page.getByTestId("settlement-review")).toHaveCount(0);
});
