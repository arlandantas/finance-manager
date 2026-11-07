import { expect, type Page, test } from "@playwright/test";
import { testDb } from "../../support/db";
import { gotoReady } from "../../support/nav";
import { enterAs } from "../support/acerto";
import { Then, When, type World } from "../support/fixtures";
import { drawer, openDrawer } from "../support/lancamento";

const db = testDb();
const SHOTS =
  "/tmp/claude-1000/-home-arlan-ai-tests-finance-manager/5f1caabc-bd63-4581-86ca-b9d16318acfb/scratchpad";
const familyId = (w: World) => w.family?.family.id as string;
const repetir = (page: Page) =>
  drawer(page).getByRole("radiogroup", { name: "Repetir", exact: true });

async function openDoor(page: Page, world: World, user: "Lucas" | "Mariana", cartao: string) {
  if (!world.data.doorErrors) {
    const errors: string[] = [];
    world.data.doorErrors = errors;
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
  }
  await enterAs(world, page, user);
  await gotoReady(page, "/");
  await openDrawer(page);
  const select = drawer(page).getByLabel("Pagar com", { exact: true });
  const value = await select.locator("option", { hasText: cartao }).first().getAttribute("value");
  await select.selectOption(value as string);
}

When(
  /^(Lucas|Mariana) abre a porta de lançar escolhendo o cartão "([^"]+)"$/,
  async ({ page, world }, user, cartao: string) => {
    await openDoor(page, world, user as "Lucas" | "Mariana", cartao);
  },
);

When(/^Mariana escolhe "Assinatura \(todo mês\)" na porta$/, async ({ page }) => {
  await repetir(page).getByRole("radio", { name: "Assinatura (todo mês)", exact: true }).click();
});

When(
  /^Lucas escolhe "Assinatura \(todo mês\)" e preenche "([^"]+)" de "([^"]+)" no dia (\d+) com a categoria "([^"]+)"$/,
  async ({ page }, nome: string, valor: string, dia: number | string, categoria: string) => {
    const d = drawer(page);
    await d.getByLabel("Valor", { exact: true }).fill(valor);
    await d.getByRole("radio", { name: categoria, exact: true }).click();
    await d.getByLabel(/^Descrição/).fill(nome);
    await repetir(page).getByRole("radio", { name: "Assinatura (todo mês)", exact: true }).click();
    await d.getByLabel("Dia do mês", { exact: true }).fill(String(dia));
  },
);

Then("a linha de efeito da assinatura é {string}", async ({ page }, frase: string) => {
  await expect(drawer(page).getByTestId("subscription-effect")).toHaveText(frase);
});

Then("o botão de salvar da porta é {string}", async ({ page }, rotulo: string) => {
  await expect(drawer(page).getByRole("button", { name: rotulo, exact: true })).toBeVisible();
});

When("Lucas salva a assinatura pela porta", async ({ page }) => {
  await drawer(page).getByRole("button", { name: "Salvar assinatura", exact: true }).click();
  await expect(drawer(page)).toBeHidden();
});

Then(
  "a família tem {int} assinatura {string} e nenhuma compra avulsa",
  async ({ world }, n: number, nome: string) => {
    expect(
      await db.cardSubscription.count({
        where: { familyId: familyId(world), description: nome },
      }),
    ).toBe(n);
    expect(await db.transaction.count({ where: { familyId: familyId(world) } })).toBe(0);
  },
);

Then(
  "a porta com assinatura não tem rolagem horizontal e não há erros no console",
  async ({ page, world }) => {
    await expect(drawer(page).getByTestId("subscription-effect")).toBeVisible();
    await page.screenshot({
      path: `${SHOTS}/us096d-${test.info().project.name}.png`,
      fullPage: true,
    });
    expect(world.data.doorErrors).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  },
);

Then(
  /^"([^"]+)" não pode ser escolhido em "Quem pagou\?" na porta$/,
  async ({ page }, nome: string) => {
    const group = drawer(page).getByRole("radiogroup", { name: "Quem pagou?" });
    await expect(group.getByRole("radio", { name: nome })).toHaveAttribute("aria-disabled", "true");
  },
);

Then(
  /^o bloco de assinaturas do cartão mostra "([^"]+)" para Mariana$/,
  async ({ page, world }, nome: string) => {
    const card = await db.creditCard.findFirstOrThrow({ where: { familyId: familyId(world) } });
    await page.keyboard.press("Escape");
    await gotoReady(page, `/cartoes/${card.id}`);
    await expect(
      page
        .getByRole("region", { name: "Assinaturas do cartão" })
        .getByTestId("subscription-item")
        .filter({ hasText: nome }),
    ).toHaveCount(1);
  },
);
