import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import {
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeFamily,
  makePlannedExpense,
  makeTransaction,
} from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { addExpense } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";
import { fillAmount, openDrawer, pickCategory, save } from "../support/lancamento";

const MASK = "R$ •••••";
const MONEY_RE = /R\$\s?\d/;
const eye = (page: Page) => page.getByTestId("hide-values-toggle");
const saldo = (page: Page) => page.getByTestId("total-balance");

Given(
  /^a "([^"]+)" com as contas "([^"]+)" \((.+)\) e "([^"]+)" \((.+)\)$/,
  async ({ world }, _fam: string, a: string, av: string, b: string, bv: string) => {
    world.family = await makeFamily();
    const [itau, nubank] = [
      await makeAccount(world.family, {
        name: a,
        owner: "Mariana",
        openingBalanceInCents: parseBRL(av) ?? 0,
      }),
      await makeAccount(world.family, {
        name: b,
        owner: "Mariana",
        openingBalanceInCents: parseBRL(bv) ?? 0,
      }),
    ];
    world.data.accounts = { itau, nubank };
  },
);

Given("que Lucas nunca abriu o app neste dispositivo", async () => {});
Given("que os valores estão ocultos", async () => {});

Given("que Lucas mostrou os valores", async ({ page }) => {
  await gotoReady(page, "/contas");
  await eye(page).click();
  await expect(eye(page)).toHaveAttribute("aria-label", "Valores visíveis");
});

When("Lucas abre a tela de Contas", async ({ page }) => {
  await gotoReady(page, "/contas");
});

Then("os valores aparecem como {string}", async ({ page, world }, m: string) => {
  expect(m).toBe(MASK);
  const p = (world.data.otherPage as Page | undefined) ?? page;
  await expect(saldo(p)).toContainText(MASK);
  await expect(p.locator("main")).not.toContainText(MONEY_RE);
});

Then("o ícone do olho indica {string}", async ({ page }, texto: string) => {
  await expect(eye(page)).toHaveAttribute("aria-label", texto);
});

When("Lucas toca no ícone do olho", async ({ page }) => {
  await gotoReady(page, "/contas");
  await eye(page).click();
});

Then("o saldo da família mostra {string}", async ({ page }, v: string) => {
  await expect(saldo(page)).toContainText(v);
});

When("Lucas recarrega a página", async ({ page }) => {
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
});

When("Lucas toca no ícone do olho e recarrega a página", async ({ page }) => {
  await eye(page).click();
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
});

