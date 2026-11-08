import { expect } from "@playwright/test";
import { testDb } from "../../support/db";
import { family } from "../support/acerto";
import { Given, Then, When } from "../support/fixtures";

Given("que a família permite o token pessoal", async ({ world }) => {
  await testDb().family.update({
    where: { id: family(world).family.id },
    data: { assistantPatEnabled: true },
  });
});

async function openDialog({ page }: { page: import("@playwright/test").Page }, nome: string) {
  await page.getByRole("button", { name: "Gerar token pessoal" }).click();
  await page.getByRole("dialog").getByLabel("Nome do token").fill(nome);
}

When(
  "Lucas abre o diálogo de gerar token pessoal com o nome {string}",
  async ({ page }, nome: string) => openDialog({ page }, nome),
);

When(
  "gera o token pessoal {string} com validade padrão",
  async ({ page, context }, nome: string) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await openDialog({ page }, nome);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Gerar token", exact: true })
      .click();
  },
);

When("Lucas gera o token e toca em {string}", async ({ page }, acao: string) => {
  await page.getByRole("dialog").getByRole("button", { name: "Gerar token", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: acao }).click();
});

Then("vê o valor do token pessoal com o aviso {string}", async ({ page }, aviso: string) => {
  const d = page.getByRole("dialog");
  await expect(d).toContainText(aviso);
  await expect(page.getByTestId("pat-value")).toHaveValue(/^fmp_[A-Za-z0-9_-]{43}$/);
  await d.getByRole("button", { name: "Copiar" }).click();
  await expect(page.getByText("Token copiado")).toBeVisible();
});

When("Lucas fecha o token com {string}", async ({ page }, nome: string) => {
  await page.getByRole("dialog").getByRole("button", { name: nome }).click();
});

Then("o valor do token pessoal não está mais na tela", async ({ page }) => {
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("pat-value")).toHaveCount(0);
  expect(await page.content()).not.toMatch(/fmp_[A-Za-z0-9_-]{43}/);
});

Then("vê o token pessoal {string} na lista sem o valor", async ({ page }, nome: string) => {
  const c = page.getByTestId("connection").filter({ hasText: nome });
  await expect(c).toBeVisible();
  await expect(c.getByTestId("connection-kind")).toHaveText("Token pessoal");
  expect(await page.content()).not.toMatch(/fmp_[A-Za-z0-9_-]{43}/);
  const stored = await page.evaluate(() => JSON.stringify([localStorage, sessionStorage]));
  expect(stored).not.toMatch(/fmp_/);
  expect(page.url()).not.toMatch(/fmp_/);
});

When("Lucas recarrega a tela do assistente", async ({ page }) => {
  await page.reload();
  await expect(page.getByRole("heading", { name: "Assistente de IA", level: 1 })).toBeVisible();
});

Then("o botão {string} está desabilitado", async ({ page }, nome: string) => {
  await expect(
    page.getByRole("dialog").getByRole("button", { name: nome, exact: true }),
  ).toBeDisabled();
});
Then("o botão {string} está habilitado", async ({ page }, nome: string) => {
  await expect(
    page.getByRole("dialog").getByRole("button", { name: nome, exact: true }),
  ).toBeEnabled();
});

Then("o token pessoal {string} exige confirmação no app", async ({ page }, nome: string) => {
  const c = page.getByTestId("connection").filter({ hasText: nome });
  await expect(c.getByRole("switch", { name: "Exigir confirmação no app" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

Then("não há botão {string}", async ({ page }, nome: string) => {
  await expect(page.getByRole("button", { name: nome })).toHaveCount(0);
});
Then("há botão {string}", async ({ page }, nome: string) => {
  await expect(page.getByRole("button", { name: nome })).toBeVisible();
});

When("Mariana liga {string}", async ({ page }, nome: string) => {
  await page.getByRole("switch", { name: nome }).click();
  await expect(page.getByRole("switch", { name: nome })).toHaveAttribute("aria-checked", "true");
});
