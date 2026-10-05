import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { testDb } from "../../support/db";
import { makeFamily, makeTransaction } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { enterAs } from "../support/acerto";
import { openCartoes } from "../support/cartoes";
import { createCategoryViaUi, dlg, openCategorias, seedCategory } from "../support/categorias";
import { Given, Then, When } from "../support/fixtures";
import {
  drawer,
  fillAmount,
  openDrawer,
  pickCategory,
  save,
  waitSaved,
} from "../support/lancamento";
import { openPrevistas } from "../support/previstas";
import { ensureAccount, setupFamily } from "../support/world";

const db = testDb();
const kindOf = (w: string) => (w === "receita" ? "INCOME" : "EXPENSE");

Given(
  "a {string} com os membros {string} e {string}",
  async ({ world }, familia: string, _a: string, _b: string) => {
    await setupFamily(world, familia);
  },
);

Given(
  "a família tem as {int} categorias de despesa e as {int} de receita padrão",
  async ({ world }, despesas: number, receitas: number) => {
    const familyId = world.family?.family.id as string;
    expect(await db.category.count({ where: { familyId, kind: "EXPENSE" } })).toBe(despesas);
    expect(await db.category.count({ where: { familyId, kind: "INCOME" } })).toBe(receitas);
  },
);

When(
  "Lucas abre {string}, escolhe {string}, toca em {string}, informa {string}, escolhe o ícone de patinha e salva",
  async ({ page }, _tela: string, aba: string, _botao: string, nome: string) => {
    await openCategorias(page, aba as "Despesa");
    await createCategoryViaUi(page, nome, { icon: "Patinha" });
    await expect(page.getByText("Categoria criada")).toBeVisible();
  },
);

Then("a categoria {string} aparece na lista de despesas", async ({ page }, nome: string) => {
  await expect(page.getByTestId("category-item").filter({ hasText: nome })).toHaveCount(1);
});

Then("aparece como última opção na grade do drawer de nova despesa", async ({ page, world }) => {
  await ensureAccount(world);
  await gotoReady(page, "/");
  await openDrawer(page);
  const radios = drawer(page).getByRole("radiogroup", { name: "Categoria" }).getByRole("radio");
  await expect(radios.last()).toHaveAccessibleName("Pet");
});

Given("a categoria de despesa {string}", async ({ world }, nome: string) => {
  await seedCategory(world, { kind: "EXPENSE", name: nome });
});

Given("a categoria de despesa {string} arquivada", async ({ world }, nome: string) => {
  await seedCategory(world, { kind: "EXPENSE", name: nome, archived: true });
});

When(
  "Lucas lança {string} na categoria {string}",
  async ({ page, world }, valor: string, categoria: string) => {
    await ensureAccount(world);
    await gotoReady(page, "/");
    await openDrawer(page);
    await fillAmount(page, valor);
    await pickCategory(page, categoria);
    await save(page, "Salvar Despesa");
    await waitSaved(page);
  },
);

Then("a despesa é registrada na categoria {string}", async ({}, nome: string) => {
  const row = await db.transaction.findFirstOrThrow({
    where: { kind: "EXPENSE" },
    orderBy: { createdAt: "desc" },
    include: { category: true },
  });
  expect(row.category?.name).toBe(nome);
  expect(row.amountInCents).toBe(12000n);
});

When(
  /^Lucas cria a categoria de (despesa|receita) "([^"]*)"$/,
  async ({ page }, tipo: string, nome: string) => {
    await openCategorias(page, tipo === "receita" ? "Receita" : "Despesa");
    await createCategoryViaUi(page, nome);
    await expect(page.getByText("Categoria criada")).toBeVisible();
  },
);

Then("as duas categorias existem, cada uma no seu tipo", async ({ world }) => {
  const rows = await db.category.findMany({
    where: { familyId: world.family?.family.id as string, name: "Presentes" },
  });
  expect(rows.map((r) => r.kind).sort()).toEqual(["EXPENSE", "INCOME"]);
});

When(
  /^Lucas tenta criar a categoria de (despesa|receita) "([^"]*)"$/,
  async ({ page, world }, tipo: string, nome: string) => {
    world.data.assertNothingCreated = async () =>
      expect(
        await db.category.count({ where: { familyId: world.family?.family.id as string } }),
      ).toBe(11);
    await openCategorias(page, tipo === "receita" ? "Receita" : "Despesa");
    await createCategoryViaUi(page, nome);
  },
);

Then("vê {string} com a ação {string}", async ({ page }, mensagem: string, acao: string) => {
  const d = dlg(page, "Nova categoria");
  await expect(d.getByText(mensagem, { exact: true })).toBeVisible();
  await expect(d.getByRole("button", { name: acao })).toBeVisible();
});

