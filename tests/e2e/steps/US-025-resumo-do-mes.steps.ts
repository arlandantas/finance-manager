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
import { Given, Then, When, type World } from "../support/fixtures";
import { setToday } from "../support/world";

const money = (v: string) => parseBRL(v) ?? 0;
const NB = (s: string) => s.replace(" ", " ");
const tid = (page: Page, id: string) => page.getByTestId(id);
const summary = (page: Page) => page.getByTestId("home-summary");
let seq = 0;

Given(
  /^contas do resumo "([^"]+)" \((.+)\) e "([^"]+)" \((.+)\) e hoje (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, a, av, b, bv, d, m, y) => {
    world.family = await makeFamily();
    world.data.accs = [
      await makeAccount(world.family, {
        name: a,
        owner: "Mariana",
        openingBalanceInCents: money(av),
      }),
      await makeAccount(world.family, {
        name: b,
        owner: "Mariana",
        openingBalanceInCents: money(bv),
      }),
    ];
    await setToday(`${y}-${m}-${d}`);
  },
);

Given("os valores dos saldos estão visíveis", async ({ page }) => {
  await page.context().addInitScript(() => {
    const real = Storage.prototype.getItem;
    Storage.prototype.getItem = function (this: Storage, key: string) {
      const v = real.call(this, key);
      return v === null && /^fm:v1:u:.+:hideValues$/.test(key) ? "false" : v;
    };
  });
});

const acc = (w: World) =>
  (w.data.accs as Array<{ id: string; name: string; ownerMemberId: string }>)[1];

Given(
  /^receita de "([^"]+)" e despesa de "([^"]+)" em (outubro|setembro)$/,
  async ({ world }, inc: string, exp: string, mes: string) => {
    const fx = world.family as never;
    const on = mes === "outubro" ? "2026-10-02" : "2026-09-10";
    if (money(inc) > 0)
      await makeTransaction(fx, {
        account: acc(world) as never,
        type: "INCOME",
        category: "Salário",
        amountInCents: money(inc),
        occurredOn: on,
        createdAt: new Date(Date.UTC(2026, 9, 1, 10, 0, ++seq)),
      });
    if (money(exp) > 0)
      await makeTransaction(fx, {
        account: acc(world) as never,
        category: "Moradia",
        amountInCents: money(exp),
        occurredOn: on,
        shared: false,
        createdAt: new Date(Date.UTC(2026, 9, 1, 11, 0, ++seq)),
      });
  },
);

Given(
  /^previstas de "([^"]+)" e "([^"]+)" com vencimento em (outubro|04\/10\/2026)$/,
  async ({ world }, a: string, b: string, quando: string) => {
    const on = quando === "outubro" ? "2026-10-25" : "2026-10-04";
    for (const [i, v] of [a, b].entries())
      await makePlannedExpense(world.family as never, {
        description: `Prevista ${i + 1}`,
        amountInCents: money(v),
        dueOn: on,
      });
  },
);

Given("uma fatura de {string} com vencimento em 15\\/10\\/2026", async ({ world }, v: string) => {
  const card = await makeCard(world.family as never, {
    name: "Nubank Lucas",
    closingDay: 25,
    dueDay: 15,
  });
  await makeCardPurchase(world.family as never, {
    card,
    amountInCents: money(v),
    occurredOn: "2026-09-20",
  });
});

Given("que o serviço da Home está indisponível", async ({ page }) => {
  await page.route("**/api/v1/home**", (r) => r.abort("failed"));
});

async function enter(world: World, page: Page) {
  if (world.data.loggedAs !== "Lucas") {
    await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
    world.data.loggedAs = "Lucas";
  }
  await gotoReady(page, "/");
}

When("abro a Home do resumo", async ({ world, page }) => {
  await enter(world, page);
});
When("recarrego a Home do resumo", async ({ page }) => {
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
});

Then(
  "o resumo mostra receitas {string} e despesas {string}",
  async ({ page }, r: string, d: string) => {
    await expect(tid(page, "home-income")).toHaveText(NB(r));
    await expect(tid(page, "home-expense")).toHaveText(NB(d));
  },
);
Then(
  "o resumo mostra resultado {string} e a pagar {string}",
  async ({ page }, r: string, p: string) => {
    await expect(tid(page, "home-result")).toHaveText(NB(r));
    await expect(tid(page, "home-topay")).toHaveText(NB(p));
  },
);
Then("o resumo mostra saldo previsto {string}", async ({ page }, v: string) => {
  await expect(tid(page, "home-projected")).toHaveText(NB(v));
});
Then("o resumo mostra a linha de faturas {string}", async ({ page }, v: string) => {
  await expect(tid(page, "home-topay-invoices")).toContainText(NB(v));
});
Then("vê junto ao saldo previsto {string}", async ({ page }, t: string) => {
  await expect(summary(page)).toContainText(t);
});
Then(
  "o resumo mostra saldo previsto {string} em atenção com {string}",
  async ({ page }, v: string, t: string) => {
    await expect(tid(page, "home-projected")).toHaveText(NB(v));
    await expect(tid(page, "home-projected")).toHaveClass(/text-red-700/);
    await expect(tid(page, "home-projected-warning")).toHaveText(t);
  },
);
Then("o resumo mostra {string} com o selo {string}", async ({ page }, t: string, selo: string) => {
  await expect(tid(page, "home-topay-overdue")).toContainText(t);
  await expect(tid(page, "home-topay-overdue")).toContainText(selo);
});

When("navego para o mês anterior no resumo", async ({ page }) => {
  await page.getByRole("button", { name: "Mês anterior" }).click();
});
When("navego duas vezes para o mês seguinte no resumo", async ({ page }) => {
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(tid(page, "home-period")).toHaveText("Outubro de 2026");
  await page.getByRole("button", { name: "Próximo mês" }).click();
});
Then(
  /^o título do resumo é "([^"]+)" e (despesas "[^"]+"|vê "[^"]+")$/,
  async ({ page }, titulo: string, resto: string) => {
    await expect(tid(page, "home-period")).toHaveText(titulo);
    const m = /"([^"]+)"/.exec(resto);
    const v = m?.[1] ?? "";
    if (resto.startsWith("despesas")) await expect(tid(page, "home-expense")).toHaveText(NB(v));
    else await expect(summary(page)).toContainText(v);
  },
);
Then(
  "vê o erro do resumo com o botão {string} e o botão {string} disponível",
  async ({ page }, b: string, fab: string) => {
    await expect(page.getByText("Não foi possível carregar o resumo do mês")).toBeVisible();
    await expect(page.getByRole("button", { name: b })).toBeVisible();
    await expect(page.getByRole("button", { name: fab })).toBeVisible();
  },
);

