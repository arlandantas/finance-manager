import { randomUUID } from "node:crypto";
import { expect } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { makeTransaction } from "../../support/factories";
import { accountsOf, family } from "../support/acerto";
import { assistantCall } from "../support/assistente";
import { Given, Then, When, type World } from "../support/fixtures";

const NOW = new Date("2026-11-10T15:00:00Z");
const ORIGIN = "http://localhost:3101";

/** Lançamentos "do assistente" gravados direto (já passados pelos limites quando foram feitos). */
async function seedAssistantTransactions(world: World, n: number, createdAts: Date[]) {
  const grantId = (world.data.assistant as { grantId: string }).grantId;
  const fx = family(world);
  for (let i = 0; i < n; i++) {
    const row = await makeTransaction(fx, {
      account: accountsOf(world).itau,
      category: "Saúde",
      amountInCents: 1000 + i,
      occurredOn: "2026-11-10",
      author: "Lucas",
      payer: "Lucas",
      shared: false,
      description: `Compra do assistente ${i + 1}`,
      createdAt: createdAts[i] as Date,
    });
    await testDb().transaction.update({
      where: { id: row.id },
      data: { origin: "ASSISTANT", assistantGrantId: grantId },
    });
  }
}

Given("que o assistente de Lucas já fez 10 lançamentos hoje", async ({ world }) => {
  // entre 00:00 e 12:00 em São Paulo, todos há mais de uma hora (não afeta o limite por hora)
  const base = Date.parse("2026-11-10T05:00:00Z");
  await seedAssistantTransactions(
    world,
    10,
    Array.from({ length: 10 }, (_, i) => new Date(base + i * 600_000)),
  );
});
Given("que o assistente de Lucas já fez 5 lançamentos na última hora", async ({ world }) => {
  const base = NOW.getTime() - 40 * 60_000;
  await seedAssistantTransactions(
    world,
    5,
    Array.from({ length: 5 }, (_, i) => new Date(base + i * 120_000)),
  );
});
Given("Lucas excluiu um deles", async ({ world }) => {
  const one = await testDb().transaction.findFirstOrThrow({
    where: { familyId: family(world).family.id, origin: "ASSISTANT" },
  });
  await testDb().transaction.update({
    where: { id: one.id },
    data: {
      deletedAt: new Date("2026-11-10T14:00:00Z"),
      deletedByMemberId: family(world).byName.Lucas?.memberId as string,
      deletionReason: "DELETED",
    },
  });
});

Then("continuam existindo {int} lançamentos do assistente", async ({ world }, n: number) => {
  expect(
    await testDb().transaction.count({
      where: { familyId: family(world).family.id, origin: "ASSISTANT" },
    }),
  ).toBe(n);
});

Then("vê o limite {string}", async ({ page }, texto: string) => {
  await expect(page.getByTestId("limits-summary")).toContainText(texto);
});

When(
  "Lucas altera o limite por lançamento para {string}, marca {string} e salva",
  async ({ page }, valor: string, ciencia: string) => {
    await page.getByLabel("Valor máximo por lançamento").fill(valor);
    await page.getByRole("checkbox", { name: ciencia }).check();
    await page.getByRole("button", { name: "Salvar" }).click();
    await expect(
      page.locator("[data-sonner-toast]").filter({ hasText: "Limites salvos" }),
    ).toBeVisible();
  },
);
Then(
  "o assistente de Lucas passa a poder lançar {string} de {string}",
  async ({ world }, desc: string, valor: string) => {
    const r = await assistantCall(
      world,
      (world.data.assistant as { grantId: string }).grantId,
      "lancar_despesa",
      {
        description: desc,
        amountInCents: parseBRL(valor) ?? 0,
        categoryId: (
          await testDb().category.findFirstOrThrow({
            where: { familyId: family(world).family.id, name: "Saúde" },
          })
        ).id,
        cardId: (
          await testDb().creditCard.findFirstOrThrow({
            where: { familyId: family(world).family.id, name: "Nubank Lucas" },
          })
        ).id,
      },
    );
    expect(r.ok, r.message).toBe(true);
  },
);

const amountRow = (page: import("@playwright/test").Page) => page.getByTestId("limit-amount");

When("Lucas escolhe {string} no limite por lançamento", async ({ page }, _x: string) => {
  await amountRow(page)
    .getByRole("switch", { name: /Sem limite/ })
    .click();
  await expect(page.getByRole("dialog", { name: "Remover este limite?" })).toBeVisible();
});
Then("vê o aviso de risco {string}", async ({ page }, texto: string) => {
  await expect(page.getByRole("dialog").getByTestId("risk-notice")).toContainText(texto);
});
Then(
  "o botão {string} só habilita depois de marcar {string}",
  async ({ page }, botao: string, ciencia: string) => {
    const d = page.getByRole("dialog");
    await expect(d.getByRole("button", { name: botao })).toBeDisabled();
    await d.getByRole("checkbox", { name: ciencia }).check();
    await expect(d.getByRole("button", { name: botao })).toBeEnabled();
  },
);
const confirmRiskAndSave = async ({ page }: { page: import("@playwright/test").Page }) => {
  const d = page.getByRole("dialog");
  await d.getByRole("checkbox", { name: "Entendi o risco" }).check();
  await d.getByRole("button", { name: "Remover limite" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar" }).click();
  await expect(
    page.locator("[data-sonner-toast]").filter({ hasText: "Limites salvos" }),
  ).toBeVisible();
  await expect(page.getByTestId("limits-summary")).toContainText("Sem limite por lançamento");
};
When("Lucas confirma o risco e salva", confirmRiskAndSave);
When("Lucas cancela o aviso", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Manter" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});
Then("o limite por lançamento continua {string}", async ({ page }, valor: string) => {
  await expect(page.getByLabel("Valor máximo por lançamento")).toHaveValue(
    new RegExp(valor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s/g, "\\s")),
  );
  await expect(amountRow(page).getByRole("switch", { name: /Sem limite/ })).toHaveAttribute(
    "aria-checked",
    "false",
  );
});

Given(
  "que Lucas salvou o limite por lançamento como {string} \\(era {string}\\)",
  async ({ page }, _novo: string, _era: string) => {
    const res = await page.request.put("/api/v1/assistant/limits", {
      data: {
        maxAmountPerTxCents: null,
        maxTxPerDay: 10,
        maxTxPerHour: 5,
        riskAcknowledged: true,
      },
      headers: { origin: ORIGIN, "idempotency-key": randomUUID() },
    });
    expect(res.status()).toBe(200);
  },
);

Given(
  "que o assistente de Lucas lançou {string} de {string} e foi bloqueado pelo limite",
  async ({ world }, desc: string, valor: string) => {
    const r = await assistantCall(
      world,
      (world.data.assistant as { grantId: string }).grantId,
      "lancar_despesa",
      {
        description: desc,
        amountInCents: parseBRL(valor) ?? 0,
        categoryId: (
          await testDb().category.findFirstOrThrow({
            where: { familyId: family(world).family.id, name: "Saúde" },
          })
        ).id,
        cardId: (
          await testDb().creditCard.findFirstOrThrow({
            where: { familyId: family(world).family.id, name: "Nubank Lucas" },
          })
        ).id,
      },
    );
    expect(r.ok).toBe(false);
    expect(r.code).toBe("LIMIT_EXCEEDED");
  },
);
