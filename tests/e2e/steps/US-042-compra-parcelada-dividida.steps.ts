import { expect } from "@playwright/test";
import { normalizeSpaces } from "../../support/constants";
import { gotoReady } from "../../support/nav";
import { Then, When } from "../support/fixtures";
import { drawer, waitSaved } from "../support/lancamento";

When(
  "Lucas escolhe dividir {string} e salva a compra parcelada",
  async ({ page }, modo: string) => {
    await drawer(page)
      .getByRole("radiogroup", { name: /Dividir com a família/ })
      .getByRole("radio", { name: new RegExp(modo.split(" ").slice(0, 2).join(" ")) })
      .click();
    await drawer(page).getByRole("button", { name: "Salvar Despesa" }).click();
    await waitSaved(page);
  },
);

When("Lucas abre o acerto de nov\\/2026 e as despesas comuns", async ({ page }) => {
  await gotoReady(page, "/acerto?period=2026-11");
  await page.getByText("Ver despesas comuns do período", { exact: true }).click();
});

Then("o acerto lista {string} com {string}", async ({ page }, titulo: string, valor: string) => {
  const item = page.getByTestId("shared-expense").filter({ hasText: titulo });
  await expect(item).toHaveCount(1);
  expect(normalizeSpaces(await item.innerText())).toContain(normalizeSpaces(valor));
});

Then("Lucas pagou {string} no acerto de nov\\/2026", async ({ page }, valor: string) => {
  const res = await page.request.get("/api/v1/settlement?period=2026-11");
  const body = (await res.json()) as {
    members: Array<{ member: { name: string }; paidInCents: number }>;
  };
  const lucas = body.members.find((m) => m.member.name.startsWith("Lucas"));
  expect(lucas?.paidInCents).toBe(Number(valor.replace(/\D/g, "")));
});
