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
import { gotoReady } from "../../support/nav";
import { gotoInvoice } from "../support/cartoes";
import { Given, Then, When, type World } from "../support/fixtures";
import { openPay } from "../support/previstas";

const money = (v: string) => parseBRL(v) ?? 0;
const select = (page: Page) => page.locator("#pi-account, #pay-account");
const dialog = (page: Page) => page.getByRole("dialog");

Given(
  /^as contas "([^"]+)" de "([^"]+)" \((.+)\), "([^"]+)" de "([^"]+)" \((.+)\) e "([^"]+)" de "([^"]+)" \((.+)\)$/,
  async ({ world }, n1, o1, v1, n2, o2, v2, n3, o3, v3) => {
    world.family = await makeFamily();
    const accs: Record<string, Awaited<ReturnType<typeof makeAccount>>> = {};
    for (const [n, o, v] of [
      [n1, o1, v1],
      [n2, o2, v2],
      [n3, o3, v3],
    ] as const) {
      accs[n] = await makeAccount(world.family, {
        name: n,
        owner: o,
        openingBalanceInCents: money(v),
      });
    }
    world.data.accs = accs;
  },
);

const accs = (w: World) => w.data.accs as Record<string, Awaited<ReturnType<typeof makeAccount>>>;

async function use(world: World, conta: string, n: number, date = "2026-10-01") {
  for (let i = 0; i < n; i += 1) {
    await makeTransaction(world.family as never, {
      account: accs(world)[conta] as never,
      category: "Supermercado",
      amountInCents: 100,
      occurredOn: date,
      author: "Lucas",
      payer: "Lucas",
      shared: false,
      createdAt: new Date(Date.UTC(2026, 9, 1, 12, 0, i)),
    });
  }
}

Given("que a última conta usada por Lucas foi {string}", async ({ world }, conta: string) => {
  await use(world, conta, 1, "2026-10-03");
});

Given(
  "uma fatura fechada de {string} do cartão {string} cujo titular é {string}",
  async ({ world }, total: string, nome: string, titular: string) => {
    const fx = world.family as never;
    const card = await makeCard(fx, { name: nome, owner: titular, closingDay: 25, dueDay: 5 });
    world.data.card = card;
    await makeCardPurchase(fx, {
      card,
      amountInCents: money(total),
      occurredOn: "2026-09-10",
      author: titular,
      payer: titular,
    });
  },
);

Given(
  "a despesa prevista {string} de {string} com responsável {string}",
  async ({ world }, desc: string, valor: string, resp: string) => {
    await makePlannedExpense(world.family as never, {
      description: desc,
      amountInCents: money(valor),
      dueOn: "2026-10-15",
      responsible: resp,
    });
  },
);

Given(
  "que Lucas usou {string} {int} vezes e uma segunda conta sua {string} com saldo {string} {int} vez",
  async ({ world }, conta: string, n: number, outra: string, saldo: string, m: number) => {
    const b = await makeAccount(world.family as never, {
      name: outra,
      owner: "Lucas",
      openingBalanceInCents: money(saldo),
    });
    accs(world)[outra] = b;
    await use(world, conta, n);
    await use(world, outra, m);
  },
);

When("Lucas abre o drawer {string}", async ({ page, world }, _botao: string) => {
  await gotoInvoice(page, world, "2026-09");
  await page.getByRole("button", { name: "Pagar fatura" }).click();
  await expect(select(page)).toBeVisible();
});

When(
  "Lucas abre o drawer {string} em {string}",
  async ({ page }, _botao: string, titulo: string) => {
    await gotoReady(page, "/previstas");
    await openPay(page, titulo);
  },
);

Then("a conta de origem sugerida é {string}", async ({ page }, conta: string) => {
  await expect(select(page).locator("option:checked")).toContainText(conta);
});

Then("o motivo {string} aparece", async ({ page }, texto: string) => {
  await expect(page.getByTestId("source-reason")).toHaveText(texto);
});

Then("o aviso {string} não aparece", async ({ page }, aviso: string) => {
  await expect(select(page).locator("option:checked")).not.toHaveCount(0);
  await expect(dialog(page).getByText(aviso)).toHaveCount(0);
});

Then(
  "o aviso {string} aparece com o botão {string}",
  async ({ page }, aviso: string, botao: string) => {
    await expect(dialog(page).getByText(aviso)).toBeVisible();
    await expect(dialog(page).getByRole("button", { name: botao })).toBeVisible();
  },
);

Then("a opção {string} aparece com {string}", async ({ page }, conta: string, marca: string) => {
  await expect(select(page).locator("option", { hasText: conta })).toContainText(marca);
});

Then("a opção {string} aparece sem marcação", async ({ page }, conta: string) => {
  const opt = select(page).locator("option", { hasText: conta }).first();
  await expect(opt).not.toContainText("saldo insuficiente");
});

When("Lucas escolhe manualmente a conta {string}", async ({ page }, conta: string) => {
  const s = select(page);
  const value = await s.locator("option", { hasText: conta }).first().getAttribute("value");
  await s.selectOption(value as string);
});

When("Lucas altera o valor pago para {string}", async ({ page }, valor: string) => {
  await dialog(page).getByLabel("Valor pago").fill(valor);
});

When("Lucas abre o formulário de nova despesa", async ({ page }) => {
  await gotoReady(page, "/");
  await page.getByRole("button", { name: "Novo lançamento" }).click();
});
