import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeCardPurchase } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { enterAs } from "../support/acerto";
import { cardItem, openCartoes } from "../support/cartoes";
import { Given, Then, When, type World } from "../support/fixtures";
import { setToday } from "../support/world";

const db = testDb();
const money = (v: string) => parseBRL(v) ?? 0;
const cardOf = (w: World) => w.data.card as Parameters<typeof makeCardPurchase>[1]["card"];
const iso = (d: string, m: string, y: string) => `${y}-${m}-${d}`;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const refOf = (label: string) => {
  const [mes, ano] = label.split("/") as [string, string];
  return `${ano}-${String(MESES.indexOf(mes) + 1).padStart(2, "0")}`;
};

let seq = 0;
const stamp = () => new Date(Date.UTC(2026, 9, 1, 12, 0, ++seq));

async function openInvoicePage(page: Page, world: World, ref?: string) {
  await enterAs(world, page, "Lucas");
  const card = await db.creditCard.findFirstOrThrow({
    where: { familyId: world.family?.family.id },
  });
  await gotoReady(page, `/cartoes/${card.id}${ref ? `?ref=${ref}` : ""}`);
}

Given(
  /^compras de "([^"]+)" e "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4}) no cartão$/,
  async ({ world }, a: string, b: string, d: string, m: string, y: string) => {
    for (const valor of [a, b]) {
      await makeCardPurchase(world.family as never, {
        card: cardOf(world),
        amountInCents: money(valor),
        occurredOn: iso(d, m, y),
        author: "Lucas",
        payer: "Lucas",
        createdAt: stamp(),
      });
    }
  },
);

Given(
  /^uma compra de "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4}) no cartão$/,
  async ({ world }, valor: string, d: string, m: string, y: string) => {
    await makeCardPurchase(world.family as never, {
      card: cardOf(world),
      amountInCents: money(valor),
      occurredOn: iso(d, m, y),
      author: "Lucas",
      payer: "Lucas",
      createdAt: stamp(),
    });
  },
);

When("Lucas abre o cartão {string}", async ({ page, world }, nome: string) => {
  await enterAs(world, page, "Lucas");
  await openCartoes(page);
  await cardItem(page, nome).getByRole("link", { name: nome }).click();
  await expect(page).toHaveURL(/\/cartoes\/[0-9a-f-]{36}/);
});

When("Lucas abre o cartão", async ({ page, world }) => {
  await openInvoicePage(page, world);
});

When("Lucas abre a fatura", async ({ page, world }) => {
  await openInvoicePage(page, world, "2026-10");
});

Then(
  /^vê a fatura "([^"]+)" com situação "([^"]+)", total "([^"]+)", fechamento (\d{2})\/(\d{2}) e vencimento (\d{2})\/(\d{2})$/,
  async (
    { page },
    rotulo: string,
    situacao: string,
    total: string,
    fd: string,
    fm: string,
    vd: string,
    vm: string,
  ) => {
    await expect(page.getByTestId("invoice-ref")).toHaveText(rotulo);
    await expect(page.getByTestId("invoice-status")).toHaveText(situacao);
    await expect(page.getByTestId("invoice-total")).toHaveText(normalizeSpaces(total));
    await expect(page.getByTestId("invoice-dates")).toHaveText(
      `Fecha em ${fd}/${fm} · vence em ${vd}/${vm}`,
    );
  },
);

Then("vê as duas compras da mais recente para a mais antiga", async ({ page }) => {
  const rows = page.getByTestId("ledger-row");
  await expect(rows).toHaveCount(2);
  // mesma data; a criada por último vem primeiro
  await expect(rows.nth(0)).toContainText(normalizeSpaces("R$ 100,00"));
  await expect(rows.nth(1)).toContainText(normalizeSpaces("R$ 300,00"));
});

Then(
  "o cartão {string} mostra {string}, usado {string} e disponível {string}",
  async ({ page }, nome: string, fatura: string, usado: string, disponivel: string) => {
    const item = cardItem(page, nome);
    await expect(item.getByTestId("card-open-invoice")).toContainText(normalizeSpaces(fatura));
    await expect(item.getByTestId("card-used")).toHaveText(normalizeSpaces(usado));
    await expect(item.getByTestId("card-available")).toHaveText(normalizeSpaces(disponivel));
  },
);

When(
  /^hoje passa a ser (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, d: string, m: string, y: string) => {
    world.data.today = iso(d, m, y);
    await setToday(iso(d, m, y));
  },
);

Given(
  /^que hoje é (\d{2})\/(\d{2})\/(\d{4}) e a fatura não foi paga$/,
  async ({ world }, d: string, m: string, y: string) => {
    world.data.today = iso(d, m, y);
    await setToday(iso(d, m, y));
  },
);

Then(
  "a fatura {string} está {string}",
  async ({ page, world }, rotulo: string, situacao: string) => {
    await openInvoicePage(page, world, refOf(rotulo));
    await expect(page.getByTestId("invoice-status")).toHaveText(situacao);
  },
);

