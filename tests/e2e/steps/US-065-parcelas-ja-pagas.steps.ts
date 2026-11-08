import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeAccount, makeCard } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { chooseSource, ensureAppPage, fillExpense, gotoInvoice } from "../support/cartoes";
import { Given, Then, When, type World } from "../support/fixtures";
import { drawer, openDrawer, waitSaved } from "../support/lancamento";
import { setupFamily } from "../support/world";

const db = testDb();
const money = (v: string) => parseBRL(v) ?? 0;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const refOf = (mes: string, ano: string) =>
  `${ano}-${String(MESES.indexOf(mes) + 1).padStart(2, "0")}`;
const card = (world: World) => world.data.card as { id: string; name: string };
const PERIODO = "from=2026-11-01&to=2027-08-31";

Given(
  "o cartão {string} com fechamento dia {int}, vencimento dia {int} e limite de {string}",
  async ({ world }, nome: string, fecha: number, vence: number, limite: string) => {
    world.data.card = await makeCard(await setupFamily(world), {
      name: nome,
      owner: "Lucas",
      limitInCents: money(limite),
      closingDay: fecha,
      dueDay: vence,
    });
  },
);

Given(
  "que Lucas abre {string} e escolhe o cartão {string}",
  async ({ page }, _tela: string, cartao: string) => {
    await ensureAppPage(page);
    await openDrawer(page);
    await chooseSource(page, cartao);
  },
);

When("Lucas escolhe {string} parcela", async ({ page }, parcelas: string) => {
  await drawer(page).getByLabel("Parcelas", { exact: true }).selectOption({ label: parcelas });
});

Then("vê o campo {string} com valor {int}", async ({ page }, campo: string, valor: number) => {
  await expect(drawer(page).getByLabel(campo, { exact: true })).toHaveValue(String(valor));
});

Then("não vê o campo {string}", async ({ page }, campo: string) => {
  await expect(drawer(page).getByLabel(campo, { exact: true })).toHaveCount(0);
});

Given(
  "que Lucas informa {string} de {string} em {string}",
  async ({ page, world }, descricao: string, valor: string, parcelas: string) => {
    await fillExpense(page, {
      amount: valor,
      description: descricao,
      card: card(world).name,
      installments: parcelas,
      submit: false,
    });
  },
);

Given("informa {string} parcelas já pagas", async ({ page }, n: string) => {
  await drawer(page).getByLabel("Parcelas já pagas", { exact: true }).fill(n);
});

When("Lucas informa {string} parcelas já pagas", async ({ page }, n: string) => {
  await drawer(page).getByLabel("Parcelas já pagas", { exact: true }).fill(n);
});

When("Lucas salva a despesa", async ({ page }) => {
  await drawer(page).getByRole("button", { name: "Salvar Despesa" }).click();
  await waitSaved(page);
});

Then("o botão de salvar fica desabilitado", async ({ page }) => {
  await expect(drawer(page).getByRole("button", { name: "Salvar Despesa" })).toBeDisabled();
});

/** Lança pela API (mesma sessão do navegador); `paid` = parcelas já pagas, `shared` = dividir. */
async function postPlan(
  page: Page,
  world: World,
  o: { description: string; total: string; installments: number; paid: number; shared?: boolean },
) {
  const category = await db.category.findFirstOrThrow({
    where: { name: "Outros", kind: "EXPENSE" },
  });
  const res = await page.request.post("/api/v1/transactions", {
    headers: { origin: "http://localhost:3101", "idempotency-key": randomUUID() },
    data: {
      type: "EXPENSE",
      cardId: card(world).id,
      categoryId: category.id,
      amountInCents: money(o.total),
      description: o.description,
      installments: o.installments,
      paidBeforeApp: o.paid,
      ...(o.shared ? { isSharedExpense: true } : {}),
    },
  });
  expect(res.status()).toBe(201);
}

Given(
  "que Lucas lançou {string} de {string} em {string} com {string} parcelas já pagas",
  async ({ page, world }, d: string, total: string, n: string, paid: string) => {
    await postPlan(page, world, {
      description: d,
      total,
      installments: Number.parseInt(n, 10),
      paid: Number.parseInt(paid, 10),
    });
  },
);

When(
  "Lucas lança {string} de {string} em {string} com {string} parcelas já pagas",
  async ({ page, world }, d: string, total: string, n: string, paid: string) => {
    await postPlan(page, world, {
      description: d,
      total,
      installments: Number.parseInt(n, 10),
      paid: Number.parseInt(paid, 10),
    });
  },
);

When(
  "Lucas lança {string} de {string} em {string} com {string} parcelas já pagas sem dividir",
  async ({ page, world }, d: string, total: string, n: string, paid: string) => {
    await postPlan(page, world, {
      description: d,
      total,
      installments: Number.parseInt(n, 10),
      paid: Number.parseInt(paid, 10),
    });
  },
);

