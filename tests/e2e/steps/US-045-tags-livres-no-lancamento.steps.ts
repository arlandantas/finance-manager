import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { makeCard, makeTag, makeTransaction } from "../../support/factories";
import { gotoReady, reloadIfOpen } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import {
  drawer,
  ensureWorld,
  fillAmount,
  openDrawer,
  pickCategory,
  save,
  waitSaved,
} from "../support/lancamento";
import { chipsOf, tagBox, typeTags } from "../support/tags";

const db = testDb();

Given(
  "a família {string} com a conta {string} com saldo {string} para tags",
  async ({ world, page }, _familia: string, conta: string, saldo: string) => {
    await ensureWorld(world, page, "Mariana", {
      name: conta,
      owner: "Mariana",
      balance: parseBRL(saldo) ?? 0,
    });
  },
);

Given("Mariana está autenticada no formulário {string}", async ({ world, page }, _form: string) => {
  await ensureWorld(world, page, "Mariana");
});

async function account(world: World) {
  return db.bankAccount.findFirstOrThrow({ where: { familyId: world.family?.family.id } });
}

Given("a tag {string} já usada em outro lançamento", async ({ world }, tag: string) => {
  const acc = await account(world);
  await makeTransaction(world.family as never, {
    account: { id: acc.id, name: acc.name, ownerMemberId: acc.ownerMemberId },
    category: "Supermercado",
    amountInCents: 1000,
    occurredOn: "2026-10-03",
    description: "Outro",
    tags: [tag],
  });
});

Given("a tag {string} já existente na família", async ({ world }, tag: string) => {
  await makeTag(world.family as never, tag);
});

/** Preenche e salva uma despesa; `tags` entram pela linha "+ Tag". */
async function lancar(
  page: Page,
  o: { desc?: string; valor: string; categoria: string; tags?: string[]; salvar?: boolean },
) {
  await openDrawer(page);
  await fillAmount(page, o.valor);
  await pickCategory(page, o.categoria);
  if (o.desc) await page.getByLabel("Descrição (opcional)").fill(o.desc);
  if (o.tags?.length) await typeTags(page, o.tags);
  if (o.salvar !== false) {
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  }
}

When(
  "Mariana lança {string} em {string} sem tocar nas tags",
  async ({ page }, valor: string, categoria: string) => {
    await expect(drawer(page)).toBeHidden();
    await lancar(page, { valor, categoria });
    // quatro interações: valor, categoria, salvar (sem foco automático nem campo aberto)
  },
);

Then("a despesa é registrada sem tags", async () => {
  expect(await db.transaction.count({ where: { kind: "EXPENSE" } })).toBe(1);
  expect(await db.tag.count()).toBe(0);
  expect(await db.transactionTag.count()).toBe(0);
});

When(
  "Mariana lança {string} de {string} em {string} com a tag {string}",
  async ({ page }, desc: string, valor: string, categoria: string, tag: string) => {
    await lancar(page, { desc, valor, categoria, tags: [tag] });
  },
);

When(
  "Mariana lança {string} de {string} em {string} com as tags {string} e {string}",
  async ({ page }, desc: string, valor: string, categoria: string, a: string, b: string) => {
    await lancar(page, { desc, valor, categoria, tags: [a, b] });
  },
);

async function extratoRow(page: Page, desc: string) {
  await gotoReady(page, "/extrato");
  const row = page.getByTestId("ledger-row").filter({ hasText: desc }).first();
  await expect(row).toBeVisible();
  return row;
}

Then(
  "o Extrato mostra {string} com a tag {string}",
  async ({ page }, desc: string, tag: string) => {
    const row = await extratoRow(page, desc);
    await expect(chipsOf(row).filter({ hasText: tag })).toHaveCount(1);
  },
);

Then("o Extrato mostra as duas tags em {string}", async ({ page }, desc: string) => {
  const row = await extratoRow(page, desc);
  await expect(chipsOf(row)).toHaveCount(2);
  await expect(chipsOf(row).nth(0)).toHaveText("ferias");
  await expect(chipsOf(row).nth(1)).toHaveText("viagem-nordeste");
});

