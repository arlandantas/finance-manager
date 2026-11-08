import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { family } from "../support/acerto";
import { assistantCall, openAssistant } from "../support/assistente";
import { Given, Then, When, type World } from "../support/fixtures";

// Estes cenários rodam com "hoje é 10/11/2026" (15:00Z); o grant do contexto é o "Meu Claude" de Lucas.
const grantId = (w: World) => (w.data.assistant as { grantId: string }).grantId;
const proposalId = (w: World) => w.data.proposalId as string;

async function propor(world: World, desc: string, valor: string, card = "Nubank Lucas") {
  const fx = family(world);
  const db = testDb();
  const r = await assistantCall(world, grantId(world), "propor_lancamento", {
    description: desc,
    amountInCents: parseBRL(valor) ?? 0,
    categoryId: (
      await db.category.findFirstOrThrow({ where: { familyId: fx.family.id, name: "Saúde" } })
    ).id,
    cardId: (
      await db.creditCard.findFirstOrThrow({ where: { familyId: fx.family.id, name: card } })
    ).id,
  });
  expect(r.ok, r.message).toBe(true);
  world.data.proposalId = r.data.proposalId;
}

Given("que a conexão {string} exige confirmação", async ({ world }, _label: string) => {
  await testDb().mcpGrant.update({
    where: { id: grantId(world) },
    data: { requireConfirmation: true },
  });
});

When(
  "Lucas liga {string} na conexão {string}",
  async ({ world, page }, nome: string, label: string) => {
    await openAssistant(world, page, "Lucas");
    const card = page.getByTestId("connection").filter({ hasText: label });
    await card.getByRole("switch", { name: nome }).click();
    await expect(card.getByRole("switch", { name: nome })).toHaveAttribute("aria-checked", "true");
  },
);

When(
  "o assistente de Lucas propõe {string} de {string} no cartão {string} na categoria {string}",
  async ({ world }, desc: string, valor: string, card: string, _c: string) =>
    propor(world, desc, valor, card),
);
Given(
  "que o assistente de Lucas propôs {string} de {string}",
  async ({ world }, desc: string, valor: string) => propor(world, desc, valor),
);
Given("que a proposta do assistente passou de 30 minutos", async ({ world }) => {
  await testDb()
    .$executeRaw`UPDATE assistant_proposals SET "expiresAt" = now() - interval '1 minute' WHERE id = ${proposalId(world)}::uuid`;
});

When("Lucas abre a proposta do assistente", async ({ world, page }) => {
  world.data.loggedAs = "Lucas";
  await gotoReady(page, `/assistente/propostas/${proposalId(world)}`);
  await expect(
    page.getByRole("heading", { name: "Proposta do assistente", level: 1 }),
  ).toBeVisible();
});
Then("a proposta mostra {string} e {string}", async ({ page }, desc: string, valor: string) => {
  await expect(page.getByTestId("proposal-description")).toHaveText(desc);
  await expect(page.getByRole("main")).toContainText(valor);
  await expect(page.getByRole("main")).toContainText("nada foi lançado");
});
When("Lucas toca em {string} na proposta", async ({ page }, acao: string) => {
  await page.getByRole("button", { name: acao }).click();
});
Then("a proposta aparece como {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("proposal-status")).toContainText(texto);
});
