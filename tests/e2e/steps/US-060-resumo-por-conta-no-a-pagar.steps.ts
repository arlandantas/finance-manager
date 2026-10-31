import { expect, type Locator, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import {
  makeAccount,
  makeCard,
  makeCardPurchase,
  makePlannedExpense,
} from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import { payViaApi } from "../support/previstas";
import { setupFamily } from "../support/world";

const money = (v: string) => parseBRL(v) ?? 0;
type Acct = Awaited<ReturnType<typeof makeAccount>>;
const accts = (w: World) => (w.data.byAcct ??= {}) as Record<string, Acct>;

async function account(world: World, name: string, balance = 0) {
  const fam = await setupFamily(world);
  const known = accts(world)[name];
  if (known) return known;
  const a = await makeAccount(fam, { name, owner: "Mariana", openingBalanceInCents: balance });
  accts(world)[name] = a;
  return a;
}

async function planned(
  world: World,
  o: { description: string; cents: number; account?: Acct; responsible?: string; shared?: boolean },
) {
  await makePlannedExpense(await setupFamily(world), {
    description: o.description,
    amountInCents: o.cents,
    dueOn: "2026-10-20",
    shared: o.shared ?? true,
    ...(o.responsible ? { responsible: o.responsible } : {}),
    ...(o.account ? { account: o.account } : {}),
  });
}

const row = (page: Page, name: string): Locator =>
  page
    .getByTestId("by-account-row")
    .filter({ has: page.getByTestId("by-account-name").getByText(name, { exact: true }) });
const cell = (page: Page, name: string, id: string) => row(page, name).getByTestId(id);
const same = (v: string) => normalizeSpaces(v);

Given("{string} com saldo {string}", async ({ world }, nome: string, saldo: string) => {
  await account(world, nome, money(saldo));
});

Given(
  "{string} com saldo {string} e a pagar {string}",
  async ({ world }, nome: string, saldo: string, pagar: string) => {
    const a = await account(world, nome, money(saldo));
    const total = money(pagar);
    // 650 + o resto (770 = 650 + 120): duas previstas, uma delas de R$ 650,00 (cenário da baixa)
    const big = Math.min(65000, total);
    await planned(world, { description: "Condomínio", cents: big, account: a });
    if (total > big)
      await planned(world, { description: "Internet", cents: total - big, account: a });
  },
);

Given(
  "previstas de {string} e {string} com {string} vencendo em outubro",
  async ({ world }, v1: string, v2: string, pagarCom: string) => {
    const a = await account(world, pagarCom.replace("Pagar com: ", ""));
    await planned(world, { description: "Condomínio", cents: money(v1), account: a });
    await planned(world, { description: "Internet", cents: money(v2), account: a });
  },
);

Given("uma prevista de {string} sem conta", async ({ world }, valor: string) => {
  await planned(world, { description: "Avulsa", cents: money(valor) });
});

Given(
  "Lucas tem uma prevista {string} de {string} com {string}",
  async ({ world }, _soMeu: string, valor: string, pagarCom: string) => {
    const a = await account(world, pagarCom.replace("Pagar com: ", ""));
    await planned(world, {
      description: "Segredo do Lucas",
      cents: money(valor),
      account: a,
      responsible: "Lucas",
      shared: false,
    });
  },
);

Given(
  "previstas de {string} na {string}, {string} na {string} e {string} sem conta",
  async ({ world }, v1: string, c1: string, v2: string, c2: string, v3: string) => {
    await planned(world, {
      description: "Condomínio",
      cents: money(v1),
      account: await account(world, c1),
    });
    await planned(world, {
      description: "Internet",
      cents: money(v2),
      account: await account(world, c2),
    });
    await planned(world, { description: "Avulsa", cents: money(v3) });
  },
);

Given(
  "o cartão {string} sem conta pagadora e fatura fechada de {string} vencendo em outubro",
  async ({ world }, nome: string, valor: string) => {
    const fam = await setupFamily(world);
    // fecha dia 5, vence dia 20; compra de setembro => fatura de outubro, já fechada em 12/10
    const card = await makeCard(fam, { name: nome, closingDay: 5, dueDay: 20 });
    await makeCardPurchase(fam, {
      card,
      amountInCents: money(valor),
      occurredOn: "2026-09-20",
    });
  },
);

When("Mariana abre {string} de outubro de 2026", async ({ page }, _tela: string) => {
  await gotoReady(page, "/previstas?period=2026-10");
  await expect(page.getByTestId("period-label")).toHaveText("Outubro de 2026");
});

When(
  "Mariana abre {string} de outubro de 2026 com a resposta atrasada",
  async ({ page, world }, _tela: string) => {
    await page.route("**/api/v1/payables**", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto("/previstas?period=2026-10");
    world.data.delayed = true;
  },
);

When(
  "Mariana abre {string} de outubro de 2026 e a resposta falha",
  async ({ page }, _tela: string) => {
    await page.route("**/api/v1/payables**", (route) => route.abort("failed"));
    await page.goto("/previstas?period=2026-10");
  },
);

Then(
  "{string} mostra atual {string}, a pagar {string} e previsto {string}",
  async ({ page }, nome: string, atual: string, pagar: string, previsto: string) => {
    await expect(cell(page, nome, "by-account-balance")).toHaveText(same(atual));
    await expect(cell(page, nome, "by-account-due")).toHaveText(same(pagar));
    await expect(cell(page, nome, "by-account-projected")).toHaveText(same(previsto));
  },
);

Then(
  "{string} mostra atual {string} e a pagar {string}",
  async ({ page }, nome: string, atual: string, pagar: string) => {
    await expect(cell(page, nome, "by-account-balance")).toHaveText(same(atual));
    await expect(cell(page, nome, "by-account-due")).toHaveText(same(pagar));
  },
);

Then("{string} destaca {string}", async ({ page }, nome: string, falta: string) => {
  const shortfall = cell(page, nome, "by-account-shortfall");
  await expect(shortfall).toContainText(same(falta));
  // nunca só cor: tem ícone e texto
  await expect(shortfall.locator("svg")).toHaveCount(1);
});

Then("aparece a linha {string} com {string}", async ({ page }, nome: string, valor: string) => {
  await expect(cell(page, nome, "by-account-due")).toHaveText(same(valor));
  await expect(cell(page, nome, "by-account-balance")).toHaveText("—");
  await expect(cell(page, nome, "by-account-projected")).toHaveText("—");
});

Then(
  "{string} mostra a pagar {string} e previsto {string}",
  async ({ page }, nome: string, pagar: string, previsto: string) => {
    await expect(cell(page, nome, "by-account-due")).toHaveText(same(pagar));
    await expect(cell(page, nome, "by-account-projected")).toHaveText(same(previsto));
  },
);

Then("o total de {string} é {string}", async ({ page }, _t: string, valor: string) => {
  await expect(page.getByTestId("payables-total")).toHaveText(same(valor));
});

Then(
  "a soma das linhas por conta, incluindo {string}, é {string}",
  async ({ page }, _sem: string, valor: string) => {
    await expect(page.getByTestId("by-account-row").first()).toBeVisible();
    const texts = await page
      .getByTestId("by-account-row")
      .getByTestId("by-account-due")
      .allInnerTexts();
    const sum = texts.reduce((s, t) => s + money(t), 0);
    expect(sum).toBe(money(valor));
    // o rodapé "Total" da tabela e o card do topo mostram o mesmo número
    await expect(page.getByTestId("by-account-total")).toHaveText(same(valor));
  },
);

Then(
  "{string} inclui {string} na coluna {string}",
  async ({ page }, nome: string, valor: string, _col: string) => {
    await expect(cell(page, nome, "by-account-due")).toHaveText(same(valor));
  },
);

Then("{string} inclui {string}", async ({ page }, nome: string, valor: string) => {
  await expect(cell(page, nome, "by-account-due")).toHaveText(same(valor));
});

When(
  "Mariana dá baixa em uma prevista de {string} pela {string}",
  async ({ page, world }, valor: string, conta: string) => {
    await payViaApi(page, world, "Condomínio", {
      accountName: conta,
      dueOn: "2026-10-20",
      amountInCents: money(valor),
    });
    await gotoReady(page, "/previstas?period=2026-10");
  },
);

Then("o previsto continua {string}", async ({ page }, valor: string) => {
  await expect(cell(page, "Corrente", "by-account-projected")).toHaveText(same(valor));
});

Then("os valores por conta aparecem mascarados", async ({ page }) => {
  const rows = page.getByTestId("by-account-row");
  await expect(rows.first()).toBeVisible();
  const text = (await page.getByTestId("by-account").innerText()).replace(/\s+/g, " ");
  expect(text).not.toMatch(/R\$\s?\d/);
  await expect(rows.first().getByTestId("by-account-balance")).toContainText("R$ •••••");
  await expect(rows.first().getByTestId("by-account-due")).toContainText("R$ •••••");
});

Then("o aviso {string} continua visível sem número", async ({ page }, aviso: string) => {
  const falta = page.getByTestId("by-account-shortfall").first();
  await expect(falta).toContainText(aviso);
  await expect(falta).toContainText("R$ •••••");
  const aria = await falta.evaluate((el) =>
    [...el.querySelectorAll("[aria-label]")].map((n) => n.getAttribute("aria-label")).join(" "),
  );
  expect(aria).not.toMatch(/\d/);
});

When("Mariana toca na linha {string}", async ({ page }, nome: string) => {
  await row(page, nome).click();
});

When("Mariana limpa o filtro por conta", async ({ page }) => {
  await page.getByTestId("by-account-chip").click();
});

When("Mariana vai para o mês seguinte e volta", async ({ page }) => {
  await page.getByRole("button", { name: "Próximo mês" }).click();
  await expect(page.getByTestId("period-label")).toHaveText("Novembro de 2026");
  await page.getByRole("button", { name: "Mês anterior" }).click();
  await expect(page.getByTestId("period-label")).toHaveText("Outubro de 2026");
});

When("Mariana foca a linha {string} e aperta Enter", async ({ page }, nome: string) => {
  await row(page, nome).focus();
  await page.keyboard.press("Enter");
});

Then(
  "a lista mostra só {string} conta a pagar e o filtro {string}",
  async ({ page }, n: string, chip: string) => {
    await expect(page.getByTestId("payable-item")).toHaveCount(Number(n));
    await expect(page.getByTestId("by-account-chip")).toContainText(chip);
    await expect(row(page, chip.replace("Conta: ", ""))).toHaveAttribute("aria-pressed", "true");
  },
);

Then(
  "a lista mostra só {string} conta a pagar e nenhum filtro por conta",
  async ({ page }, n: string) => {
    await expect(page.getByTestId("payable-item")).toHaveCount(Number(n));
    await expect(page.getByTestId("by-account-chip")).toHaveCount(0);
  },
);

Then("a página não rola na horizontal", async ({ page }) => {
  await expect(page.getByTestId("by-account-row").first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});

Then(
  "vê o esqueleto do resumo por conta e depois a linha {string}",
  async ({ page }, nome: string) => {
    await expect(page.getByTestId("by-account-skeleton")).toBeVisible();
    await expect(row(page, nome)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId("by-account-skeleton")).toHaveCount(0);
  },
);

// Passos da fatura com conta pagadora (cenário @pendente-us-089): ficam definidos para a US-089 ligar.
Given(
  "o cartão {string} com conta pagadora {string} e fatura fechada de {string} vencendo em outubro",
  async () => {
    throw new Error("US-089: CreditCard.paymentAccountId ainda não existe");
  },
);
