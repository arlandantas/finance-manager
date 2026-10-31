import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import {
  makeAccount,
  makeCard,
  makeCardPurchase,
  makeInvoice,
  makeInvoicePayment,
  makeTransaction,
} from "../../support/factories";
import { gotoReady } from "../../support/nav";
import {
  cardItem,
  createCardViaUi,
  fillPayInvoice,
  gotoInvoice,
  openCartoes,
  openNewCard,
  openPayInvoice,
} from "../support/cartoes";
import { dlg } from "../support/categorias";
import { Given, Then, When, type World } from "../support/fixtures";
import { setToday, setupFamily } from "../support/world";

const db = testDb();
type Acct = Awaited<ReturnType<typeof makeAccount>>;
type CardRef = Awaited<ReturnType<typeof makeCard>>;
const accts = (w: World) => w.data.pagadoraAccts as Record<string, Acct>;
const cardOf = (w: World) => w.data.card as CardRef;
const toast = (page: Page, t: string) => page.locator("[data-sonner-toast]").filter({ hasText: t });
const MESES: Record<string, string> = { "out/2026": "2026-10" };

Given(
  'a "Família Silva" com as contas {string} e {string} e os membros {string} e {string}',
  async ({ world }, a: string, b: string, _m1: string, _m2: string) => {
    const fx = await setupFamily(world);
    world.data.pagadoraAccts = {
      [a]: await makeAccount(fx, { name: a, owner: "Mariana", openingBalanceInCents: 300000 }),
      [b]: await makeAccount(fx, { name: b, owner: "Mariana", openingBalanceInCents: 300000 }),
    };
  },
);

Given(
  "o cartão {string} de Lucas com fechamento dia {int} e vencimento dia {int}",
  async ({ world }, nome: string, fecha: number, vence: number) => {
    const card = await makeCard(await setupFamily(world), {
      name: nome,
      owner: "Lucas",
      closingDay: fecha,
      dueDay: vence,
      limitInCents: 1000000,
    });
    world.data.card = card;
  },
);

async function setPayer(world: World, conta: string) {
  await db.creditCard.update({
    where: { id: cardOf(world).id },
    data: { paymentAccountId: accts(world)[conta]?.id as string },
  });
}

async function closedInvoice(world: World, valor: string) {
  const cents = Math.round(
    Number(
      valor
        .replace(/[^\d,]/g, "")
        .replace(".", "")
        .replace(",", "."),
    ) * 100,
  );
  await makeCardPurchase(world.family as never, {
    card: cardOf(world),
    amountInCents: cents,
    occurredOn: "2026-10-10",
    author: "Lucas",
    payer: "Lucas",
  });
}

Given(
  '"Nubank Lucas" com conta pagadora {string} e fatura fechada de {string}',
  async ({ world }, conta: string, valor: string) => {
    await setPayer(world, conta);
    await closedInvoice(world, valor);
  },
);

Given(
  '"Nubank Lucas" com conta pagadora {string} e fatura fechada vencendo hoje',
  async ({ world }, conta: string) => {
    await setPayer(world, conta);
    await closedInvoice(world, "R$ 1.500,00");
    await setToday("2026-11-05"); // fecha 25/10, vence 05/11
  },
);

async function openEdit(page: Page, nome: string) {
  await openCartoes(page);
  await page.getByRole("button", { name: `Ações do cartão ${nome}` }).click();
  await page.getByRole("menuitem", { name: "Editar" }).click();
  const d = dlg(page, "Editar cartão");
  await expect(d).toBeVisible();
  return d;
}

When("Lucas edita {string} e escolhe {string}", async ({ page }, nome: string, escolha: string) => {
  const [campo, valor] = escolha.split(": ") as [string, string];
  const d = await openEdit(page, nome);
  await d.getByLabel(campo, { exact: true }).selectOption({ label: valor });
  await d.getByRole("button", { name: "Salvar cartão" }).click();
});

Then("{string} mostra {string}", async ({ page }, nome: string, texto: string) => {
  await expect(cardItem(page, nome).getByTestId("card-payer")).toHaveText(texto);
});