When(
  "Lucas lança {string} de {string} em {string} com {string} parcelas já pagas dividindo com a família",
  async ({ page, world }, d: string, total: string, n: string, paid: string) => {
    await postPlan(page, world, {
      description: d,
      total,
      installments: Number.parseInt(n, 10),
      paid: Number.parseInt(paid, 10),
      shared: true,
    });
  },
);

Given(
  "que o acerto de contas está ligado e a regra de divisão é igual",
  async ({ page, world }) => {
    const res = await page.request.get("/api/v1/settlement?period=2026-10");
    expect(res.status()).toBe(200);
    world.data.settlementOutBefore = ((await res.json()) as { members: unknown }).members;
  },
);

Then(
  "o acerto de nov\\/2026 considera {string} pago por Lucas",
  async ({ page }, valor: string) => {
    const res = await page.request.get("/api/v1/settlement?period=2026-11");
    const body = (await res.json()) as {
      members: Array<{ member: { name: string }; paidInCents: number }>;
    };
    expect(body.members.find((m) => m.member.name.startsWith("Lucas"))?.paidInCents).toBe(
      money(valor),
    );
  },
);

Then("o acerto de out\\/2026 não muda", async ({ page, world }) => {
  const res = await page.request.get("/api/v1/settlement?period=2026-10");
  expect(((await res.json()) as { members: unknown }).members).toEqual(
    world.data.settlementOutBefore,
  );
});

Then(
  /^a fatura de (\w{3})\/(\d{4}) não mostra mais "(.+)"$/,
  async ({ page, world }, mes: string, ano: string, titulo: string) => {
    await gotoInvoice(page, world, refOf(mes, ano));
    await expect(page.getByTestId("ledger-row").filter({ hasText: titulo })).toHaveCount(0);
  },
);

Then("não vê nenhuma linha {string}", async ({ page }, titulo: string) => {
  await expect(page.getByTestId("ledger-row").filter({ hasText: titulo })).toHaveCount(0);
});

Given(
  "que a conta {string} tem saldo de {string}",
  async ({ world }, conta: string, saldo: string) => {
    await makeAccount(await setupFamily(world), {
      name: conta,
      owner: "Lucas",
      openingBalanceInCents: money(saldo),
    });
  },
);

Then(
  "o saldo da conta {string} continua {string}",
  async ({ page }, conta: string, saldo: string) => {
    await gotoReady(page, "/contas");
    await expect(page.getByTestId("account-card").filter({ hasText: conta })).toContainText(
      normalizeSpaces(saldo),
    );
  },
);

const availableOf = async (page: Page) => {
  await gotoReady(page, "/cartoes");
  return page.getByTestId("card-available").first();
};

Given(
  "que o limite disponível do cartão {string} é {string}",
  async ({ page }, _c: string, valor: string) => {
    await expect(await availableOf(page)).toHaveText(normalizeSpaces(valor));
  },
);

Then(
  /^o limite disponível do cartão "([^"]+)" (?:é|volta a) "([^"]+)"$/,
  async ({ page }, _c: string, valor: string) => {
    await expect(await availableOf(page)).toHaveText(normalizeSpaces(valor));
  },
);

Given("que o acerto de contas está ligado", async ({ page, world }) => {
  const res = await page.request.get("/api/v1/settlement?period=2026-11");
  expect(res.status()).toBe(200);
  world.data.settlementBefore = ((await res.json()) as { members: unknown }).members;
});

Then("o acerto de nov\\/2026 não muda", async ({ page, world }) => {
  const res = await page.request.get("/api/v1/settlement?period=2026-11");
  expect(((await res.json()) as { members: unknown }).members).toEqual(world.data.settlementBefore);
});

When(
  "Lucas abre {string} na parcela {string}",
  async ({ page, world }, _acao: string, parcela: string) => {
    await gotoReady(page, `/extrato?cardId=${card(world).id}&${PERIODO}`);
    await page
      .getByTestId("ledger-row")
      .filter({ hasText: new RegExp(`· ${parcela.replace("/", "\\/")}`) })
      .first()
      .locator("xpath=..")
      .getByTestId("view-plan")
      .click();
    await expect(page.getByRole("dialog", { name: "Compra parcelada" })).toBeVisible();
  },
);

Then(
  "vê as parcelas {string} a {string} com suas faturas",
  async ({ page }, de: string, ate: string) => {
    const rows = page.getByRole("dialog", { name: "Compra parcelada" }).getByTestId("plan-parcel");
    await expect(rows).toHaveCount(6);
    await expect(rows.first()).toContainText(de);
    await expect(rows.first()).toContainText("nov/2026");
    await expect(rows.last()).toContainText(ate);
    await expect(rows.last()).toContainText("abr/2027");
  },
);

When("Lucas escolhe {string} e confirma", async ({ page, world }, acao: string) => {
  await gotoReady(page, `/extrato?cardId=${card(world).id}&${PERIODO}`);
  await page.getByTestId("ledger-row").first().click();
  await page.getByRole("button", { name: acao }).click();
  await page
    .getByRole("dialog", { name: "Excluir compra parcelada?" })
    .getByRole("button", { name: acao })
    .click();
  await expect(page.getByText("Compra parcelada excluída")).toBeVisible();
});
