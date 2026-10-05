import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily, makeTransaction, makeTransfer } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { addExpense, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();

async function enterHome(world: World, page: Page, path = "/") {
  if (world.data.loggedAs !== "Mariana") {
    await loginAs(page, { email: "mariana@exemplo.com", name: "Mariana Silva" });
    world.data.loggedAs = "Mariana";
  }
  await gotoReady(page, path);
}

Given(
  /^contas "([^"]+)" \((.+)\) e "([^"]+)" \((.+)\)$/,
  async ({ world }, a: string, av: string, b: string, bv: string) => {
    world.family = await makeFamily();
    const itau = await makeAccount(world.family, {
      name: a,
      owner: "Mariana",
      openingBalanceInCents: parseBRL(av) ?? 0,
    });
    const nubank = await makeAccount(world.family, {
      name: b,
      owner: "Mariana",
      openingBalanceInCents: parseBRL(bv) ?? 0,
    });
    world.data.accounts = { itau, nubank };
    // lançamentos para a lista dos últimos 5 (somam zero no saldo: receita e despesa iguais)
    for (let i = 0; i < 6; i += 1) {
      await makeTransaction(world.family, {
        account: nubank,
        category: "Supermercado",
        amountInCents: 1000 + i,
        occurredOn: "2026-10-02",
        createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, i)),
        description: `Compra ${i + 1}`,
      });
    }
    // receita que compensa as despesas acima: o saldo da família continua o do contexto
    await makeTransaction(world.family, {
      account: nubank,
      type: "INCOME",
      category: "Salário",
      amountInCents: [0, 1, 2, 3, 4, 5].reduce((sum, i) => sum + 1000 + i, 0),
      occurredOn: "2026-10-01",
      createdAt: new Date(Date.UTC(2026, 9, 1, 11, 0, 0)),
    });
  },
);

When("abro a Home", async ({ world, page }) => {
  await enterHome(world, page);
});

Then("a lista de contas com seus saldos", async ({ page }) => {
  // card recolhido por padrão (US-026): expande para listar as contas
  await page.getByTestId("balances-toggle").click();
  const items = page.getByTestId("home-account");
  await expect(items).toHaveCount(2);
  await expect(items.filter({ hasText: "Itaú Mariana" })).toContainText("R$ 6.500,00");
});

Then("os últimos {int} lançamentos", async ({ page }, n: number) => {
  await expect(page.getByTestId("home-recent").getByTestId("ledger-row")).toHaveCount(n);
  await expect(page.getByRole("link", { name: "Ver extrato" })).toHaveAttribute("href", "/extrato");
});

Given(
  "receitas de {string}, despesas de {string} e uma transferência de {string}",
  async ({ world }, rec: string, desp: string, transf: string) => {
    await setupCouple(world);
    const { nubank, itau } = world.data.accounts as { nubank: never; itau: never };
    await makeTransaction(world.family as never, {
      account: nubank,
      type: "INCOME",
      category: "Salário",
      amountInCents: parseBRL(rec) ?? 0,
      occurredOn: "2026-10-02",
      author: "Mariana",
    });
    await addExpense(world, "Mariana", desp);
    await makeTransfer(world.family as never, {
      from: nubank,
      to: itau,
      amountInCents: parseBRL(transf) ?? 0,
      occurredOn: "2026-10-03",
    });
  },
);

Then(
  "{string} mostra {string} e {string} mostra {string}",
  async ({ page }, l1: string, v1: string, l2: string, v2: string) => {
    const id = (l: string) => (l === "Receitas" ? "home-income" : "home-expense");
    await expect(page.getByTestId(id(l1))).toHaveText(v1.replace(" ", " "));
    await expect(page.getByTestId(id(l2))).toHaveText(v2.replace(" ", " "));
  },
);

Given(
  "que Mariana pagou {string} e Lucas {string} em despesas",
  async ({ world }, m: string, l: string) => {
    await setupCouple(world);
    await addExpense(world, "Mariana", m);
    await addExpense(world, "Lucas", l);
  },
);

When("toco no card {string}", async ({ page }, _titulo: string) => {
  await page.getByTestId("home-settlement").click();
});

Then("sou levado ao painel de acerto do mês corrente", async ({ page }) => {
  await expect(page).toHaveURL(/\/acerto\?period=2026-10/);
  await expect(page.getByRole("heading", { name: "Acerto de contas" })).toBeVisible();
});

When("toco no botão {string} da Home", async ({ page }, _b: string) => {
  await page.getByRole("button", { name: "Novo lançamento" }).click();
});

Then("o drawer de nova despesa abre com o foco no valor", async ({ page }) => {
  await expect(page.getByRole("dialog", { name: "Nova Despesa" })).toBeVisible();
  await expect(page.getByLabel("Valor", { exact: true })).toBeFocused();
});

Given("uma família sem contas nem lançamentos", async ({ world }) => {
  world.family = await makeFamily();
});

Then("vejo um passo a passo: {string}", async ({ page }, texto: string) => {
  const passos = texto.split(/\s{2,}/);
  expect(passos).toHaveLength(3);
  const list = page.getByTestId("home-checklist");
  for (const passo of passos) await expect(list.getByText(passo, { exact: true })).toBeVisible();
});

When("a Home está carregando", async ({ world, page }) => {
  await page.route("**/api/v1/home**", async (route) => {
    await new Promise((r) => setTimeout(r, 1500));
    await route.continue();
  });
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as unknown as Array<{
        value: number;
        hadRecentInput: boolean;
      }>) {
        if (!e.hadRecentInput) (window as unknown as { __cls: number }).__cls += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
  await enterHome(world, page);
});

Then("vejo skeletons nos blocos, sem saltos de layout", async ({ page }) => {
  await expect(page.getByLabel("Carregando início")).toBeVisible();
  await expect(page.getByTestId("home-balance")).toBeVisible();
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  expect(cls).toBeLessThanOrEqual(0.01);
});

Given("viewports de {int} px e {int} px", async ({ world }, a: number, b: number) => {
  world.data.viewports = [a, b];
});

Then(
  "todos os blocos são legíveis e utilizáveis sem rolagem horizontal",
  async ({ world, page }) => {
    for (const width of world.data.viewports as number[]) {
      await page.setViewportSize({ width, height: 900 });
      await expect(page.getByTestId("home-balance")).toBeVisible();
      await expect(page.getByTestId("home-settlement")).toBeVisible();
      await expect(page.getByTestId("home-summary")).toBeVisible();
      await expect(page.getByTestId("home-recent")).toBeVisible();
      const ok = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(ok, `sem rolagem horizontal em ${width}px`).toBe(true);
    }
  },
);

void db;
