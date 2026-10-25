import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { hit } from "@/modules/mcp/rate-limit";
import { testDb } from "../../support/db";
import type { makeAccount } from "../../support/factories";
import { makeTransaction } from "../../support/factories";
import { Given, Then, When } from "../support/fixtures";

const db = testDb();

async function openProfile(page: Page) {
  await page.getByRole("button", { name: /Menu do usuário/ }).click();
  await page.getByRole("menuitem", { name: "Perfil e meus dados" }).click();
  await expect(page.getByRole("heading", { name: "Perfil" })).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
}

Given(
  "que Lucas fez um lançamento de {string} na conta {string}",
  async ({ world }, valor: string, conta: string) => {
    if (!world.family) throw new Error("família ausente");
    // o cenário de fábrica já cria "Itaú Lucas" (titular Lucas)
    const accounts = world.data.accounts as Record<string, Awaited<ReturnType<typeof makeAccount>>>;
    const acc = Object.values(accounts).find((a) => a.name === conta);
    if (!acc) throw new Error(`conta ${conta} ausente`);
    await makeTransaction(world.family, {
      account: acc,
      category: "Supermercado",
      amountInCents: parseBRL(valor) ?? 0,
      occurredOn: "2026-10-03",
      author: "Lucas",
      payer: "Lucas",
      shared: true,
    });
  },
);

Given("que Lucas já baixou os dados {int} vezes hoje", async ({ world }, n: number) => {
  const userId = world.family?.byName.Lucas?.userId as string;
  for (let i = 0; i < n; i++) {
    await hit(db, `export:${userId}:day`, 3, 86_400, new Date("2026-10-04T15:00:00Z"));
  }
});

When("Lucas abre o Perfil e toca em {string}", async ({ page, world }, botao: string) => {
  await openProfile(page);
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 8000 }).catch(() => null),
    page.getByRole("button", { name: botao }).click(),
  ]);
  if (download) {
    world.data.downloadName = download.suggestedFilename();
    world.data.downloadJson = JSON.parse(readFileSync((await download.path()) as string, "utf8"));
  }
});

When(
  "Lucas abre o Perfil sem conexão e toca em {string}",
  async ({ page, context }, botao: string) => {
    await openProfile(page);
    await context.setOffline(true);
    await page.getByRole("button", { name: botao }).click();
  },
);

Then("o navegador baixa o arquivo {string}", async ({ world }, nome: string) => {
  expect(world.data.downloadName).toBe(nome);
});

Then(
  "o arquivo baixado traz o perfil de {string} e a família {string}",
  async ({ world }, nome: string, familia: string) => {
    const f = world.data.downloadJson as {
      perfil: { nome: string };
      familiaAtual: { nome: string };
    };
    expect(f.perfil.nome).toBe(nome);
    expect(f.familiaAtual.nome).toBe(familia);
  },
);

Then(
  "o lançamento de {string} aparece como {int} centavos",
  async ({ world }, _valor: string, centavos: number) => {
    const f = world.data.downloadJson as {
      familiaAtual: { lancamentos: Array<{ valorEmCentavos: number }> };
    };
    expect(f.familiaAtual.lancamentos.map((t) => t.valorEmCentavos)).toContain(centavos);
  },
);

Then("vê a mensagem de dados {string}", async ({ page }, texto: string) => {
  await expect(page.getByRole("alert").filter({ hasText: texto })).toBeVisible();
});
