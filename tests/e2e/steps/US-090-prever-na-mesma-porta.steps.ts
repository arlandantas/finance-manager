import { expect, type Locator, type Page } from "@playwright/test";
import { formatBRL, parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeAccount, makeCard } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { Given, Then, When } from "../support/fixtures";
import { balanceOnScreen, drawer, fillAmount, openDrawer, waitSaved } from "../support/lancamento";
import { payableItem } from "../support/previstas";
import { setupFamily } from "../support/world";

const db = testDb();
const money = (v: string) => parseBRL(v) ?? 0;
const OPENING = 500000;
const radio = (page: Page, nome: string) =>
  drawer(page).getByRole("radio", { name: nome, exact: true });
const iso = (d: string, m: string, y: string) => `${y}-${m}-${d}`;
const descriptionField = (page: Page): Locator => drawer(page).getByLabel(/^Descrição/);

Given(
  "a porta com a família {string}, a conta {string} e os membros {string} e {string}",
  async ({ world }, familia: string, conta: string, _a: string, _b: string) => {
    const fx = await setupFamily(world, familia);
    world.data.account = await makeAccount(fx, {
      name: conta,
      owner: "Mariana",
      openingBalanceInCents: OPENING,
    });
  },
);

Given("que o cartão {string} existe", async ({ world }, nome: string) => {
  await makeCard(await setupFamily(world), { name: nome });
});

/** Abre a Início em carga nova (cartões criados depois do login entram no cache) e o formulário. */
async function openDoor(page: Page) {
  await gotoReady(page, "/");
  await openDrawer(page);
}
When(/^(?:que )?Mariana abre a porta de lançar$/, async ({ page }) => {
  await openDoor(page);
});

async function pickSource(page: Page, nome: string) {
  const select = drawer(page).getByLabel("Pagar com", { exact: true });
  const value = await select.locator("option", { hasText: nome }).first().getAttribute("value");
  await select.selectOption(value as string);
}

When(
  "Mariana lança {string} de {string} pela {string}",
  async ({ page, world }, desc: string, valor: string, conta: string) => {
    await openDoor(page);
    await fillAmount(page, valor);
    await page.getByRole("radio", { name: "Supermercado", exact: true }).click();
    await descriptionField(page).fill(desc);
    await pickSource(page, conta);
    await drawer(page).getByRole("button", { name: "Salvar despesa" }).click();
    await waitSaved(page);
    world.data.lastAmount = valor;
  },
);

Then("a despesa {string} aparece no Extrato", async ({ page }, desc: string) => {
  await gotoReady(page, "/extrato");
  await expect(page.getByText(desc, { exact: true }).first()).toBeVisible();
});

Then("o saldo da {string} diminui {string}", async ({ page, world }, conta: string, v: string) => {
  const esperado = formatBRL(OPENING - money(v));
  expect(await balanceOnScreen(page, conta)).toContain(normalizeSpaces(esperado));
  world.data.balanceChecked = true;
});

Then("o saldo da {string} não muda", async ({ page }, conta: string) => {
  expect(await balanceOnScreen(page, conta)).toContain(normalizeSpaces(formatBRL(OPENING)));
});

async function fillLater(page: Page, desc: string, valor: string, due: string) {
  const d = drawer(page);
  await descriptionField(page).fill(desc);
  await fillAmount(page, valor);
  await page.getByRole("radio", { name: "Moradia", exact: true }).click();
  await d.getByLabel("Vencimento", { exact: true }).fill(due);
}

When(
  /^(?:Mariana )?informa "([^"]+)" de "([^"]+)" com vencimento em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page }, desc: string, valor: string, d: string, m: string, y: string) => {
    await fillLater(page, desc, valor, iso(d, m, y));
  },
);

When("salva a previsão", async ({ page }) => {
  await drawer(page).getByRole("button", { name: "Salvar previsão" }).click();
  await waitSaved(page);
});

Then(
  /^"([^"]+)" aparece em "A pagar" com vencimento em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page }, desc: string, d: string, m: string, y: string) => {
    const row = await db.plannedExpense.findFirstOrThrow({ where: { description: desc } });
    expect(row.dueOn.toISOString().slice(0, 10)).toBe(iso(d, m, y));
    await gotoReady(page, "/previstas");
    await expect(payableItem(page, desc)).toBeVisible();
    await expect(payableItem(page, desc)).toContainText(`${d}/${m}`);
  },
);

Then("{string} não aparece no Extrato", async ({ page }, desc: string) => {
  expect(await db.transaction.count({ where: { description: desc } })).toBe(0);
  await gotoReady(page, "/extrato");
  await expect(page.getByRole("heading", { name: "Extrato" }).first()).toBeVisible();
  await expect(page.getByText(desc, { exact: true })).toHaveCount(0);
});