When("Mariana digita {string} no campo de tag", async ({ page }, texto: string) => {
  await openDrawer(page);
  const { input } = await tagBox(page);
  await input.fill(texto);
});

Then("vê a sugestão de tag {string}", async ({ page }, tag: string) => {
  await expect(drawer(page).getByRole("option", { name: tag })).toBeVisible();
});

Then(
  "o lançamento {string} fica com a tag {string}",
  async ({ page }, desc: string, tag: string) => {
    const row = await extratoRow(page, desc);
    await expect(chipsOf(row)).toHaveCount(1);
    await expect(chipsOf(row).first()).toHaveText(tag);
  },
);

Then("não existe uma segunda tag {string}", async ({}, tag: string) => {
  expect(await db.tag.count()).toBe(1);
  expect(await db.tag.count({ where: { name: tag } })).toBe(0);
});

When(
  "Mariana preenche {string} de {string} em {string} com 3 tags e acrescenta uma quarta",
  async ({ page }, desc: string, valor: string, categoria: string) => {
    await lancar(page, {
      desc,
      valor,
      categoria,
      tags: ["tag1", "tag2", "tag3", "tag4"],
      salvar: false,
    });
  },
);

Then("vê o aviso de tags {string}", async ({ page }, aviso: string) => {
  await expect(drawer(page).getByText(aviso)).toBeVisible();
});

Then("consegue salvar mesmo assim", async ({ page }) => {
  await save(page, "Salvar Despesa");
  await waitSaved(page);
  expect(await db.transactionTag.count()).toBe(4);
});

When("Mariana digita a tag {string} e confirma", async ({ page }, tag: string) => {
  await openDrawer(page);
  await typeTags(page, [tag]);
});

Then("vê o erro de tag {string}", async ({ page }, msg: string) => {
  await expect(drawer(page).getByRole("alert").filter({ hasText: msg })).toBeVisible();
});

When("Mariana abre o formulário {string}", async ({ page }, _nome: string) => {
  await gotoReady(page, "/contas");
  await page.getByRole("button", { name: "Transferir" }).click();
  await expect(page.getByRole("dialog", { name: "Transferir" })).toBeVisible();
});

Then("não vê o campo de tags", async ({ page }) => {
  const d = page.getByRole("dialog", { name: "Transferir" });
  await expect(d.getByRole("button", { name: "+ Tag" })).toHaveCount(0);
  await expect(d.getByRole("combobox", { name: "Tags" })).toHaveCount(0);
});

When("Mariana troca para {string}", async ({ page }, _nome: string) => {
  await openDrawer(page);
  await page.getByRole("button", { name: "Nova Receita", exact: true }).click();
});

Then("vê a ação {string} no formulário", async ({ page }, nome: string) => {
  await expect(drawer(page).getByRole("button", { name: nome })).toBeVisible();
});

Given("o cartão {string} cadastrado para tags", async ({ world, page }, nome: string) => {
  world.data.card = await makeCard(world.family as never, {
    name: nome,
    owner: "Lucas",
    limitInCents: 1_000_000,
    closingDay: 25,
    dueDay: 5,
  });
  await reloadIfOpen(page); // o cache de cartões do drawer é do carregamento anterior
});