When(
  "Lucas cria o cartão {string} sem escolher a conta pagadora",
  async ({ page }, nome: string) => {
    await openCartoes(page);
    await createCardViaUi(page, { name: nome });
    await expect(page.getByText("Cartão cadastrado com sucesso!")).toBeVisible();
  },
);

Then("o cartão {string} é criado sem conta pagadora", async ({ page }, nome: string) => {
  const row = await db.creditCard.findFirstOrThrow({ where: { name: nome } });
  expect(row.paymentAccountId).toBeNull();
  await expect(cardItem(page, nome)).toHaveCount(1);
  await expect(cardItem(page, nome).getByTestId("card-payer")).toHaveCount(0);
  void openNewCard;
});

When("Lucas abre o pagamento da fatura de {string}", async ({ page, world }, rotulo: string) => {
  const d = await openPayInvoice(page, world, MESES[rotulo] ?? "2026-10");
  world.data.payDrawer = true;
  await expect(d).toBeVisible();
});

Then(
  "o campo {string} vem com {string} e o texto {string}",
  async ({ page, world }, campo: string, conta: string, texto: string) => {
    const d = dlg(page, /Pagar fatura/);
    const select = d.getByLabel(campo, { exact: true });
    await expect(select.locator("option:checked")).toContainText(conta);
    await expect(d.getByTestId("source-reason")).toHaveText(texto);
    void world;
  },
);

Then("a opção {string} indica {string}", async ({ page }, conta: string, marca: string) => {
  const d = dlg(page, /Pagar fatura/);
  await expect(
    d.getByLabel("Conta de origem", { exact: true }).locator("option", { hasText: conta }),
  ).toContainText(marca);
});

Then("nenhum valor em reais aparece em claro no pagamento", async ({ page }) => {
  const text = await dlg(page, /Pagar fatura/).innerText();
  expect(text).not.toMatch(/R\$\s?\d/);
});

When(
  "Lucas escolhe {string} em {string} e confirma",
  async ({ page, world }, conta: string, _campo: string) => {
    const d = await openPayInvoice(page, world, "2026-10");
    await fillPayInvoice(d, { account: conta });
    await d.getByRole("button", { name: "Confirmar pagamento" }).click();
    await expect(page.getByText("Fatura paga com sucesso!")).toBeVisible();
  },
);

Then("o pagamento sai da {string}", async ({ world }, conta: string) => {
  const pay = await db.transaction.findFirstOrThrow({ where: { kind: "INVOICE_PAYMENT" } });
  expect(pay.accountId).toBe(accts(world)[conta]?.id);
});

Then("a conta pagadora padrão do cartão continua {string}", async ({ world }, conta: string) => {
  const row = await db.creditCard.findUniqueOrThrow({ where: { id: cardOf(world).id } });
  expect(row.paymentAccountId).toBe(accts(world)[conta]?.id);
});

When("o dia passa sem ninguém pagar", async ({ page }) => {
  await setToday("2026-11-06");
  await gotoReady(page, "/previstas");
});

Then(
  "a fatura continua em {string} e nada é debitado da {string}",
  async ({ page, world }, _lista: string, conta: string) => {
    await expect(
      page.getByTestId("payable-item").filter({ hasText: "Fatura Nubank Lucas" }),
    ).toBeVisible();
    expect(await db.transaction.count({ where: { kind: "INVOICE_PAYMENT" } })).toBe(0);
    const acc = (await (await page.request.get("/api/v1/accounts")).json()) as {
      items: Array<{ id: string; balanceInCents: number }>;
    };
    expect(acc.items.find((a) => a.id === accts(world)[conta]?.id)?.balanceInCents).toBe(300000);
  },
);

When(
  "Lucas abre o diálogo de arquivar a conta {string} já zerada",
  async ({ page, world }, conta: string) => {
    // zera a conta com uma despesa (arquivar exige saldo zero)
    await makeTransaction(world.family as never, {
      account: accts(world)[conta] as Acct,
      category: "Supermercado",
      amountInCents: 300000,
      occurredOn: "2026-10-03",
      author: "Mariana",
    });
    await gotoReady(page, "/contas");
    await page
      .getByTestId("account-card")
      .filter({ hasText: conta })
      .getByRole("button", { name: `Ações da conta ${conta}` })
      .click();
    await page.getByRole("menuitem", { name: "Arquivar" }).click();
    await expect(dlg(page, `Arquivar ${conta}?`)).toBeVisible();
  },
);