Then("a porta mostra {string}", async ({ page }, texto: string) => {
  await expect(drawer(page).getByText(texto).first()).toBeVisible();
});

Then('a despesa nasce como "Só meu"', async ({ page }) => {
  const sw = drawer(page).getByRole("switch", { name: /Dividir com a família/ });
  if ((await sw.count()) > 0) await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(drawer(page).getByTestId("mode-default-note")).toBeVisible();
});

Given("Mariana digitou {string} e {string}", async ({ page }, desc: string, valor: string) => {
  await descriptionField(page).fill(desc);
  await fillAmount(page, valor);
});

When("Mariana alterna entre {string} e {string}", async ({ page }, a: string, b: string) => {
  await radio(page, b).click();
  await expect(radio(page, b)).toHaveAttribute("aria-checked", "true");
  await radio(page, a).click();
  await expect(radio(page, a)).toHaveAttribute("aria-checked", "true");
});

Then("descrição e valor continuam preenchidos", async ({ page }) => {
  await expect(descriptionField(page)).toHaveValue("Condomínio");
  await expect(page.getByLabel("Valor", { exact: true })).toHaveValue(/650,00/);
});

Given(
  /^Mariana informa o vencimento (\d{2})\/(\d{2})\/(\d{4}) em "Vai acontecer"$/,
  async ({ page }, d: string, m: string, y: string) => {
    await radio(page, "Vai acontecer").click();
    await drawer(page)
      .getByLabel("Vencimento", { exact: true })
      .fill(iso(d, m, y));
  },
);

Then(
  "{string} fica indisponível com a dica {string}",
  async ({ page }, nome: string, dica: string) => {
    const r = radio(page, nome);
    await expect(r).toHaveAttribute("aria-disabled", "true");
    await expect(r).toHaveAccessibleDescription(dica);
    await expect(drawer(page).getByText(dica, { exact: true })).toBeVisible();
    await r.click({ force: true }); // aria-disabled não bloqueia o toque: leva o foco à dica
    await expect(drawer(page).getByTestId("door-hint")).toBeFocused();
    await expect(r).toHaveAttribute("aria-checked", "false");
  },
);

When(
  "Mariana escolhe o cartão {string} em {string}",
  async ({ page }, cartao: string, campo: string) => {
    expect(campo).toBe("Pagar com");
    await pickSource(page, cartao);
  },
);

When("Mariana foca {string} e pressiona a seta para a direita", async ({ page }, nome: string) => {
  await radio(page, nome).focus();
  await page.keyboard.press("ArrowRight");
});

Then("{string} fica selecionado", async ({ page }, nome: string) => {
  await expect(radio(page, nome)).toHaveAttribute("aria-checked", "true");
});

Then(
  "o seletor {string} é um grupo de opções com {string} e {string}",
  async ({ page }, grupo: string, a: string, b: string) => {
    const g = drawer(page).getByRole("radiogroup", { name: grupo, exact: true });
    await expect(g).toBeVisible();
    await expect(g.getByRole("radio", { name: a, exact: true })).toHaveCount(1);
    await expect(g.getByRole("radio", { name: b, exact: true })).toHaveCount(1);
  },
);

When("Mariana toca duas vezes em {string}", async ({ page }, nome: string) => {
  await drawer(page).getByRole("button", { name: nome }).dblclick();
  await waitSaved(page);
});

Then("existe uma só previsão {string}", async ({}, desc: string) => {
  expect(await db.plannedExpense.count({ where: { description: desc, deletedAt: null } })).toBe(1);
});

Then(
  "o seletor {string} se distingue por ícone e texto além da cor",
  async ({ page }, grupo: string) => {
    const g = drawer(page).getByRole("radiogroup", { name: grupo, exact: true });
    const sel = g.getByRole("radio", { checked: true });
    await expect(sel.locator("svg")).toHaveCount(1);
    await expect(sel).toHaveText("Vai acontecer");
    const other = g.getByRole("radio", { checked: false });
    const [a, b] = await Promise.all([
      sel.evaluate((el) => getComputedStyle(el).backgroundColor),
      other.evaluate((el) => getComputedStyle(el).backgroundColor),
    ]);
    expect(a).not.toBe(b);
  },
);

Then("a porta não tem rolagem horizontal", async ({ page }) => {
  const over = await page.evaluate(() => {
    const dlg = document.querySelector('[role="dialog"]') as HTMLElement | null;
    return {
      page: document.documentElement.scrollWidth - window.innerWidth,
      dialog: dlg ? dlg.scrollWidth - dlg.clientWidth : 0,
    };
  });
  expect(over.page).toBeLessThanOrEqual(0);
  expect(over.dialog).toBeLessThanOrEqual(0);
});
