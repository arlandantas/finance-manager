import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { family } from "../support/acerto";
import { Given, Then, When } from "../support/fixtures";
import { drawer, fillAmount, pickCategory, save, waitSaved } from "../support/lancamento";

const db = testDb();
const group = (page: Page) =>
  drawer(page).getByRole("radiogroup", { name: "Dividir com a família" });

Given("a família grava o rateio por lançamento", async ({ world }) => {
  await db.family.update({
    where: { id: family(world).family.id },
    data: { splitEngine: "STORED" },
  });
});

Then(
  "o seletor {string} oferece {string}, {string} e {string}",
  async ({ page }, nome: string, a: string, b: string, c: string) => {
    const g = page.getByRole("dialog").getByRole("radiogroup", { name: nome });
    for (const label of [a, b, c])
      await expect(g.getByRole("radio", { name: label })).toBeVisible();
  },
);

When(
  "Lucas escolhe {string} com Lucas {string} e Mariana {string}",
  async ({ page }, modo: string, lucas: string, mariana: string) => {
    await group(page).getByRole("radio", { name: modo }).click();
    await drawer(page).getByLabel("Percentual de Lucas").fill(lucas);
    await drawer(page).getByLabel("Percentual de Mariana").fill(mariana);
  },
);

Then("vê {string} e não consegue salvar", async ({ page }, msg: string) => {
  await expect(drawer(page).getByRole("alert").filter({ hasText: msg })).toBeVisible();
  await expect(drawer(page).getByRole("button", { name: "Salvar despesa" })).toBeDisabled();
});

When(
  "Lucas corrige para Lucas {string} e Mariana {string} e salva {string} em {string}",
  async ({ page }, lucas: string, mariana: string, valor: string, categoria: string) => {
    await fillAmount(page, valor);
    await pickCategory(page, categoria);
    await drawer(page).getByLabel("Percentual de Lucas").fill(lucas);
    await drawer(page).getByLabel("Percentual de Mariana").fill(mariana);
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);

Then(
  "a despesa mais recente é {string} e a cota de Lucas é {string} e a de Mariana {string}",
  async ({ world }, _modo: string, cotaLucas: string, cotaMariana: string) => {
    const t = await db.transaction.findFirstOrThrow({
      where: { kind: "EXPENSE" },
      orderBy: { createdAt: "desc" },
      include: { splits: true },
    });
    expect(t.splitMode).toBe("CUSTOM");
    const f = family(world);
    const amountOf = (name: string) =>
      Number(t.splits.find((s) => s.memberId === f.byName[name]?.memberId)?.amountInCents ?? 0n);
    expect(amountOf("Lucas")).toBe(parseBRL(cotaLucas));
    expect(amountOf("Mariana")).toBe(parseBRL(cotaMariana));
  },
);
