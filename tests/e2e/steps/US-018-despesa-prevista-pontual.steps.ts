import { expect, type Page } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import {
  makeCard,
  makeCardPurchase,
  makeFamily,
  makePlannedExpense,
} from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { dlg } from "../support/categorias";
import { Given, Then, When, type World } from "../support/fixtures";
import {
  createPlannedViaUi,
  fillPlanned,
  openNewPlanned,
  openPrevistasOf,
  PERIOD_NOV,
  payableItem,
} from "../support/previstas";
import { setupFamily } from "../support/world";

const db = testDb();
const money = (v: string) => parseBRL(v) ?? 0;
const iso = (d: string, m: string, y: string) => `${y}-${m}-${d}`;

const names = async () =>
  new Map(
    (await db.member.findMany({ include: { user: true } })).map((m) => [
      m.id,
      (m.user.name ?? "").split(" ")[0] as string,
    ]),
  );

async function lastPlanned() {
  return db.plannedExpense.findFirstOrThrow({ orderBy: { createdAt: "desc" } });
}

When(
  /^Lucas cadastra "([^"]+)" de "([^"]+)" com vencimento em (\d{2})\/(\d{2})\/(\d{4}), categoria "([^"]+)" e responsável "([^"]+)"$/,
  async (
    { page, world },
    nome: string,
    valor: string,
    d: string,
    m: string,
    y: string,
    categoria: string,
    resp: string,
  ) => {
    await gotoReady(page, "/previstas");
    await createPlannedViaUi(page, {
      description: nome,
      amount: valor,
      category: categoria,
      responsible: resp,
      due: iso(d, m, y),
    });
    await expect(page.getByText("Despesa prevista cadastrada!")).toBeVisible();
    world.data.created = nome;
  },
);

When(
  /^Lucas cadastra "([^"]+)" de "([^"]+)" com vencimento em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page, world }, nome: string, valor: string, d: string, m: string, y: string) => {
    await gotoReady(page, "/previstas");
    await createPlannedViaUi(page, { description: nome, amount: valor, due: iso(d, m, y) });
    await expect(page.getByText("Despesa prevista cadastrada!")).toBeVisible();
    world.data.created = nome;
  },
);

Then(
  "a despesa prevista aparece em {string} de novembro com estado {string}",
  async ({ page }, _tela: string, estado: string) => {
    // Navegação no cliente (sem recarregar) para o aviso de sucesso continuar visível.
    await page.getByRole("button", { name: "Próximo mês" }).click();
    await expect(page.getByTestId("period-label")).toHaveText("Novembro de 2026");
    await expect(payableItem(page, "Condomínio")).toHaveCount(1);
    const row = await lastPlanned();
    expect(row.status).toBe(estado.toUpperCase());
  },
);

When("Lucas cadastra uma despesa prevista sem escolher o responsável", async ({ page }) => {
  await gotoReady(page, "/previstas");
  await createPlannedViaUi(page, { description: "Luz", amount: "R$ 100,00" });
  await expect(page.getByText("Despesa prevista cadastrada!")).toBeVisible();
});

Then("o responsável é {string}", async ({}, nome: string) => {
  expect((await names()).get((await lastPlanned()).responsibleMemberId)).toBe(nome);
});

When(
  "Lucas cadastra {string} de {string} com responsável {string}",
  async ({ page }, nome: string, valor: string, resp: string) => {
    await gotoReady(page, "/previstas");
    await createPlannedViaUi(page, { description: nome, amount: valor, responsible: resp });
    await expect(page.getByText("Despesa prevista cadastrada!")).toBeVisible();
  },
);

Then(
  "o responsável pelo pagamento é {string} e o autor é {string}",
  async ({}, resp: string, autor: string) => {
    const row = await lastPlanned();
    const n = await names();
    expect(n.get(row.responsibleMemberId)).toBe(resp);
    expect(n.get(row.authorMemberId)).toBe(autor);
  },
);

Then("a despesa não aparece no extrato", async ({ page }) => {
  await gotoReady(page, "/extrato");
  await expect(page.getByTestId("ledger-row")).toHaveCount(0);
  await gotoReady(page, "/extrato?period=2026-11");
  await expect(page.getByTestId("ledger-row")).toHaveCount(0);
});

Then("o total de despesas do mês não muda", async ({ page }) => {
  await gotoReady(page, "/extrato");
  await expect(page.getByTestId("totals-expense")).toHaveText(normalizeSpaces("R$ 0,00"));
});

