import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { addExpense, family, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const sw = (page: Page) => page.getByRole("switch", { name: "Acerto de contas entre membros" });

async function as(world: World, page: Page, who: "Mariana" | "Lucas") {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
}

Given(
  "a família do acerto opcional com Mariana Administradora e Lucas Membro",
  async ({ world }) => {
    await setupCouple(world);
  },
);

When("Mariana abre as configurações da família", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/familia");
});
When("Lucas abre as configurações da família", async ({ world, page }) => {
  await as(world, page, "Lucas");
  await gotoReady(page, "/familia");
});

Then("a chave {string} está ligada", async ({ page }, _n: string) => {
  await expect(sw(page)).toHaveAttribute("aria-checked", "true");
});
Then(
  "a chave {string} está desabilitada com a dica {string}",
  async ({ page }, _n: string, dica: string) => {
    await expect(sw(page)).toBeDisabled();
    await expect(page.getByText(dica)).toBeVisible();
  },
);

Given("que Souza está criando a família {string}", async ({ page }, _nome: string) => {
  await loginAs(page, { email: "souza@exemplo.com", name: "Ana Souza" });
  await gotoReady(page, "/onboarding");
});
Then("a opção {string} vem marcada", async ({ page }, o: string) => {
  await expect(page.getByLabel(o)).toBeChecked();
});
Then("vê a opção {string}", async ({ page }, o: string) => {
  await expect(page.getByLabel(o)).toBeVisible();
});
When("ela escolhe {string} e conclui o onboarding", async ({ page }, o: string) => {
  await page.getByLabel(o).check();
  await page.getByLabel("Nome da família").fill("Família Souza");
  await page.getByRole("button", { name: "Criar família" }).click();
  await expect(page.getByRole("heading", { name: "Família Souza criada!" })).toBeVisible();
});
Then("a {string} fica com o acerto desligado", async ({}, nome: string) => {
  const f = await db.family.findFirstOrThrow({ where: { name: nome } });
  expect(f.settlementEnabled).toBe(false);
});
Then("vê a dica {string}", async ({ page }, d: string) => {
  await expect(page.getByTestId("settlement-hint")).toHaveText(d);
});

When("Mariana desliga a chave do acerto", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/familia");
  await sw(page).click();
});
Then("vê o aviso {string}", async ({ page }, msg: string) => {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: msg })).toBeVisible();
});
Then("o menu não tem o item {string}", async ({ page }, item: string) => {
  await expect(page.getByRole("link", { name: item, exact: true })).toHaveCount(0);
});
Then("o formulário de nova despesa não mostra {string}", async ({ page }, campo: string) => {
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Novo lançamento" }).click();
  await expect(page.getByLabel("Valor", { exact: true })).toBeVisible();
  await expect(page.getByRole("switch", { name: campo })).toHaveCount(0);
});

Given(
  /^uma diferença do acerto de "([^"]+)" em (outubro de 2026|maio de 2025) sem acerto registrado$|^uma diferença do acerto de "([^"]+)" em (outubro de 2026|maio de 2025)$/,
  async ({ world }, a?: string, b?: string, c?: string, d?: string) => {
    const valor = a ?? c ?? "";
    const quando = b ?? d ?? "";
    // a diferença a acertar é metade da despesa paga por um só membro (50/50)
    const doubled = `R$ ${(((parseBRL(valor) ?? 0) * 2) / 100).toFixed(2).replace(".", ",")}`;
    await addExpense(world, "Mariana", doubled, {
      occurredOn: quando.startsWith("maio") ? "2025-05-10" : "2026-10-02",
    });
  },
);
Then("vê o aviso de pendência {string}", async ({ page }, msg: string) => {
  await expect(page.getByTestId("settlement-pending-warning")).toContainText(
    msg.replace(" a acertar entre os membros", ""),
  );
  await expect(page.getByTestId("settlement-pending-warning")).toContainText(
    "a acertar entre os membros",
  );
});
When("ela toca em {string}", async ({ page }, b: string) => {
  await page.getByRole("button", { name: b }).click();
});
Then("o acerto fica desligado na família", async ({ world }) => {
  await expect.poll(async () => (await db.family.findFirstOrThrow()).settlementEnabled).toBe(false);
  expect(family(world).family.id).toBeTruthy();
});
When("Mariana religa a chave do acerto", async ({ page }) => {
  await expect(sw(page)).toHaveAttribute("aria-checked", "false");
  await sw(page).click();
  await expect(sw(page)).toHaveAttribute("aria-checked", "true");
});
Then("o painel de outubro de 2026 mostra {string}", async ({ page }, texto: string) => {
  await gotoReady(page, "/acerto?period=2026-10");
  await expect(page.getByTestId("to-settle")).toContainText(
    texto.replace(" ", " ").replace("acertar: R$", "acertar: R$"),
  );
});

Given("que o acerto foi desligado na família", async ({ world }) => {
  await db.family.update({
    where: { id: family(world).family.id },
    data: { settlementEnabled: false, version: 2 },
  });
});
When("Lucas acessa o endereço do painel de Acerto", async ({ world, page }) => {
  await as(world, page, "Lucas");
  await gotoReady(page, "/acerto");
});
Then("vê {string} e o link {string}", async ({ page }, msg: string, link: string) => {
  await expect(page.getByText(msg)).toBeVisible();
  await expect(page.getByRole("link", { name: link })).toBeVisible();
});
When("Lucas acessa o painel de acerto de outubro de 2026", async ({ world, page }) => {
  await as(world, page, "Lucas");
  await gotoReady(page, "/acerto?period=2026-10");
  await expect(page.getByTestId("settlement-hero")).toBeVisible();
});
Then(
  "o painel mostra {string} e nenhuma frase com {string}",
  async ({ page }, texto: string, proibido: string) => {
    await expect(page.getByTestId("to-settle")).toContainText(texto.split(": ")[1] ?? texto);
    await expect(page.locator("main")).not.toContainText(proibido);
  },
);

When("a conexão cai e Mariana desliga a chave do acerto", async ({ world, page }) => {
  await as(world, page, "Mariana");
  await gotoReady(page, "/familia");
  await page.route("**/api/v1/family/settings", (r) => r.abort("failed"));
  await sw(page).click();
});
Then("vê o erro {string}", async ({ page }, msg: string) => {
  await expect(page.getByRole("alert").filter({ hasText: msg })).toBeVisible();
});

void parseBRL;
