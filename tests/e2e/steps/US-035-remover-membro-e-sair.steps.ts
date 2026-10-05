import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makePlannedExpense, makeTransaction } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { addExpense, family, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const NB = (s: string) => s.replace(/R\$ /g, "R$ ");
const dlg = (p: Page) => p.getByRole("dialog");
async function pick(select: ReturnType<Page["locator"]>, who: string) {
  const value = await select.locator("option", { hasText: who }).first().getAttribute("value");
  await select.selectOption(value as string);
}

async function familia(world: World, page: Page, who: "Mariana" | "Lucas") {
  await loginAs(page, { email: `${who.toLowerCase()}@exemplo.com`, name: `${who} Silva` });
  world.data.loggedAs = who;
  await gotoReady(page, "/familia");
  await expect(page.getByTestId("family-title")).toBeVisible();
}

Given(
  'a família da remoção com a conta "Itaú Lucas" de Lucas zerada e a previsão "Plano de saúde" de Lucas',
  async ({ world }) => {
    await setupCouple(world);
    const fx = family(world);
    // "Itaú Lucas" do contexto de teste (titular Lucas, saldo inicial R$ 5.000,00): zera o saldo
    const itau = (world.data.accounts as { itau: never }).itau;
    world.data.itauL = itau;
    await makeTransaction(fx, {
      account: itau,
      category: "Moradia",
      amountInCents: 500000,
      occurredOn: "2026-10-01",
      author: "Lucas",
      payer: "Lucas",
      shared: false,
    });
    await makePlannedExpense(fx, {
      description: "Plano de saúde",
      amountInCents: 30000,
      dueOn: "2026-10-20",
      responsible: "Lucas",
    });
  },
);
Given("uma despesa da remoção de {string} paga por Lucas", async ({ world }, v: string) => {
  const acc = (world.data.accounts as { nubank: never }).nubank;
  await makeTransaction(family(world), {
    account: acc,
    category: "Supermercado",
    amountInCents: Math.round(Number(v.replace(/[^\d,]/g, "").replace(",", ".")) * 100),
    occurredOn: "2026-10-03",
    author: "Lucas",
    payer: "Lucas",
    shared: false,
    description: "Compra de Lucas",
  });
});
Given(
  "que a conta {string} tem saldo {string} na remoção",
  async ({ world }, _n: string, v: string) => {
    const acc = world.data.itauL as never;
    await makeTransaction(family(world), {
      account: acc,
      type: "INCOME",
      category: "Salário",
      amountInCents: Math.round(Number(v.replace(/[^\d,]/g, "").replace(",", ".")) * 100),
      occurredOn: "2026-10-02",
      author: "Lucas",
    });
  },
);
Given("uma diferença da remoção de {string} em outubro de 2026", async ({ world }, v: string) => {
  const cents = Math.round(Number(v.replace(/[^\d,]/g, "").replace(",", ".")) * 200);
  await addExpense(world, "Mariana", `R$ ${(cents / 100).toFixed(2).replace(".", ",")}`, {
    occurredOn: "2026-10-02",
  });
});

When("Mariana abre o diálogo de remoção de {string}", async ({ world, page }, n: string) => {
  await familia(world, page, "Mariana");
  await page
    .getByTestId("member-row")
    .filter({ hasText: n })
    .getByRole("button", { name: `Ações de ${n}` })
    .click();
  await page.getByRole("menuitem", { name: "Remover" }).click();
  await expect(dlg(page)).toBeVisible();
});
Then("a revisão mostra {string} e {string}", async ({ page }, a: string, b: string) => {
  const r = page.getByTestId("removal-review");
  await expect(r).toContainText(
    a.replace("1 conta de Lucas será arquivada", "1 conta de Lucas será arquivada"),
  );
  await expect(r).toContainText(b);
});
Then("a revisão mostra {string}", async ({ page }, t: string) => {
  await expect(page.getByTestId("removal-review")).toContainText(NB(t));
});
When("Mariana avança e confirma digitando {string}", async ({ page }, t: string) => {
  await dlg(page).getByRole("button", { name: "Continuar" }).click();
  await dlg(page).getByLabel("Confirmação").fill(t);
  await dlg(page).getByRole("button", { name: "Remover membro" }).click();
});
Then("vê o aviso de remoção {string}", async ({ page }, t: string) => {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: t })).toBeVisible();
});
Then("{string} aparece em {string}", async ({ page }, n: string, _s: string) => {
  await expect(page.getByTestId("ex-member").filter({ hasText: n })).toBeVisible();
});
Then("o Extrato mostra a despesa paga por {string}", async ({ page }, t: string) => {
  await gotoReady(page, "/extrato");
  await page.getByTestId("ledger-row").filter({ hasText: "Compra de Lucas" }).first().click();
  await expect(page.getByRole("dialog")).toContainText(t);
});
Then("o botão da remoção {string} fica desabilitado", async ({ page }, b: string) => {
  await expect(dlg(page).getByRole("button", { name: b })).toBeDisabled();
});
Then("o botão da remoção {string} fica habilitado", async ({ page }, b: string) => {
  await expect(dlg(page).getByRole("button", { name: b })).toBeEnabled();
});
When(
  "Mariana escolhe {string} como novo titular de {string}",
  async ({ page }, who: string, conta: string) => {
    await pick(dlg(page).getByLabel(`Novo titular de ${conta}`), who);
  },
);
When("Mariana marca {string}", async ({ page }, l: string) => {
  await dlg(page).getByLabel(l).check();
});

