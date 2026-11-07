import { expect, type Page, test } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { normalizeSpaces } from "../../support/constants";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import { setupFamily } from "../support/world";

// US-100b: telas da transferência prevista (spec 04b, ADR-037).
const db = testDb();
type Acct = Awaited<ReturnType<typeof makeAccount>>;
const accts = (w: World) => (w.data.byAcct ??= {}) as Record<string, Acct>;
const cents = (v: string) => parseBRL(v) ?? 0;
const dlg = (p: Page) => p.getByRole("dialog");
const items = (p: Page) => p.getByTestId("planned-transfer-item");
const TAB = "/previstas?tab=transferencias&period=2026-12";

async function account(world: World, name: string, balance: number) {
  const fam = await setupFamily(world);
  const a = await makeAccount(fam, { name, owner: "Mariana", openingBalanceInCents: balance });
  accts(world)[name] = a;
  return a;
}

async function seed(
  world: World,
  o: { amount: string; from: string; to: string; dueOn: string; family?: never },
) {
  const fam = await setupFamily(world);
  const from = accts(world)[o.from];
  const to = accts(world)[o.to];
  if (!from || !to) throw new Error("conta não semeada");
  await db.plannedTransfer.create({
    data: {
      familyId: fam.family.id,
      fromAccountId: from.id,
      toAccountId: to.id,
      amountInCents: BigInt(cents(o.amount)),
      dueOn: new Date(`${o.dueOn}T00:00:00Z`),
      authorMemberId: fam.members[0]?.memberId as string,
    },
  });
}

const row = (page: Page, name: string) =>
  page
    .getByTestId("by-account-row")
    .filter({ has: page.getByTestId("by-account-name").getByText(name, { exact: true }) });

async function openTab(page: Page) {
  await gotoReady(page, TAB);
  await expect(page.getByTestId("period-label")).toHaveText("Dezembro de 2026");
}

Given(
  "as contas {string} com {string} e {string} com {string} para transferir",
  async ({ world }, a: string, va: string, b: string, vb: string) => {
    await account(world, a, cents(va));
    await account(world, b, cents(vb));
  },
);

Given(
  "uma transferência prevista de {string} de {string} para {string} vencendo em {string}",
  async ({ world }, amount: string, from: string, to: string, dueOn: string) => {
    await seed(world, { amount, from, to, dueOn });
  },
);

Given(
  "uma transferência prevista de {string} de {string} para {string} vencida em {string}",
  async ({ world }, amount: string, from: string, to: string, dueOn: string) => {
    await seed(world, { amount, from, to, dueOn });
  },
);

Given(
  "a conta {string} sem saldo e uma transferência prevista de {string} de {string} para {string} vencendo em {string}",
  async ({ world }, name: string, amount: string, from: string, to: string, dueOn: string) => {
    await account(world, name, 0);
    await seed(world, { amount, from, to, dueOn });
  },
);

Given("outra família com uma transferência prevista própria", async () => {
  const other = await makeFamily({ name: "Família Souza", uniqueEmails: true });
  const a = await makeAccount(other, { name: "Conta Souza A", openingBalanceInCents: 1000 });
  const b = await makeAccount(other, { name: "Conta Souza B", openingBalanceInCents: 0 });
  await db.plannedTransfer.create({
    data: {
      familyId: other.family.id,
      fromAccountId: a.id,
      toAccountId: b.id,
      amountInCents: 999n,
      dueOn: new Date("2026-12-10T00:00:00Z"),
      authorMemberId: other.members[0]?.memberId as string,
    },
  });
});