// ── US-026 ──
const toggle = (page: Page) => page.getByTestId("balances-toggle");
When("toco no card de saldos", async ({ page }) => {
  await toggle(page).click();
});
When("foco o card de saldos e pressiono Enter", async ({ page }) => {
  await toggle(page).focus();
  await page.keyboard.press("Enter");
});
Then(
  "o card de saldos está recolhido com o total {string} e sem lista de contas",
  async ({ page }, total: string) => {
    await expect(toggle(page)).toHaveAttribute("aria-expanded", "false");
    await expect(tid(page, "family-balance-value")).toHaveText(NB(total));
    await expect(page.getByTestId("home-account")).toHaveCount(0);
  },
);
Then("o card de saldos está expandido", async ({ page }) => {
  await expect(toggle(page)).toHaveAttribute("aria-expanded", "true");
});
Then(
  "o card de saldos lista {string} {string} e {string} {string}",
  async ({ page }, a: string, av: string, b: string, bv: string) => {
    const items = page.getByTestId("home-account");
    await expect(items.filter({ hasText: a })).toContainText(NB(av));
    await expect(items.filter({ hasText: b })).toContainText(NB(bv));
  },
);
When("abro a Home em um celular que nunca usou", async ({ browser, world }) => {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3101" });
  const p = await ctx.newPage();
  await loginAs(p, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  await gotoReady(p, "/");
  world.data.other = p;
});
Then("o card de saldos está recolhido no outro dispositivo", async ({ world }) => {
  await expect(toggle(world.data.other as Page)).toHaveAttribute("aria-expanded", "false");
});