Then(
  /^a fatura "([^"]+)" está "([^"]+)" com vencimento (\d{2})\/(\d{2}) e é destacada como "a pagar"$/,
  async ({ page, world }, rotulo: string, situacao: string, vd: string, vm: string) => {
    await openInvoicePage(page, world, refOf(rotulo));
    await expect(page.getByTestId("invoice-status")).toHaveText(situacao);
    await expect(page.getByTestId("invoice-dates")).toContainText(`vence em ${vd}/${vm}`);
    await expect(page.getByTestId("invoice-to-pay")).toHaveText("A pagar");
  },
);

Then(
  "a fatura {string} aparece como {string} em destaque de alerta",
  async ({ page, world }, rotulo: string, situacao: string) => {
    await openInvoicePage(page, world, refOf(rotulo));
    const chip = page.getByTestId("invoice-status");
    await expect(chip).toHaveText(situacao);
    await expect(chip).toHaveClass(/bg-red-100/);
  },
);

Given(
  "compras de {string} na fatura {string} e de {string} na fatura {string}",
  async ({ world }, v1: string, r1: string, v2: string, r2: string) => {
    const dateOf = (ref: string) => (ref === "2026-10" ? "2026-10-10" : "2026-10-27");
    for (const [valor, rotulo] of [
      [v1, r1],
      [v2, r2],
    ] as const) {
      await makeCardPurchase(world.family as never, {
        card: cardOf(world),
        amountInCents: money(valor),
        occurredOn: dateOf(refOf(rotulo)),
        createdAt: stamp(),
      });
    }
  },
);

Then(
  "o limite usado é {string} e o disponível é {string}",
  async ({ page }, usado: string, disponivel: string) => {
    await expect(page.getByTestId("card-used")).toHaveText(normalizeSpaces(usado));
    await expect(page.getByTestId("card-available")).toHaveText(normalizeSpaces(disponivel));
  },
);

Given(
  /^compras em out\/2026 e em nov\/2026 e que hoje é (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, d: string, m: string, y: string) => {
    for (const date of ["2026-10-10", "2026-11-10"]) {
      await makeCardPurchase(world.family as never, {
        card: cardOf(world),
        amountInCents: 10000,
        occurredOn: date,
        createdAt: stamp(),
      });
    }
    world.data.today = iso(d, m, y);
    await setToday(iso(d, m, y));
  },
);

When("Lucas abre a fatura atual e toca em {string}", async ({ page, world }, botao: string) => {
  await openInvoicePage(page, world);
  await expect(page.getByTestId("invoice-ref")).toHaveText("nov/2026");
  await page.getByRole("button", { name: botao }).click();
});

Then("vê a fatura {string}", async ({ page }, rotulo: string) => {
  await expect(page.getByTestId("invoice-ref")).toHaveText(rotulo);
});

Then(
  "o botão {string} fica desabilitado por não haver fatura mais antiga",
  async ({ page }, botao: string) => {
    await expect(page.getByRole("button", { name: botao })).toBeDisabled();
  },
);

Given(
  "compras de {string} de Mariana e de {string} de Lucas na fatura {string}",
  async ({ world }, vm: string, vl: string, _rotulo: string) => {
    for (const [valor, quem] of [
      [vm, "Mariana"],
      [vl, "Lucas"],
    ] as const) {
      await makeCardPurchase(world.family as never, {
        card: cardOf(world),
        amountInCents: money(valor),
        occurredOn: "2026-10-03",
        author: quem,
        payer: quem,
        createdAt: stamp(),
      });
    }
  },
);

Then("vê {string} e {string}", async ({ page }, a: string, b: string) => {
  const members = page.getByTestId("invoice-member");
  await expect(members.filter({ hasText: normalizeSpaces(a) })).toHaveCount(1);
  await expect(members.filter({ hasText: normalizeSpaces(b) })).toHaveCount(1);
});

Given(
  /^a fatura "([^"]+)" fechada com total "([^"]+)" e que hoje é (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ world }, _rotulo: string, total: string, d: string, m: string, y: string) => {
    await makeCardPurchase(world.family as never, {
      card: cardOf(world),
      amountInCents: money(total),
      occurredOn: "2026-10-15",
      createdAt: stamp(),
    });
    world.data.today = iso(d, m, y);
    await setToday(iso(d, m, y));
  },
);

Then(
  "o total da fatura {string} passa a {string}",
  async ({ page, world }, rotulo: string, total: string) => {
    await openInvoicePage(page, world, refOf(rotulo));
    await expect(page.getByTestId("invoice-total")).toHaveText(normalizeSpaces(total));
  },
);

Given(
  "uma compra de {string} excluída na fatura {string}",
  async ({ world }, valor: string, _rotulo: string) => {
    await makeCardPurchase(world.family as never, {
      card: cardOf(world),
      amountInCents: money(valor),
      occurredOn: "2026-10-03",
      deleted: true,
    });
  },
);

Then("o total não inclui {string}", async ({ page }, valor: string) => {
  await expect(page.getByTestId("invoice-total")).not.toHaveText(normalizeSpaces(valor));
  await expect(page.getByTestId("ledger-row")).toHaveCount(0);
});

Given("que o cartão não tem compras", async () => {
  expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(0);
});

Then("vê {string} e total {string}", async ({ page }, mensagem: string, total: string) => {
  await expect(page.getByText(mensagem, { exact: true })).toBeVisible();
  await expect(page.getByTestId("invoice-total")).toHaveText(normalizeSpaces(total));
});

Given("que a leitura da fatura falha", async ({ page }) => {
  await page.route("**/api/v1/cards/*/invoices/*", (route) => route.abort("connectionfailed"));
});

When(
  "Lucas tenta abrir a fatura do cartão {string} por endereço direto",
  async ({ page, world }, nome: string) => {
    await enterAs(world, page, "Lucas");
    const card = await db.creditCard.findFirstOrThrow({ where: { name: nome } });
    await gotoReady(page, `/cartoes/${card.id}`);
  },
);