When(
  "Mariana prevê a transferência de {string} de {string} para {string} vencendo em {string}",
  async ({ page }, amount: string, from: string, to: string, dueOn: string) => {
    await openTab(page);
    await page.getByRole("button", { name: "Nova transferência prevista" }).click();
    const d = dlg(page);
    await expect(d.getByTestId("planned-transfer-effect")).toHaveText(
      "Não muda nenhum saldo até você efetivar",
    );
    await d.getByLabel("Valor", { exact: true }).fill(amount.replace("R$ ", ""));
    await d.getByLabel("Conta de origem").selectOption({ label: from });
    await d.getByLabel("Conta de destino").selectOption({ label: to });
    await d.getByLabel("Vencimento").fill(dueOn);
    await d.getByRole("button", { name: "Salvar transferência prevista" }).click();
    await expect(d).toBeHidden();
  },
);

When("Mariana abre o resumo por conta de dezembro", async ({ page }) => {
  await gotoReady(page, "/previstas?period=2026-12");
  await expect(page.getByTestId("by-account")).toBeVisible();
});

When(
  /^(Mariana|Lucas) abre a aba de transferências de dezembro$/,
  async ({ page, world }, who: string) => {
    if (who === "Lucas") await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
    world.data.loggedAs = who;
    await openTab(page);
  },
);

When(/^(?:Mariana|Lucas) efetiva a transferência prevista pela tela$/, async ({ page, world }) => {
  await openTab(page);
  await items(page)
    .first()
    .getByRole("button", { name: /^Efetivar/ })
    .click();
  const d = dlg(page);
  await expect(d.getByRole("heading", { name: "Efetivar transferência" })).toBeVisible();
  await expect(d.getByLabel("Valor", { exact: true })).toHaveValue(/1\.000,00|700,00|500,00/);
  await d.getByRole("button", { name: "Efetivar", exact: true }).click();
  await expect(d).toBeHidden();
  world.data.realized = true;
});

When("Mariana desfaz a transferência no Extrato", async ({ page }) => {
  await gotoReady(page, "/extrato?period=2026-12");
  await page.getByTestId("ledger-row").filter({ hasText: "Transferência" }).first().click();
  await page.getByRole("button", { name: "Desfazer transferência" }).click();
  await dlg(page).getByRole("button", { name: "Desfazer transferência" }).last().click();
  await expect(page.getByRole("heading", { name: "Desfazer transferência?" })).toBeHidden();
});

When("Mariana exclui a transferência prevista", async ({ page }) => {
  await items(page)
    .first()
    .getByRole("button", { name: /^Ações de/ })
    .click();
  await page.getByRole("menuitem", { name: "Excluir" }).click();
  await dlg(page).getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(dlg(page)).toBeHidden();
});

When("Mariana abre o arquivamento da conta {string}", async ({ page }, n: string) => {
  await gotoReady(page, "/contas");
  const card = page.locator("li").filter({ hasText: n }).first();
  await card.getByRole("button", { name: new RegExp(`Ações d.* ${n}`) }).click();
  await page.getByRole("menuitem", { name: "Arquivar" }).click();
  await expect(dlg(page).getByRole("button", { name: "Arquivar", exact: true })).toBeVisible();
});

Then(
  "a aba de transferências lista {string} para {string} de {string} sem selo",
  async ({ page }, from: string, to: string, v: string) => {
    const it = items(page);
    await expect(it).toHaveCount(1);
    await expect(it.first()).toContainText(from);
    await expect(it.first()).toContainText(to);
    await expect(it.first()).toContainText(v);
    await expect(it.first()).not.toContainText("Atrasada");
    await expect(it.first()).not.toContainText("Efetivada");
  },
);

Then(
  "a aba de transferências lista só {string} para {string} de {string}",
  async ({ page }, from: string, to: string, v: string) => {
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText(from);
    await expect(items(page).first()).toContainText(to);
    await expect(items(page).first()).toContainText(v);
    await expect(page.getByText("Conta Souza")).toHaveCount(0);
  },
);

Then("o total de {string} de dezembro é {string}", async ({ page }, _t: string, v: string) => {
  await gotoReady(page, "/previstas?period=2026-12");
  await expect(page.getByTestId("payables-total")).toHaveText(normalizeSpaces(v));
});