Then(
  "o diálogo de arquivar cita {string} como cartão que usa a conta",
  async ({ page }, cartao: string) => {
    await expect(page.getByTestId("archive-payer-note")).toContainText(cartao);
  },
);

When("Lucas confirma o arquivamento", async ({ page }) => {
  await page.getByRole("dialog").getByRole("button", { name: "Arquivar", exact: true }).click();
  await expect(toast(page, "Conta arquivada")).toBeVisible();
});

Then("o cartão mostra o aviso {string}", async ({ page }, aviso: string) => {
  await openCartoes(page);
  await gotoReady(page, "/cartoes");
  await expect(cardItem(page, "Nubank Lucas").getByTestId("card-payer")).toHaveText(
    "Conta pagadora arquivada (Corrente)",
  );
  const d = await openEdit(page, "Nubank Lucas");
  await expect(d.getByRole("status").filter({ hasText: aviso })).toBeVisible();
  await page.keyboard.press("Escape");
});

Then("a fatura ainda pode ser paga por outra conta", async ({ page, world }) => {
  await gotoInvoice(page, world, "2026-10");
  const d = await openPayInvoice(page, world, "2026-10");
  await expect(
    d.getByLabel("Conta de origem", { exact: true }).locator("option", { hasText: "Corrente" }),
  ).toHaveCount(0);
  await fillPayInvoice(d, { account: "Poupança" });
  await d.getByRole("button", { name: "Confirmar pagamento" }).click();
  await expect(page.getByText("Fatura paga com sucesso!")).toBeVisible();
});

Given("a fatura de setembro paga pela {string}", async ({ world }, conta: string) => {
  const fx = world.family as never;
  await setPayer(world, conta);
  await makeCardPurchase(fx, {
    card: cardOf(world),
    amountInCents: 80000,
    occurredOn: "2026-09-10",
    author: "Lucas",
    payer: "Lucas",
  });
  const invoice = await makeInvoice(fx, cardOf(world), "2026-09");
  await makeInvoicePayment(fx, {
    card: cardOf(world),
    invoice,
    account: accts(world)[conta] as Acct,
    amountInCents: 80000,
    paidOn: "2026-09-28",
    author: "Lucas",
  });
  world.data.paidWith = conta;
});

When("Lucas troca a conta pagadora para {string}", async ({ page }, conta: string) => {
  const d = await openEdit(page, "Nubank Lucas");
  await d.getByLabel("Conta que paga a fatura", { exact: true }).selectOption({ label: conta });
  await d.getByRole("button", { name: "Salvar cartão" }).click();
  await expect(page.getByText("Cartão atualizado")).toBeVisible();
});

Then("o pagamento de setembro continua debitado da {string}", async ({ world }, conta: string) => {
  const pay = await db.transaction.findFirstOrThrow({ where: { kind: "INVOICE_PAYMENT" } });
  expect(pay.accountId).toBe(accts(world)[conta]?.id);
  const card = await db.creditCard.findUniqueOrThrow({ where: { id: cardOf(world).id } });
  expect(card.paymentAccountId).toBe(accts(world).Poupança?.id);
});

When("Lucas abre {string} de novembro de 2026", async ({ page }, _tela: string) => {
  await gotoReady(page, "/previstas?period=2026-11");
  await expect(page.getByTestId("period-label")).toHaveText("Novembro de 2026");
});

Then("o item {string} mostra {string}", async ({ page }, item: string, texto: string) => {
  await expect(
    page.getByTestId("payable-item").filter({ hasText: item }).filter({ hasText: texto }),
  ).toBeVisible();
});

When("Lucas vai para a tela de cartões", async ({ page }) => {
  await gotoReady(page, "/cartoes");
  await openCartoes(page);
});

Then("a página não rola na horizontal no cartão", async ({ page }) => {
  await expect(page.getByTestId("card-payer").first()).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
