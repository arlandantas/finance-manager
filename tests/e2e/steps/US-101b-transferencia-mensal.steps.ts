import { expect, type Page, test } from "@playwright/test";
import { parseBRL } from "@/lib/money";
import { accountBalances } from "@/modules/contas/ledger-queries";
import { testDb } from "../../support/db";
import { makeAccount, makeFamily } from "../../support/factories";
import { gotoReady } from "../../support/nav";
import { Given, Then, When, type World } from "../support/fixtures";
import { setupFamily } from "../support/world";

// US-101b: telas da transferência mensal (série) e arquivamento de conta (spec 04b, ADR-037 §5).
const db = testDb();
const dlg = (p: Page) => p.getByRole("dialog");
const items = (p: Page) => p.getByTestId("planned-transfer-item");
const tab = (period: string) => `/previstas?tab=transferencias&period=${period}`;
const NEXT = tab("2027-01"); // a ocorrência de dezembro pode já estar efetivada (sem menu)
const money = (v: string) => (v.startsWith("R$") ? v.replace("R$ ", "") : v);
type Acct = Awaited<ReturnType<typeof makeAccount>>;
const acct = (w: World, n: string) => {
  const a = ((w.data.byAcct ?? {}) as Record<string, Acct>)[n];
  if (!a) throw new Error(`conta ${n} não semeada`);
  return a;
};

async function createSeriesInDialog(
  page: Page,
  amount: string,
  from: string,
  to: string,
  day: number,
) {
  await gotoReady(page, tab("2026-12"));
  await expect(page.getByTestId("period-label")).toHaveText("Dezembro de 2026");
  await page.getByRole("button", { name: "Nova transferência prevista" }).click();
  const d = dlg(page);
  await d.getByLabel("Valor", { exact: true }).fill(money(amount));
  await d.getByLabel("Conta de origem").selectOption({ label: from });
  await d.getByLabel("Conta de destino").selectOption({ label: to });
  await d
    .getByRole("radiogroup", { name: "Repetir", exact: true })
    .getByRole("radio", { name: "Todo mês", exact: true })
    .click();
  await expect(d.getByLabel("Vencimento")).toHaveCount(0);
  await d.getByLabel("Dia do mês", { exact: true }).fill(String(day));
  await d.getByRole("button", { name: "Salvar transferência mensal" }).click();
  await expect(d).toBeHidden();
}

async function seriesAction(page: Page, action: "Editar série" | "Encerrar série") {
  await gotoReady(page, NEXT);
  await expect(items(page)).toHaveCount(1);
  await items(page)
    .first()
    .getByRole("button", { name: /^Ações de/ })
    .click();
  await page.getByRole("menuitem", { name: action }).click();
}

Given("a conta {string} sem saldo", async ({ world }, name: string) => {
  const fam = await setupFamily(world);
  const a = await makeAccount(fam, { name, owner: "Mariana", openingBalanceInCents: 0 });
  ((world.data.byAcct ??= {}) as Record<string, Acct>)[name] = a;
});

Given(
  "uma transferência mensal de {string} de {string} para {string} criada por Mariana",
  async ({ world }, amount: string, from: string, to: string) => {
    const fam = await setupFamily(world);
    await db.recurringTransfer.create({
      data: {
        familyId: fam.family.id,
        fromAccountId: acct(world, from).id,
        toAccountId: acct(world, to).id,
        amountInCents: BigInt(parseBRL(amount) ?? 0),
        dayOfMonth: 15,
        startMonth: new Date("2026-12-01T00:00:00Z"),
        authorMemberId: fam.byName.Mariana?.memberId as string,
      },
    });
  },
);

Given("outra família com uma transferência mensal própria", async () => {
  const other = await makeFamily({ name: "Família Souza", uniqueEmails: true });
  const a = await makeAccount(other, { name: "Conta Souza A", openingBalanceInCents: 1000 });
  const b = await makeAccount(other, { name: "Conta Souza B", openingBalanceInCents: 0 });
  await db.recurringTransfer.create({
    data: {
      familyId: other.family.id,
      fromAccountId: a.id,
      toAccountId: b.id,
      amountInCents: 999n,
      dayOfMonth: 10,
      startMonth: new Date("2026-12-01T00:00:00Z"),
      authorMemberId: other.members[0]?.memberId as string,
    },
  });
});

When(
  "Mariana cadastra a transferência mensal de {string} de {string} para {string} no dia {int}",
  async ({ page, world }, amount: string, from: string, to: string, day: number) => {
    await createSeriesInDialog(page, amount, from, to, day);
    world.data.seriesFrom = from;
  },
);

When(/^(Mariana|Lucas) encerra a transferência mensal$/, async ({ page }, _who: string) => {
  await seriesAction(page, "Encerrar série");
  const d = dlg(page);
  await expect(d.getByTestId("end-transfer-series-impact")).toContainText("serão removidas");
  await d.getByRole("button", { name: "Encerrar série" }).click();
  await expect(d).toBeHidden();
});

When(
  /^(Mariana|Lucas) abre "Editar série" da transferência mensal$/,
  async ({ page }, _who: string) => {
    await seriesAction(page, "Editar série");
    await expect(dlg(page).getByTestId("transfer-series-impact")).toContainText("Muda");
  },
);

