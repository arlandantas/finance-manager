import { expect, type Page } from "@playwright/test";
import { testDb } from "../../support/db";
import { makeTransaction } from "../../support/factories";
import { loginAs } from "../../support/login";
import { gotoReady } from "../../support/nav";
import { family, setupCouple } from "../support/acerto";
import { Given, Then, When, type World } from "../support/fixtures";

const db = testDb();
const NB = (s: string) => s.replace(/R\$ /g, "R$ ");
const dlg = (p: Page) => p.getByRole("dialog", { name: "Detalhe do lançamento" });

Given(
  "a família do detalhe com a despesa {string} de {string} paga por Lucas e Lucas na Home",
  async ({ world, page }, desc: string, v: string) => {
    await setupCouple(world);
    const acc = (world.data.accounts as { nubank: never }).nubank;
    const t = await makeTransaction(family(world), {
      account: acc,
      category: "Supermercado",
      amountInCents: Math.round(Number(v.replace(/[^\d,]/g, "").replace(",", ".")) * 100),
      occurredOn: "2026-10-03",
      author: "Lucas",
      payer: "Lucas",
      shared: false,
      description: desc,
    });
    world.data.txId = t.id;
    await loginAs(page, { email: "lucas@exemplo.com", name: "Lucas Silva" });
    world.data.loggedAs = "Lucas";
    await gotoReady(page, "/");
  },
);
Given("que a despesa foi corrigida uma vez por Mariana", async ({ world }) => {
  const id = world.data.txId as string;
  const t = await db.transaction.findUniqueOrThrow({ where: { id } });
  const mari = await db.member.findFirstOrThrow({
    where: { user: { email: "mariana@exemplo.com" } },
  });
  await db.transactionRevision.create({
    data: {
      familyId: t.familyId,
      transactionId: id,
      revision: 2,
      action: "UPDATE",
      actorMemberId: mari.id,
      changes: [{ field: "description", from: "Mercado", to: "Mercado do bairro" }],
    },
  });
  await db.transaction.update({ where: { id }, data: { version: 2, updatedByMemberId: mari.id } });
});

When("Lucas toca em {string} nos últimos lançamentos", async ({ page }, d: string) => {
  await page.reload();
  await page.waitForFunction(() => document.documentElement.dataset.hydrated === "1");
  await page
    .getByTestId("home-recent")
    .getByTestId("ledger-row")
    .filter({ hasText: d })
    .first()
    .click();
  await expect(dlg(page)).toBeVisible();
});
Then(
  "o detalhe mostra {string}, {string}, {string} e {string}",
  async ({ page }, a: string, b: string, c: string, d: string) => {
    for (const t of [a, b, c, d]) await expect(dlg(page)).toContainText(NB(t));
  },
);
Then("a Home continua aberta por trás com {string} no endereço", async ({ page }, p: string) => {
  await expect(page).toHaveURL(new RegExp(`/\\?${p}=`));
  await expect(page.getByTestId("home-summary")).toBeVisible();
});
Then(
  "vê os botões {string}, {string} e {string} do detalhe",
  async ({ page }, a: string, b: string, c: string) => {
    for (const n of [a, b, c])
      await expect(dlg(page).getByRole("button", { name: n, exact: true })).toBeVisible();
  },
);
When("Lucas segue o link {string} do detalhe", async ({ page }, t: string) => {
  await dlg(page).getByRole("link", { name: t }).click();
});
Then("o Extrato mostra {string} em destaque", async ({ page }, d: string) => {
  await expect(page).toHaveURL(/\/extrato\?.*highlight=/);
  await expect(page.locator("[data-highlighted='true']")).toContainText(d);
});
When("Lucas edita o valor do detalhe para {string}", async ({ page }, v: string) => {
  await dlg(page).getByRole("button", { name: "Editar", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Editar lançamento" });
  await form.getByLabel("Valor", { exact: true }).fill(v);
  await form.getByRole("button", { name: "Salvar alterações" }).click();
});
Then("o detalhe da Home mostra {string}", async ({ page }, v: string) => {
  await expect(dlg(page)).toContainText(NB(v));
});
When("Lucas exclui pelo detalhe", async ({ page }) => {
  await dlg(page).getByRole("button", { name: "Excluir", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Excluir lançamento?" })
    .getByRole("button", { name: "Excluir" })
    .click();
});
Then("{string} sai dos últimos lançamentos", async ({ page }, d: string) => {
  await expect(
    page.getByTestId("home-recent").getByTestId("ledger-row").filter({ hasText: d }),
  ).toHaveCount(0);
});
Then(
  "o aviso {string} tem {string} por pelo menos {int} segundos",
  async ({ page }, msg: string, acao: string, s: number) => {
    const toast = page.locator("[data-sonner-toast]").filter({ hasText: msg });
    await expect(toast).toBeVisible();
    await expect(toast.getByRole("button", { name: acao })).toBeVisible();
    await page.waitForTimeout((s - 1) * 1000);
    await expect(toast.getByRole("button", { name: acao })).toBeVisible();
  },
);
When("Lucas abre o histórico do detalhe", async ({ page }) => {
  await dlg(page).getByRole("button", { name: "Histórico", exact: true }).click();
});
Then("o histórico mostra uma alteração de {string}", async ({ page }, who: string) => {
  await expect(page.getByTestId("history-item").filter({ hasText: who })).toBeVisible();
});
When("Lucas abre o Extrato com destaque de um lançamento que não existe", async ({ page }) => {
  await gotoReady(page, "/extrato?highlight=00000000-0000-4000-8000-000000000000");
});
Then("o Extrato abre sem nenhum item em destaque", async ({ page }) => {
  await expect(page.getByTestId("ledger-row").first()).toBeVisible();
  await expect(page.locator("[data-highlighted='true']")).toHaveCount(0);
});
Then(
  "o detalhe não gera rolagem horizontal em 375 e 1280 px e os botões têm 44 px",
  async ({ page }) => {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      const ok = await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      );
      expect(ok, `${width}px`).toBe(true);
      for (const n of ["Editar", "Excluir", "Histórico"]) {
        const box = await dlg(page).getByRole("button", { name: n, exact: true }).boundingBox();
        expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
      }
    }
  },
);

export type { World };