Then("o acerto de contas não muda", async ({ page }) => {
  const res = await page.request.get("/api/v1/settlement");
  const body = (await res.json()) as { totalSharedInCents: number };
  expect(body.totalSharedInCents).toBe(0);
});

Then(
  "o item aparece com o destaque {string} e continua com estado {string}",
  async ({ page }, destaque: string, estado: string) => {
    await gotoReady(page, "/previstas");
    const item = payableItem(page, "Internet");
    await expect(item).toHaveCount(1);
    await expect(item.getByText(destaque, { exact: true })).toBeVisible();
    expect((await lastPlanned()).status).toBe(estado.toUpperCase());
  },
);

When("Lucas tenta salvar sem descrição, sem valor e sem categoria", async ({ page, world }) => {
  world.data.assertNothingCreated2 = true;
  await gotoReady(page, "/previstas");
  const d = await openNewPlanned(page);
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
});

Then("nada é cadastrado", async () => {
  expect(await db.plannedExpense.count()).toBe(0);
});

When("Lucas informa a descrição {string}", async ({ page }, descricao: string) => {
  await gotoReady(page, "/previstas");
  const d = await openNewPlanned(page);
  await fillPlanned(d, { description: descricao, amount: "R$ 100,00", category: "Moradia" });
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
});

Given("a despesa prevista {string} de {string}", async ({ world }, nome: string, valor: string) => {
  await makePlannedExpense(await setupFamily(world), {
    description: nome,
    amountInCents: money(valor),
    dueOn: "2026-11-10",
    responsible: "Lucas",
  });
});

async function openPlannedMenu(page: Page, title: string, item: string) {
  await page.getByRole("button", { name: `Ações de ${title}` }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

When(
  /^Lucas altera o valor para "([^"]+)" e o vencimento para (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page }, valor: string, d: string, m: string, y: string) => {
    await openPrevistasOf(page, PERIOD_NOV);
    await openPlannedMenu(page, "Condomínio", "Editar");
    const form = dlg(page, "Editar despesa prevista");
    await expect(form.getByLabel("Descrição", { exact: true })).toHaveValue("Condomínio");
    await fillPlanned(form, { amount: valor, due: iso(d, m, y) });
    await form.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Despesa prevista atualizada")).toBeVisible();
  },
);

Then(
  /^a previsão mostra "([^"]+)" com vencimento em (\d{2})\/(\d{2})\/(\d{4})$/,
  async ({ page }, valor: string, d: string, m: string, _y: string) => {
    const item = payableItem(page, "Condomínio");
    await expect(item).toContainText(normalizeSpaces(valor));
    await expect(item).toContainText(`Vence ${d}/${m}`);
  },
);

When(
  "Lucas toca em {string} e confirma {string}",
  async ({ page }, _acao: string, titulo: string) => {
    await openPrevistasOf(page, PERIOD_NOV);
    await openPlannedMenu(page, "Condomínio", "Excluir");
    const d = dlg(page, titulo);
    await expect(d).toBeVisible();
    await d.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByText("Despesa prevista excluída")).toBeVisible();
  },
);

Then("ela some de {string}", async ({ page }, _tela: string) => {
  await expect(payableItem(page, "Condomínio")).toHaveCount(0);
  expect(await db.plannedExpense.count({ where: { deletedAt: null } })).toBe(0);
});

Given(
  "que Lucas e Mariana abriram a edição da previsão {string}",
  async ({ world, page, browser }, nome: string) => {
    await makePlannedExpense(await setupFamily(world), {
      description: nome,
      amountInCents: 65000,
      dueOn: "2026-11-10",
      responsible: "Lucas",
    });
    await openPrevistasOf(page, PERIOD_NOV);
    await openPlannedMenu(page, nome, "Editar");
    await expect(dlg(page, "Editar despesa prevista")).toBeVisible();
    const ctx = await browser.newContext({
      baseURL: "http://localhost:3101",
      ...(page.viewportSize() ? { viewport: page.viewportSize() as never } : {}),
    });
    const marianaPage = await ctx.newPage();
    await loginAs(marianaPage, { email: "mariana@exemplo.com", name: "Mariana Silva" });
    await openPrevistasOf(marianaPage, PERIOD_NOV);
    await openPlannedMenu(marianaPage, nome, "Editar");
    await expect(dlg(marianaPage, "Editar despesa prevista")).toBeVisible();
    world.data.marianaPage = marianaPage;
    world.data.conflictCheck = async (mensagem: string) => {
      await expect(dlg(page, "Editar despesa prevista")).toContainText(mensagem);
      await ctx.close();
    };
  },
);