When("Mariana tenta sair da família", async ({ world, page }) => {
  await familia(world, page, "Mariana");
  await page
    .getByTestId("member-row")
    .filter({ hasText: "Mariana" })
    .getByRole("button", { name: "Ações de Mariana" })
    .click();
  await page.getByRole("menuitem", { name: "Sair da família" }).click();
});
Then("vê o bloqueio da remoção {string}", async ({ page }, t: string) => {
  await expect(page.getByTestId("removal-blocked")).toHaveText(t);
});
When(
  "Lucas sai da família escolhendo {string} para as previstas",
  async ({ world, page }, who: string) => {
    await familia(world, page, "Lucas");
    await page
      .getByTestId("member-row")
      .filter({ hasText: "Lucas" })
      .getByRole("button", { name: "Ações de Lucas" })
      .click();
    await page.getByRole("menuitem", { name: "Sair da família" }).click();
    await pick(dlg(page).getByLabel("Novo responsável pelas previstas"), who);
    await dlg(page).getByRole("button", { name: "Continuar" }).click();
    await dlg(page).getByLabel("Confirmação").fill("Sair");
    await dlg(page).getByRole("button", { name: "Sair da família" }).click();
  },
);
Then("vê o aviso na entrada {string}", async ({ page }, t: string) => {
  await expect(page).toHaveURL(/\/onboarding/);
  await expect(page.getByText(t)).toBeVisible();
});
Then("Lucas não consegue mais abrir a Home da família", async ({ page }) => {
  await gotoReady(page, "/");
  await expect(page).toHaveURL(/\/onboarding/);
});
When("Lucas abre o menu de {string} na tela Família", async ({ world, page }, n: string) => {
  await familia(world, page, "Lucas");
  await expect(page.getByRole("button", { name: `Ações de ${n}` })).toHaveCount(0);
});
Then("não vê a ação {string}", async ({ page }, a: string) => {
  await expect(page.getByRole("menuitem", { name: a })).toHaveCount(0);
});
Given("que Mariana removeu {string} pelo servidor", async ({ world }, _n: string) => {
  const lucas = await db.member.findFirstOrThrow({
    where: { user: { email: "lucas@exemplo.com" } },
  });
  const mari = await db.member.findFirstOrThrow({
    where: { user: { email: "mariana@exemplo.com" } },
  });
  await db.bankAccount.updateMany({
    where: { ownerMemberId: lucas.id },
    data: { archivedAt: new Date() },
  });
  await db.plannedExpense.updateMany({
    where: { responsibleMemberId: lucas.id },
    data: { responsibleMemberId: mari.id },
  });
  await db.member.update({
    where: { id: lucas.id },
    data: { removedAt: new Date(), removedByMemberId: mari.id, removalKind: "REMOVED" },
  });
  void world;
});
When("Lucas atualiza a tela", async ({ world, page }) => {
  await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
  world.data.loggedAs = "Lucas";
  await page.goto("/");
});
Then("Lucas vê a tela de login com {string}", async ({ page }, t: string) => {
  await expect(page).toHaveURL(/\/login\?error=MembershipEnded/);
  await expect(page.getByText(t)).toBeVisible();
});