When(
  /^(Mariana|Lucas) salva a série com o valor \"([^\"]+)\"$/,
  async ({ page }, _who: string, amount: string) => {
    const d = dlg(page);
    await d.getByLabel("Valor", { exact: true }).fill(money(amount));
    await d.getByRole("button", { name: "Salvar série" }).click();
  },
);

When("Mariana altera a série enquanto Lucas edita", async ({ world }) => {
  const fam = await setupFamily(world);
  await db.recurringTransfer.updateMany({
    where: { familyId: fam.family.id },
    data: { version: { increment: 1 }, updatedByMemberId: fam.byName.Mariana?.memberId as string },
  });
});

When("Mariana arquiva a conta aberta", async ({ page }) => {
  await dlg(page).getByRole("button", { name: "Arquivar", exact: true }).click();
  await expect(dlg(page)).toBeHidden();
});

Then(
  "a aba de transferências lista {string} para {string} de {string} com o selo {string}",
  async ({ page }, from: string, to: string, v: string, selo: string) => {
    await expect(items(page)).toHaveCount(1);
    await expect(items(page).first()).toContainText(from);
    await expect(items(page).first()).toContainText(to);
    await expect(items(page).first()).toContainText(v);
    await expect(items(page).first()).toContainText(selo);
  },
);

Then(
  "a família tem {int} ocorrências mensais e os saldos de {string} e {string} seguem {string} e {string}",
  async ({ world }, n: number, a: string, b: string, va: string, vb: string) => {
    const fam = await setupFamily(world);
    expect(
      await db.plannedTransfer.count({
        where: { familyId: fam.family.id, seriesId: { not: null }, deletedAt: null },
      }),
    ).toBe(n);
    const bal = await accountBalances(db as never, fam.family.id);
    expect(bal.get(acct(world, a).id)).toBe(parseBRL(va));
    expect(bal.get(acct(world, b).id)).toBe(parseBRL(vb));
  },
);

Then("a família não tem ocorrência mensal pendente e a efetivada permanece", async ({ world }) => {
  const fam = await setupFamily(world);
  const where = { familyId: fam.family.id, seriesId: { not: null }, deletedAt: null };
  expect(await db.plannedTransfer.count({ where: { ...where, status: "PREVISTA" } })).toBe(0);
  expect(await db.plannedTransfer.count({ where: { ...where, status: "EFETIVADA" } })).toBe(1);
});

Then("o impacto da série mostra {string}", async ({ page }, text: string) => {
  await expect(dlg(page).getByTestId("transfer-series-impact")).toHaveText(text);
});

Then(
  "a ocorrência de janeiro de 2027 mostra {string} e a efetivada segue {string}",
  async ({ page }, jan: string, done: string) => {
    await expect(dlg(page)).toBeHidden();
    await gotoReady(page, NEXT);
    await expect(items(page).first()).toContainText(jan);
    await gotoReady(page, tab("2026-12"));
    await expect(items(page).first()).toContainText("Efetivada");
    await expect(items(page).first()).toContainText(done);
  },
);

Then("o botão de arquivar conta está habilitado", async ({ page }) => {
  await expect(dlg(page).getByTestId("archive-blocker")).toHaveCount(0);
  await expect(dlg(page).getByRole("button", { name: "Arquivar", exact: true })).toBeEnabled();
});

Then("a conta {string} está arquivada", async ({ world }, name: string) => {
  const fam = await setupFamily(world);
  const row = await db.bankAccount.findFirst({ where: { familyId: fam.family.id, name } });
  expect(row?.archivedAt).not.toBeNull();
});

Then("o aviso mostra {string}", async ({ page }, msg: string) => {
  await expect(dlg(page).getByRole("alert").getByText(msg)).toBeVisible();
});

When(
  "Mariana abre o cadastro da transferência mensal em 375px no tema escuro",
  async ({ page, world }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    world.data.consoleErrors = errors;
    await page.setViewportSize({ width: 375, height: 812 });
    await page.addInitScript(() => localStorage.setItem("fm:v1:theme", "dark"));
    await gotoReady(page, tab("2026-12"));
    await page.getByRole("button", { name: "Nova transferência prevista" }).click();
    const d = dlg(page);
    await d
      .getByRole("radiogroup", { name: "Repetir", exact: true })
      .getByRole("radio", { name: "Todo mês", exact: true })
      .click();
    await expect(d.getByLabel("Dia do mês", { exact: true })).toBeVisible();
    await d.getByRole("radio", { name: "Depois de N meses" }).click();
    await page.screenshot({ path: test.info().outputPath("us101b-cadastro-375-dark.png") });
    await d.getByLabel("Valor", { exact: true }).fill("500,00");
    await d.getByLabel("Quantos meses no total").fill("6");
    await d.getByRole("button", { name: "Salvar transferência mensal" }).click();
    await expect(d).toBeHidden();
    await expect(items(page)).toHaveCount(1);
    await page.screenshot({
      path: test.info().outputPath("us101b-lista-375-dark.png"),
      fullPage: true,
    });
    await gotoReady(page, NEXT);
    await items(page)
      .first()
      .getByRole("button", { name: /^Ações de/ })
      .click();
    await page.getByRole("menuitem", { name: "Editar série" }).click();
    await expect(dlg(page).getByTestId("transfer-series-impact")).toContainText("Muda 6");
    await page.screenshot({ path: test.info().outputPath("us101b-editar-375-dark.png") });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: test.info().outputPath("us101b-editar-desktop-dark.png") });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.keyboard.press("Escape");
    await expect(dlg(page)).toBeHidden();
  },
);