When("Mariana salva um novo valor", async ({ world }) => {
  const alt = world.data.conflictActions as { mariana: () => Promise<void> } | undefined;
  if (alt) return alt.mariana(); // US-016b (compra no cartão)
  const p = world.data.marianaPage as Page;
  const d = dlg(p, "Editar despesa prevista");
  await fillPlanned(d, { amount: "R$ 700,00" });
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(p.getByText("Despesa prevista atualizada")).toBeVisible();
});

When("Lucas tenta salvar outro valor", async ({ page, world }) => {
  const alt = world.data.conflictActions as { lucas: () => Promise<void> } | undefined;
  if (alt) return alt.lucas(); // US-016b (compra no cartão)
  const d = dlg(page, "Editar despesa prevista");
  await fillPlanned(d, { amount: "R$ 800,00" });
  await d.getByRole("button", { name: "Salvar", exact: true }).click();
});

Given(
  /^as previsões "([^"]+)" de "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4}) e "([^"]+)" de "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4})$/,
  async (
    { world },
    n1: string,
    v1: string,
    d1: string,
    m1: string,
    y1: string,
    n2: string,
    v2: string,
    d2: string,
    m2: string,
    y2: string,
  ) => {
    const fx = await setupFamily(world);
    await makePlannedExpense(fx, {
      description: n1,
      amountInCents: money(v1),
      dueOn: iso(d1, m1, y1),
      responsible: "Lucas",
    });
    await makePlannedExpense(fx, {
      description: n2,
      amountInCents: money(v2),
      dueOn: iso(d2, m2, y2),
      responsible: "Lucas",
    });
  },
);

When("Lucas abre {string} de novembro", async ({ page }, _tela: string) => {
  await openPrevistasOf(page, PERIOD_NOV);
});

Then("vê {string} antes de {string}", async ({ page }, a: string, b: string) => {
  await expect(page.getByTestId("payable-item")).toHaveCount(2);
  const titles = await page.getByTestId("payable-item").locator("p.font-semibold").allInnerTexts();
  expect(titles.indexOf(a)).toBeGreaterThanOrEqual(0);
  expect(titles.indexOf(a)).toBeLessThan(titles.indexOf(b));
});

Then("vê o total a pagar {string}", async ({ page }, total: string) => {
  await expect(page.getByTestId("payables-total")).toHaveText(normalizeSpaces(total));
});

Given(
  /^a previsão "([^"]+)" de "([^"]+)" atrasada, "([^"]+)" de "([^"]+)" com vencimento em (\d{2})\/(\d{2})\/(\d{4}) e "([^"]+)" de "([^"]+)" em (\d{2})\/(\d{2})\/(\d{4})$/,
  async (
    { world },
    n1: string,
    v1: string,
    n2: string,
    v2: string,
    d2: string,
    m2: string,
    y2: string,
    n3: string,
    v3: string,
    d3: string,
    m3: string,
    y3: string,
  ) => {
    const fx = await setupFamily(world);
    await makePlannedExpense(fx, {
      description: n1,
      amountInCents: money(v1),
      dueOn: "2026-10-20",
      responsible: "Lucas",
    });
    await makePlannedExpense(fx, {
      description: n2,
      amountInCents: money(v2),
      dueOn: iso(d2, m2, y2),
      responsible: "Lucas",
    });
    await makePlannedExpense(fx, {
      description: n3,
      amountInCents: money(v3),
      dueOn: iso(d3, m3, y3),
      responsible: "Lucas",
    });
  },
);

When("Lucas abre a Home", async ({ page }) => {
  await gotoReady(page, "/");
});

Then(
  /^o bloco "A pagar" mostra "([^"]+)" como atrasada e "([^"]+)" vencendo em (\d{2})\/(\d{2})$/,
  async ({ page }, atrasada: string, outra: string, d: string, m: string) => {
    const block = page.getByTestId("home-payables");
    await expect(block).toBeVisible();
    const late = block.getByTestId("home-payable").filter({ hasText: atrasada });
    await expect(late).toContainText("Atrasada");
    const other = block.getByTestId("home-payable").filter({ hasText: outra });
    await expect(other).toContainText(`vence ${d}/${m}`);
  },
);

Then("não mostra {string}, que vence depois de 7 dias", async ({ page }, nome: string) => {
  await expect(
    page.getByTestId("home-payables").getByTestId("home-payable").filter({ hasText: nome }),
  ).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Ver todas" })).toBeVisible();
});

Given(
  /^a fatura "([^"]+)" do cartão "([^"]+)" fechada com total "([^"]+)" e vencimento (\d{2})\/(\d{2})\/(\d{4})$/,
  async (
    { world },
    _ref: string,
    cartao: string,
    total: string,
    _d: string,
    _m: string,
    _y: string,
  ) => {
    const fx = await setupFamily(world);
    const card = await makeCard(fx, { name: cartao, owner: "Mariana", closingDay: 25, dueDay: 5 });
    await makeCardPurchase(fx, { card, amountInCents: money(total), occurredOn: "2026-10-10" });
  },
);