When(
  "Mariana lança {string} de {string} parcelado em {string} com a tag {string}",
  async ({ page, world }, desc: string, valor: string, parcelas: string, tag: string) => {
    const card = world.data.card as { name: string };
    await openDrawer(page);
    await fillAmount(page, valor);
    await pickCategory(page, "Supermercado");
    await page.getByLabel("Descrição (opcional)").fill(desc);
    const select = drawer(page).getByLabel("Pagar com", { exact: true });
    const value = await select
      .locator("option", { hasText: card.name })
      .first()
      .getAttribute("value");
    await select.selectOption(value as string);
    await drawer(page).getByLabel("Parcelas", { exact: true }).selectOption({ label: parcelas });
    await typeTags(page, [tag]);
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);

Then("as 10 parcelas mostram a tag {string}", async ({}, tag: string) => {
  const rows = await db.transaction.findMany({
    where: { installmentPlanId: { not: null } },
    include: { tags: { include: { tag: true } } },
  });
  expect(rows).toHaveLength(10);
  for (const r of rows) expect(r.tags.map((l) => l.tag.name)).toEqual([tag]);
});

Given("um lançamento {string} com a tag {string}", async ({ world }, desc: string, tag: string) => {
  const acc = await account(world);
  await makeTransaction(world.family as never, {
    account: { id: acc.id, name: acc.name, ownerMemberId: acc.ownerMemberId },
    category: "Lazer e restaurantes",
    amountInCents: 80000,
    occurredOn: "2026-10-03",
    author: "Mariana",
    payer: "Mariana",
    shared: false,
    description: desc,
    tags: [tag],
  });
});

async function abrirEdicaoDeTags(page: Page, desc: string) {
  await gotoReady(page, "/extrato");
  await page.getByTestId("ledger-row").filter({ hasText: desc }).first().click();
  await page.getByRole("button", { name: "Editar tags" }).click();
  return page.getByRole("dialog", { name: "Editar tags" });
}

When(
  "Mariana troca a tag de {string} para {string} e salva",
  async ({ page }, desc: string, nova: string) => {
    const d = await abrirEdicaoDeTags(page, desc);
    await d.getByRole("button", { name: /^Remover tag/ }).click();
    await typeTags(page, [nova], "page");
    await d.getByRole("button", { name: "Salvar tags" }).click();
    await expect(page.getByText("Tags atualizadas")).toBeVisible();
  },
);

Given(
  "a compra {string} de {string} em {string} sem tags",
  async ({ page, world }, desc: string, valor: string, parcelas: string) => {
    const category = await db.category.findFirstOrThrow({
      where: { familyId: world.family?.family.id, name: "Outros", kind: "EXPENSE" },
    });
    const card = world.data.card as { id: string };
    const res = await page.request.post("/api/v1/transactions", {
      headers: { origin: "http://localhost:3101", "idempotency-key": randomUUID() },
      data: {
        type: "EXPENSE",
        cardId: card.id,
        categoryId: category.id,
        amountInCents: parseBRL(valor) ?? 0,
        description: desc,
        installments: Number.parseInt(parcelas, 10),
      },
    });
    expect(res.status()).toBe(201);
  },
);

When(
  "Mariana adiciona a tag {string} à parcela {string}",
  async ({ page }, tag: string, parcela: string) => {
    await gotoReady(page, "/extrato?from=2026-10-01&to=2027-09-30");
    const [no] = parcela.split("/");
    const row = page
      .getByTestId("ledger-row")
      .filter({ hasText: new RegExp(`${no}/10`) })
      .first();
    await row.click();
    await page.getByRole("button", { name: "Editar tags" }).click();
    await typeTags(page, [tag], "page");
    await page
      .getByRole("dialog", { name: "Editar tags" })
      .getByRole("button", { name: "Salvar tags" })
      .click();
    await expect(page.getByText("Tags atualizadas")).toBeVisible();
  },
);

Given("que não há conexão para salvar", async ({ page }) => {
  await page.route("**/api/v1/transactions", (route) => {
    if (route.request().method() === "POST") return route.abort("failed");
    return route.continue();
  });
});

When("Mariana salva um lançamento com a tag {string}", async ({ page }, tag: string) => {
  await lancar(page, { valor: "R$ 50,00", categoria: "Saúde", tags: [tag], salvar: false });
  await save(page, "Salvar Despesa");
});

Then("a tag {string} continua no formulário", async ({ page }, tag: string) => {
  await expect(chipsOf(drawer(page).getByTestId("tag-chips"))).toHaveCount(0);
  await expect(drawer(page).getByTestId("tag-chips")).toContainText(tag);
});