When(
  "Lucas tenta criar uma categoria de despesa com o nome {string}",
  async ({ page }, nome: string) => {
    await openCategorias(page, "Despesa");
    await createCategoryViaUi(page, nome);
  },
);

When("Lucas tenta criar uma categoria com {int} caracteres", async ({ page }, n: number) => {
  await openCategorias(page, "Despesa");
  await createCategoryViaUi(page, "x".repeat(n));
});

Given(
  "uma despesa de {string} na categoria {string}",
  async ({ world }, valor: string, categoria: string) => {
    await makeTransaction(world.family as never, {
      account: await ensureAccount(world),
      category: categoria,
      amountInCents: parseBRL(valor) ?? 0,
      occurredOn: "2026-10-03",
      author: "Mariana",
      payer: "Mariana",
    });
  },
);

async function openCategoryMenu(page: Page, nome: string, item: string) {
  await page.getByRole("button", { name: `Ações da categoria ${nome}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

When(
  "Lucas renomeia a categoria {string} para {string}",
  async ({ page, world }, de: string, para: string) => {
    const cat = await db.category.findFirstOrThrow({
      where: { familyId: world.family?.family.id as string, name: de },
    });
    world.data.categoryId = cat.id;
    await openCategorias(page, "Despesa");
    await openCategoryMenu(page, de, "Renomear");
    const d = dlg(page, "Renomear categoria");
    await d.getByLabel("Nome", { exact: true }).fill(para);
    await d.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Categoria atualizada")).toBeVisible();
  },
);

Then(
  "a despesa de {string} passa a aparecer na categoria {string}",
  async ({ page }, valor: string, categoria: string) => {
    await gotoReady(page, "/extrato");
    const row = page.getByTestId("ledger-row").filter({ hasText: categoria });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(valor.replace(" ", " "));
  },
);

Then("o total gasto na categoria não muda", async ({ page, world }) => {
  const res = await page.request.get(
    `/api/v1/transactions?period=2026-10&categoryId=${world.data.categoryId as string}`,
  );
  const body = (await res.json()) as { totals: { expenseInCents: number } };
  expect(body.totals.expenseInCents).toBe(15050);
});

When("Lucas arquiva a categoria {string}", async ({ page, world }, nome: string) => {
  world.data.categoryId = (
    await db.category.findFirstOrThrow({
      where: { familyId: world.family?.family.id as string, name: nome },
    })
  ).id;
  await openCategorias(page, "Despesa");
  await openCategoryMenu(page, nome, "Arquivar");
  await expect(page.getByText("Categoria arquivada")).toBeVisible();
});

Then("ela some da grade do drawer de nova despesa", async ({ page, world }) => {
  await ensureAccount(world);
  await gotoReady(page, "/");
  await openDrawer(page);
  const radios = drawer(page).getByRole("radiogroup", { name: "Categoria" }).getByRole("radio");
  await expect(radios.first()).toBeVisible();
  await expect(radios.filter({ hasText: "Lazer e restaurantes" })).toHaveCount(0);
  await page.keyboard.press("Escape");
});

Then(
  "a despesa de {string} continua no extrato com a categoria {string}",
  async ({ page }, _valor: string, categoria: string) => {
    await gotoReady(page, "/extrato");
    await expect(page.getByTestId("ledger-row").filter({ hasText: categoria })).toHaveCount(1);
  },
);

Then("o filtro de categoria do extrato ainda lista {string}", async ({ page }, rotulo: string) => {
  const toggle = page.getByRole("button", { name: /^Filtros/ });
  if (await toggle.isVisible()) await toggle.click();
  const select = page.getByLabel(/^Categoria(:|$)/).first();
  await expect(select.locator("option", { hasText: rotulo })).toHaveCount(1);
});

When("Lucas reativa a categoria", async ({ page }) => {
  await openCategorias(page, "Despesa");
  await page.getByText(/^Arquivadas \(/).click();
  await page.getByRole("button", { name: /^Reativar/ }).click();
  await expect(page.getByText("Categoria reativada")).toBeVisible();
});

Then("ela volta à grade do drawer de nova despesa", async ({ page, world }) => {
  await ensureAccount(world);
  await gotoReady(page, "/");
  await openDrawer(page);
  const radios = drawer(page).getByRole("radiogroup", { name: "Categoria" }).getByRole("radio");
  await expect(radios.filter({ hasText: "Lazer e restaurantes" })).toHaveCount(1);
});

Given("que só resta a categoria de receita {string} ativa", async ({ world }, nome: string) => {
  await db.category.updateMany({
    where: {
      familyId: world.family?.family.id as string,
      kind: "INCOME",
      name: { not: nome },
    },
    data: { archivedAt: new Date() },
  });
});

When("Lucas tenta arquivá-la", async ({ page }) => {
  await openCategorias(page, "Receita");
  await openCategoryMenu(page, "Salário", "Arquivar");
});

Then("a categoria continua ativa", async ({ world }) => {
  const row = await db.category.findFirstOrThrow({
    where: { familyId: world.family?.family.id as string, name: "Salário" },
  });
  expect(row.archivedAt).toBeNull();
});

Given("que a família tem {int} categorias de despesa", async ({ world }, total: number) => {
  const familyId = world.family?.family.id as string;
  const current = await db.category.count({ where: { familyId, kind: "EXPENSE" } });
  await db.category.createMany({
    data: Array.from({ length: total - current }, (_, i) => ({
      familyId,
      kind: "EXPENSE" as const,
      name: `Extra ${i + 1}`,
      icon: "package",
      sortOrder: 100 + i,
    })),
  });
});

When("Lucas tenta criar mais uma", async ({ page }) => {
  await openCategorias(page, "Despesa");
  await createCategoryViaUi(page, "Mais uma");
});

Given(
  "que Lucas e Mariana abriram a edição da categoria {string}",
  async ({ world, page, browser }, nome: string) => {
    await openCategorias(page, "Despesa");
    await openCategoryMenu(page, nome, "Renomear");
    const ctx = await browser.newContext({
      baseURL: "http://localhost:3101",
      ...(page.viewportSize() ? { viewport: page.viewportSize() as never } : {}),
    });
    const marianaPage = await ctx.newPage();
    await loginAs(marianaPage, { email: "mariana@exemplo.com", name: "Mariana Silva" });
    await gotoReady(marianaPage, "/categorias");
    await marianaPage.getByRole("button", { name: `Ações da categoria ${nome}` }).click();
    await marianaPage.getByRole("menuitem", { name: "Renomear" }).click();
    await expect(dlg(marianaPage, "Renomear categoria")).toBeVisible();
    world.data.marianaPage = marianaPage;
    // Verificação do passo comum "Lucas vê {string}" (common.steps.ts): conflito mostrado no drawer.
    world.data.conflictCheck = async (mensagem: string) => {
      await expect(dlg(page, "Renomear categoria")).toContainText(mensagem);
      await marianaPage.context().close();
    };
  },
);

When("Mariana renomeia para {string} e salva", async ({ world }, nome: string) => {
  const p = world.data.marianaPage as Page;
  const d = dlg(p, "Renomear categoria");
  await d.getByLabel("Nome", { exact: true }).fill(nome);
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(p.getByText("Categoria atualizada")).toBeVisible();
});

When("Lucas tenta renomear para {string} e salvar", async ({ page }, nome: string) => {
  const d = dlg(page, "Renomear categoria");
  await d.getByLabel("Nome", { exact: true }).fill(nome);
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
});

Given("que Lucas é {string} e não {string}", async ({ world }, _papel: string, _outro: string) => {
  const lucas = world.family?.byName.Lucas;
  expect(lucas?.role).toBe("MEMBER");
});

Then("a categoria é criada", async ({ world }) => {
  expect(
    await db.category.count({
      where: { familyId: world.family?.family.id as string, name: "Pet" },
    }),
  ).toBe(1);
});

When("Lucas toca em {string} na nova categoria", async ({ page, world }, botao: string) => {
  await openCategorias(page, "Despesa");
  await createCategoryViaUi(page, "Pet", { save: false });
  await dlg(page, "Nova categoria").getByRole("button", { name: botao, exact: true }).click();
  world.data.formCheck = async () => {
    const d = dlg(page, "Nova categoria");
    await expect(d.getByLabel("Nome", { exact: true })).toHaveValue("Pet");
    expect(await db.category.count({ where: { name: "Pet" } })).toBe(0);
    // Reenvio com a mesma chave cria uma única categoria quando a rede volta.
    await page.unroute("**/api/v1/**");
    await d.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Categoria criada")).toBeVisible();
    expect(await db.category.count({ where: { name: "Pet" } })).toBe(1);
  };
});

Given("a {string} com a categoria {string}", async ({}, familia: string, categoria: string) => {
  const other = await makeFamily({
    name: familia,
    members: [{ email: "souza@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
  });
  await db.category.create({
    data: {
      familyId: other.family.id,
      kind: "EXPENSE",
      name: categoria,
      icon: "package",
      sortOrder: 99,
    },
  });
});

When("Lucas abre {string}", async ({ page, world }, tela: string) => {
  await enterAs(world, page, "Lucas");
  if (tela === "Cartões") await openCartoes(page);
  else if (tela === "Contas a pagar") await openPrevistas(page);
  else await openCategorias(page, "Despesa");
});

Then("não vê a categoria {string} da outra família", async ({ page }, nome: string) => {
  await expect(page.getByTestId("category-item").first()).toBeVisible();
  await expect(page.getByTestId("category-item").filter({ hasText: nome })).toHaveCount(0);
});