Then(
  /^vê o item "([^"]+)" de "([^"]+)" vencendo em (\d{2})\/(\d{2})$/,
  async ({ page }, titulo: string, valor: string, d: string, m: string) => {
    const item = payableItem(page, titulo);
    await expect(item).toHaveCount(1);
    await expect(item).toContainText(normalizeSpaces(valor));
    await expect(item).toContainText(`Vence ${d}/${m}`);
    await expect(item.getByRole("link", { name: "Ver fatura" })).toBeVisible();
  },
);

When(
  "Lucas cadastra a previsão {string} de {string} com {string} desligado",
  async ({ page }, nome: string, valor: string, _switch: string) => {
    await gotoReady(page, "/previstas");
    await createPlannedViaUi(page, { description: nome, amount: valor, shared: false });
    await expect(page.getByText("Despesa prevista cadastrada!")).toBeVisible();
  },
);

Then("a previsão fica marcada como {string}", async ({ page }, marcador: string) => {
  await expect(
    payableItem(page, "Plano de saúde de Lucas").getByText(marcador, { exact: true }),
  ).toBeVisible();
  expect((await lastPlanned()).isSharedExpense).toBe(false);
});

Given("que a família não tem despesas previstas", async ({ world }) => {
  await setupFamily(world);
  expect(await db.plannedExpense.count()).toBe(0);
});

When(
  "Lucas toca duas vezes rapidamente em {string} na nova previsão",
  async ({ page }, botao: string) => {
    await gotoReady(page, "/previstas");
    const d = await openNewPlanned(page);
    await fillPlanned(d, { description: "Condomínio", amount: "R$ 650,00", category: "Moradia" });
    await d.getByRole("button", { name: botao, exact: true }).dblclick();
    await expect(page.getByText("Despesa prevista cadastrada!")).toBeVisible();
  },
);

Then("apenas uma previsão é cadastrada", async () => {
  expect(await db.plannedExpense.count()).toBe(1);
});

When("Lucas cadastra uma despesa prevista", async ({ page }) => {
  await gotoReady(page, "/previstas");
  await createPlannedViaUi(page, { description: "Luz", amount: "R$ 100,00" });
  await expect(page.getByText("Despesa prevista cadastrada!")).toBeVisible();
});

Then("ela é cadastrada", async () => {
  expect(await db.plannedExpense.count()).toBe(1);
});

When("Lucas toca em {string} na nova previsão", async ({ page, world }, botao: string) => {
  await gotoReady(page, "/previstas");
  const d = await openNewPlanned(page);
  await fillPlanned(d, { description: "Condomínio", amount: "R$ 650,00", category: "Moradia" });
  await d.getByRole("button", { name: botao, exact: true }).click();
  world.data.formCheck = async () => {
    const dd = dlg(page, "Nova despesa prevista");
    await expect(dd.getByLabel("Descrição", { exact: true })).toHaveValue("Condomínio");
    await expect(dd.getByLabel("Valor previsto", { exact: true })).toHaveValue(/R\$\s650,00/);
    await expect(dd.getByRole("radio", { name: "Moradia", exact: true })).toBeChecked();
    expect(await db.plannedExpense.count()).toBe(0);
    await page.unroute("**/api/v1/**");
    await dd.getByRole("button", { name: botao, exact: true }).click();
    await expect(page.getByText("Despesa prevista cadastrada!")).toBeVisible();
    expect(await db.plannedExpense.count()).toBe(1);
  };
});

Given("a {string} com a previsão {string}", async ({}, familia: string, nome: string) => {
  const other = await makeFamily({
    name: familia,
    members: [{ email: "souza@exemplo.com", name: "Ana Souza", role: "ADMIN" }],
  });
  await makePlannedExpense(other, {
    description: nome,
    amountInCents: 100000,
    dueOn: "2026-10-30",
  });
});

Then("não vê a previsão {string}", async ({ page }, nome: string) => {
  await expect(page.getByText("Nenhuma conta a pagar neste mês")).toBeVisible();
  await expect(payableItem(page, nome)).toHaveCount(0);
});

void (null as unknown as World);