Then(
  "{string} mostra transferências previstas {string} e previsto {string}",
  async ({ page }, name: string, transfers: string, projected: string) => {
    await gotoReady(page, "/previstas?period=2026-12");
    await expect(row(page, name).getByTestId("by-account-transfers")).toHaveText(
      normalizeSpaces(transfers),
    );
    await expect(row(page, name).getByTestId("by-account-projected")).toHaveText(
      normalizeSpaces(projected),
    );
  },
);

Then("a coluna de transferências previstas não aparece", async ({ page }) => {
  await gotoReady(page, "/previstas?period=2026-12");
  await expect(page.getByTestId("by-account")).toBeVisible();
  await expect(page.getByTestId("by-account-transfers")).toHaveCount(0);
  await expect(page.getByText("Transferências previstas", { exact: true })).toHaveCount(0);
});

Then(
  "a transferência prevista aparece {string} sem ações de edição",
  async ({ page }, selo: string) => {
    const it = items(page).first();
    await expect(it).toContainText(selo);
    await expect(it.getByRole("button", { name: /^Efetivar/ })).toHaveCount(0);
    await expect(it.getByRole("button", { name: /^Ações de/ })).toHaveCount(0);
    await expect(it.getByRole("link", { name: "Ver transferência" })).toBeVisible();
  },
);

Then("a transferência prevista aparece {string}", async ({ page }, selo: string) => {
  await expect(items(page).first()).toContainText(selo);
});

Then("a transferência prevista volta a ficar pendente", async ({ page }) => {
  await gotoReady(page, TAB);
  const it = items(page).first();
  await expect(it).not.toContainText("Efetivada");
  await expect(it.getByRole("button", { name: /^Efetivar/ })).toBeVisible();
});

Then("a aba de transferências está vazia", async ({ page }) => {
  await expect(items(page)).toHaveCount(0);
  await expect(page.getByText(/Nenhuma transferência prevista neste mês/)).toBeVisible();
});

Then("o diálogo mostra {string}", async ({ page }, msg: string) => {
  await expect(dlg(page).getByTestId("archive-blocker").getByText(msg)).toBeVisible();
});

Then("o botão de arquivar conta está desabilitado", async ({ page }) => {
  await expect(dlg(page).getByRole("button", { name: "Arquivar", exact: true })).toBeDisabled();
});

Then(
  "a lista e a coluna de transferências mostram {string} e nenhum número",
  async ({ page }, mask: string) => {
    await expect(items(page).first()).toContainText(mask);
    expect(await items(page).first().innerText()).not.toMatch(/\d{1,3}(\.\d{3})*,\d{2}/);
    await gotoReady(page, "/previstas?period=2026-12");
    const col = page.getByTestId("by-account-transfers").first();
    await expect(col).toContainText(mask);
    expect(await page.getByTestId("by-account").innerText()).not.toMatch(/\d{1,3}(\.\d{3})*,\d{2}/);
  },
);

When(
  "Mariana abre a aba de transferências de dezembro em 375px no tema escuro",
  async ({ page, world }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    world.data.consoleErrors = errors;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(() => localStorage.setItem("fm:v1:theme", "dark"));
    await openTab(page);
    await expect(items(page)).toHaveCount(1);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    // drawer de cadastro aberto também sem erro
    await page.getByRole("button", { name: "Nova transferência prevista" }).click();
    await expect(dlg(page).getByTestId("planned-transfer-effect")).toBeVisible();
    await page.screenshot({ path: test.info().outputPath("us100b-drawer-375-dark.png") });
    await page.keyboard.press("Escape");
    await expect(dlg(page)).toBeHidden();
    await page.screenshot({
      path: test.info().outputPath("us100b-lista-375-dark.png"),
      fullPage: true,
    });
  },
);

Then(
  "a tela de transferências não tem rolagem horizontal nem erros de console",
  async ({ page, world }) => {
    expect(world.data.consoleErrors).toEqual([]);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  },
);
