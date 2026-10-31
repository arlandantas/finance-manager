import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import {
  type AccountFixture,
  type FamilyFixture,
  makeAccount,
  makeFamily,
  makeTransaction,
  makeUnlinkedMember,
} from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { openNewCard } from "../support/cartoes";
import { dlg } from "../support/categorias";
import { Given, Then, When, type World } from "../support/fixtures";
import {
  drawer,
  fillAmount,
  openDrawer,
  pickCategory,
  save,
  waitSaved,
} from "../support/lancamento";
import { fillPlanned, openNewPlanned, openPrevistas } from "../support/previstas";

const db = testDb();
const fx = (w: World) => w.family as FamilyFixture;
const BADGE = "member-unlinked";
/** Card do acerto pelo nome EXATO ("Ana" não casa com "Mariana"). */
const memberCard = (page: Page, nome: string) =>
  page.getByTestId("member-card").filter({ has: page.getByText(nome, { exact: true }) });

Given(
  /^a "Família Silva" com "Mariana" \(Administradora\), "Lucas" \(Membro\) e o membro sem conta "Ana" para a atribuição$/,
  async ({ world }) => {
    world.family = await makeFamily();
    await makeUnlinkedMember(world.family, { name: "Ana", register: true });
    world.data.main = await makeAccount(world.family, {
      name: "Nubank Conjunta",
      owner: "Mariana",
      openingBalanceInCents: 500000,
    });
  },
);
Given("Mariana está autenticada para a atribuição", async ({ world, page }) => {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  world.data.loggedAs = "Mariana";
});
Given(
  "a conta {string} de {string} para a atribuição",
  async ({ world }, conta: string, dona: string) => {
    world.data.ana = await makeAccount(fx(world), {
      name: conta,
      owner: dona,
      openingBalanceInCents: 100000,
    });
  },
);
Given(
  /^uma despesa dividida de "([^"]+)" paga por "Ana" entre "Mariana", "Lucas" e "Ana"$/,
  async ({ world }, valor: string) => {
    await makeTransaction(fx(world), {
      account: world.data.main as AccountFixture,
      category: "Supermercado",
      amountInCents: parseBRL(valor) ?? 0,
      occurredOn: "2026-10-03",
      author: "Mariana",
      payer: "Ana",
      shared: true,
    });
  },
);
Given("que o acerto de contas está desligado para a atribuição", async ({ world }) => {
  await db.family.update({
    where: { id: fx(world).family.id },
    data: { settlementEnabled: false },
  });
});

// ── Conta e cartão ──
When(
  "Mariana cadastra a conta {string} com titular {string}",
  async ({ page }, nome: string, titular: string) => {
    await gotoReady(page, "/contas");
    await page.getByRole("button", { name: "Nova conta" }).first().click();
    const d = page.getByRole("dialog", { name: "Nova conta" });
    await expect(d).toBeVisible();
    await d.getByLabel("Nome", { exact: true }).fill(nome);
    await d.getByLabel("Instituição", { exact: true }).selectOption({ label: "Itaú" });
    await d.getByLabel("Tipo", { exact: true }).selectOption({ label: "Conta corrente" });
    await d
      .getByLabel("Titular", { exact: true })
      .selectOption({ label: `${titular} · sem acesso ao app` });
    await page.getByRole("button", { name: "Salvar conta" }).click();
    await expect(d).toBeHidden();
  },
);
Then(
  "a conta {string} mostra o titular {string} com o selo {string}",
  async ({ page }, conta: string, titular: string, selo: string) => {
    const card = page.getByTestId("account-card").filter({ hasText: conta });
    await expect(card).toContainText(titular);
    await expect(card.getByTestId(BADGE)).toHaveText(selo);
  },
);
When(
  "Mariana cadastra o cartão {string} com titular {string}",
  async ({ page }, nome: string, titular: string) => {
    await gotoReady(page, "/cartoes");
    const d = await openNewCard(page);
    await d.getByLabel("Nome", { exact: true }).fill(nome);
    await d.getByLabel("Limite", { exact: true }).fill("R$ 1.000,00");
    await d.getByLabel("Dia de fechamento", { exact: true }).fill("25");
    await d.getByLabel("Dia de vencimento", { exact: true }).fill("5");
    await d
      .getByLabel("Titular", { exact: true })
      .selectOption({ label: `${titular} · sem acesso ao app` });
    await d.getByRole("button", { name: "Salvar cartão" }).click();
    await expect(d).toBeHidden();
  },
);
Then(
  "o cartão {string} mostra o titular {string} com o selo {string}",
  async ({ page }, cartao: string, titular: string, selo: string) => {
    const item = page.getByTestId("card-item").filter({ hasText: cartao });
    await expect(item).toContainText(titular);
    await expect(item.getByTestId(BADGE)).toHaveText(selo);
  },
);