When("Lucas abre o app em um celular novo", async ({ browser, world }) => {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3101" });
  const p = await ctx.newPage();
  await loginAs(p, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(p, "/contas");
  world.data.otherPage = p;
  world.data.otherCtx = ctx;
});

Given("dados de cartão, previsão, despesa e acerto", async ({ world }) => {
  const fx = world.family;
  if (!fx) throw new Error("sem família");
  const card = await makeCard(fx, { name: "Nubank Cartão", owner: "Lucas", limitInCents: 500000 });
  await makeCardPurchase(fx, {
    card,
    amountInCents: 47900,
    occurredOn: "2026-10-03",
    author: "Lucas",
    payer: "Lucas",
  });
  await makePlannedExpense(fx, {
    description: "Internet",
    amountInCents: 12990,
    dueOn: "2026-10-15",
  });
  await addExpense(world, "Mariana", "R$ 900,00");
  await addExpense(world, "Lucas", "R$ 300,00");
});

When("Lucas visita Início, Extrato, Acerto, Cartões, A pagar e Contas", async ({ page, world }) => {
  const seen: string[] = [];
  for (const path of ["/", "/extrato", "/acerto", "/cartoes", "/previstas", "/contas"]) {
    await gotoReady(page, path);
    await expect(page.locator("main").first()).toBeVisible();
    await page.waitForLoadState("networkidle");
    seen.push((await page.locator("body").innerText()).replace(/\s+/g, " "));
  }
  // fatura do cartão (valores de fatura e limite)
  await gotoReady(page, "/cartoes");
  await page.getByTestId("card-item").first().getByRole("link").first().click();
  await page.waitForLoadState("networkidle");
  seen.push((await page.locator("body").innerText()).replace(/\s+/g, " "));
  world.data.seenTexts = seen;
});

Then("nenhuma dessas telas mostra um valor em reais legível", async ({ world }) => {
  const seen = world.data.seenTexts as string[];
  expect(seen.length).toBeGreaterThan(5);
  for (const t of seen) expect(t).not.toMatch(MONEY_RE);
  // sanidade: a máscara está de fato presente nas telas com dados
  expect(seen.filter((t) => t.includes(MASK)).length).toBeGreaterThan(3);
});

Given(
  "uma despesa {string} de {string} em {int}\\/{int}\\/{int}",
  async ({ world }, desc: string, valor: string, d: number, m: number, y: number) => {
    const fx = world.family;
    if (!fx) throw new Error("sem família");
    const acc = (world.data.accounts as { nubank: Awaited<ReturnType<typeof makeAccount>> }).nubank;
    await makeTransaction(fx, {
      account: acc,
      category: "Supermercado",
      amountInCents: parseBRL(valor) ?? 0,
      occurredOn: `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
      author: "Lucas",
      payer: "Lucas",
      shared: false,
      description: desc,
    });
  },
);

When("Lucas abre o Extrato", async ({ page }) => {
  await gotoReady(page, "/extrato");
});

Then("vê {string} e {string} e {string}", async ({ page }, a: string, b: string, c: string) => {
  const main = page.locator("main");
  await expect(main).toContainText(a);
  await expect(main).toContainText(b);
  await expect(main).toContainText(c);
});

Then("vê {string} e {string} sem valores em reais", async ({ page }, a: string, b: string) => {
  const main = page.locator("main");
  await expect(main).toContainText(a);
  await expect(main).toContainText(b);
  await expect(main.getByTestId("home-member-share").first()).toBeVisible();
  await expect(main).not.toContainText(MONEY_RE);
});

When("Lucas toca no valor do saldo da família", async ({ page }) => {
  await page.clock.install();
  await gotoReady(page, "/contas");
  await saldo(page).getByRole("img", { name: "valor oculto" }).click();
});

Then("o saldo mostra {string} por {int} segundos", async ({ page }, v: string, _s: number) => {
  await expect(saldo(page)).toContainText(v);
  await page.clock.fastForward(4500);
  await expect(saldo(page)).toContainText(v);
});

Then("volta a {string} em seguida", async ({ page }, m: string) => {
  await page.clock.fastForward(1000);
  await expect(saldo(page)).toContainText(m);
});

When(
  "Lucas digita {string} no campo de valor do formulário {string}",
  async ({ page }, valor: string, _form: string) => {
    await gotoReady(page, "/");
    await openDrawer(page);
    await fillAmount(page, valor);
  },
);

Then("o campo mostra {string}", async ({ page }, v: string) => {
  await expect(page.getByLabel("Valor", { exact: true })).toHaveValue(v.replace(" ", "\u00a0"));
});

Then("após salvar vê {string} sem o valor", async ({ page }, msg: string) => {
  await pickCategory(page, "Supermercado");
  await save(page, "Salvar Despesa");
  const toast = page.locator("[data-sonner-toast]").filter({ hasText: msg });
  await expect(toast).toBeVisible();
  await expect(toast).not.toContainText(MONEY_RE);
});

Given(
  "a conta {string} com saldo de {string}",
  async ({ world }, nome: string, saldoTxt: string) => {
    if (!world.family) throw new Error("sem família");
    await makeAccount(world.family, {
      name: nome,
      owner: "Lucas",
      openingBalanceInCents: parseBRL(saldoTxt) ?? 0,
    });
  },
);

When(
  "Lucas escolhe {string} para transferir {string}",
  async ({ page }, conta: string, valor: string) => {
    await gotoReady(page, "/contas");
    await page.getByRole("button", { name: "Transferir" }).first().click();
    const d = page.getByRole("dialog");
    await d.getByLabel("Valor", { exact: true }).fill(valor);
    await d.getByLabel("Conta de origem").selectOption({ label: conta });
  },
);

Then("vê o aviso {string} sem mostrar os valores", async ({ page }, aviso: string) => {
  const d = page.getByRole("dialog");
  await expect(d.getByText(aviso)).toBeVisible();
  const preview = d.getByTestId("transfer-preview");
  await expect(preview).toContainText(MASK);
  await expect(preview).not.toContainText(MONEY_RE);
});

Then("o saldo da família é anunciado como {string}", async ({ page }, texto: string) => {
  await expect(saldo(page).getByRole("img", { name: texto })).toBeVisible();
});

Then("o ícone do olho tem a dica {string}", async ({ page }, dica: string) => {
  await expect(eye(page)).toHaveAttribute("title", dica);
});

Given("que Lucas mostrou os valores neste dispositivo e saiu do app", async ({ page, world }) => {
  await gotoReady(page, "/contas");
  await eye(page).click();
  await expect(eye(page)).toHaveAttribute("aria-label", "Valores visíveis");
  await page.context().clearCookies();
  world.data.loggedAs = undefined;
});

When("Mariana entra neste dispositivo pela primeira vez", async ({ page, world }) => {
  await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
  world.data.loggedAs = "Mariana";
  await gotoReady(page, "/contas");
});

Given("que o navegador não permite guardar preferências", async ({ page }) => {
  await page.addInitScript(() => {
    const deny = () => {
      throw new DOMException("negado", "SecurityError");
    };
    Storage.prototype.getItem = deny;
    Storage.prototype.setItem = deny;
    Storage.prototype.removeItem = deny;
  });
  await page.reload();
});

Then("o controle do olho continua funcionando na sessão", async ({ page }) => {
  await eye(page).click();
  await expect(saldo(page)).toContainText("R$ 7.349,50");
  await eye(page).click();
  await expect(saldo(page)).toContainText(MASK);
});

export type { World };