// ── Despesa paga por Ana ──
When(
  "Mariana lança {string} de {string} pela conta {string} com {string} e dividida entre os três",
  async ({ page }, desc: string, valor: string, conta: string, quem: string) => {
    await gotoReady(page, "/");
    await openDrawer(page);
    await fillAmount(page, valor);
    const select = drawer(page).getByLabel("Pagar com", { exact: true });
    const opt = await select.locator("option", { hasText: conta }).first().getAttribute("value");
    await select.selectOption(opt as string);
    await pickCategory(page, "Supermercado");
    await drawer(page).getByLabel("Descrição").fill(desc);
    await drawer(page)
      .getByRole("switch", { name: /Dividir com a família/ })
      .click();
    const nome = quem.replace(/^Quem pagou\?:\s*/, "");
    await drawer(page)
      .getByRole("radiogroup", { name: "Quem pagou?" })
      .getByRole("radio", { name: nome, exact: true })
      .click();
    await save(page, "Salvar despesa");
    await waitSaved(page);
  },
);
Then("{string} aparece como pagadora no detalhe do Extrato", async ({ page }, nome: string) => {
  await gotoReady(page, "/extrato");
  await page.getByTestId("ledger-row").filter({ hasText: "Mercado" }).first().click();
  const detail = page.getByRole("dialog");
  await expect(detail).toContainText(`Pago por ${nome}`);
  await expect(detail.getByTestId(BADGE)).toHaveText("Sem acesso ao app");
});
Then("o autor registrado é {string}", async ({ page }, nome: string) => {
  await expect(page.getByRole("dialog")).toContainText(`Registrado por ${nome}`);
});

// ── Acerto e Home ──
When("Mariana abre o Acerto para a atribuição", async ({ page }) => {
  await gotoReady(page, "/acerto");
  await expect(page.getByRole("heading", { name: "Acerto de contas" })).toBeVisible();
  await expect(page.getByTestId("settlement-hero")).toBeVisible();
});
Then(
  "{string} aparece com crédito de {string} e o selo {string}",
  async ({ page }, nome: string, valor: string, selo: string) => {
    const card = memberCard(page, nome);
    await expect(card).toContainText(valor);
    await expect(card.getByTestId(BADGE)).toHaveText(selo);
  },
);
Then(
  "{string} e {string} aparecem devendo {string} cada",
  async ({ page }, a: string, b: string, valor: string) => {
    for (const n of [a, b]) await expect(memberCard(page, n)).toContainText(valor);
  },
);
When("Mariana abre a Home para a atribuição", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(page.getByTestId("home-summary")).toBeVisible();
});
Then("não aparece linha de acerto com {string}", async ({ page }, nome: string) => {
  await expect(page.getByTestId("home-settlement-lines")).toHaveCount(0);
  await expect(page.getByText(new RegExp(`Acerto.*${nome}`))).toHaveCount(0);
});

// ── Prevista ──
When(
  "Mariana cadastra a prevista {string} de {string} com responsável {string}",
  async ({ page }, desc: string, valor: string, resp: string) => {
    await gotoReady(page, "/previstas");
    await openPrevistas(page);
    const d = await openNewPlanned(page);
    await fillPlanned(d, { description: desc, amount: valor, category: "Moradia", shared: true });
    await d
      .getByRole("radiogroup", { name: "Responsável pelo pagamento" })
      .getByRole("radio", { name: resp, exact: true })
      .click();
    await d.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(dlg(page, "Nova despesa prevista")).toBeHidden();
  },
);
Then(
  "a prevista {string} mostra o responsável {string} com o selo {string}",
  async ({ page }, desc: string, nome: string, selo: string) => {
    const item = page.getByTestId("payable-item").filter({ hasText: desc });
    await expect(item).toContainText(nome);
    await expect(item.getByTestId(BADGE)).toHaveText(selo);
  },
);

// ── Filtro ──
When("Mariana abre o filtro de pessoa no Extrato", async ({ page }) => {
  await gotoReady(page, "/extrato");
  const toggle = page.getByRole("button", { name: /^Filtros/ });
  if (await toggle.isVisible()) await toggle.click();
});
Then("{string} aparece como opção", async ({ page }, texto: string) => {
  const scope = (await page.getByRole("dialog", { name: "Filtros" }).isVisible())
    ? page.getByRole("dialog", { name: "Filtros" })
    : page.getByRole("region", { name: "Filtros" });
  await expect(scope.getByLabel(/^Membro(:|$)/).locator("option", { hasText: texto })).toHaveCount(
    1,
  );
});
